import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { crawlSite, siteChecks, detectTechnologies, type CrawledPage, type Issue, type Severity, type RenderFn } from "./crawler";
import { createRenderer, type Renderer } from "./renderer";
import { checkExternalLinks } from "./external-links";
import { technicalSiteChecks } from "./tech-checks";
import { auditSitemap, fetchSitemapUrls } from "./sitemap-audit";
import { detectCannibalization, type CannibalPage } from "./cannibalization";
import { detectNearDuplicates } from "./near-duplicate";
import { runAccessibilityAudit } from "./accessibility";
import { computeAiReadiness } from "./ai-readiness";
import { buildReportHtml, renderPdf, type ReportExtra, type ReportBrand } from "./report";

function computeHealth(pages: number, errors: number, warnings: number, notices: number): number {
  if (pages === 0) return 0;
  const penaltyPerPage = (errors * 3 + warnings * 1 + notices * 0.3) / pages;
  return Math.max(0, Math.min(100, Math.round(100 - penaltyPerPage * 10)));
}

function toRow(crawlId: string, p: CrawledPage): Prisma.CrawlPageCreateManyInput {
  return {
    crawlId,
    url: p.url.slice(0, 2048),
    statusCode: p.statusCode,
    title: p.title?.slice(0, 512) ?? null,
    titleLength: p.titleLength,
    metaDescription: p.metaDescription?.slice(0, 1024) ?? null,
    metaLength: p.metaLength,
    h1Count: p.h1Count,
    wordCount: p.wordCount,
    imagesNoAlt: p.imagesNoAlt,
    internalLinks: p.internalLinks,
    externalLinks: p.externalLinks,
    canonical: p.canonical?.slice(0, 2048) ?? null,
    depth: p.depth,
    loadMs: p.loadMs,
    issues: p.issues as unknown as Prisma.InputJsonValue,
    issueCodes: p.issues.map((i) => i.code),
    issueCount: p.issues.length,
  };
}

// Fetch + parse one PageSpeed strategy (mobile | desktop) into a rich report.
async function pagespeedFetch(url: string, strategy: "mobile" | "desktop", key: string | undefined) {
  const cats = ["performance", "accessibility", "best-practices", "seo"].map((c) => `category=${c}`).join("&");
  const endpoint =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}` +
    `&${cats}&strategy=${strategy}${key ? `&key=${key}` : ""}`;
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(endpoint, { signal: AbortSignal.timeout(90000) });
    } catch {
      res = null;
    }
    if (res?.ok) break;
    if (!res || res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    return null;
  }
  if (!res || !res.ok) return null;

  const data: any = await res.json().catch(() => null);
  const lh = data?.lighthouseResult;
  if (!lh) return null;
  const a = lh.audits ?? {};
  const round = (v: unknown) => (typeof v === "number" ? Math.round(v) : null);
  const scoreOf = (id: string) => {
    const s = lh.categories?.[id]?.score;
    return typeof s === "number" ? Math.round(s * 100) : null;
  };
  const num = (id: string) => (typeof a[id]?.numericValue === "number" ? a[id].numericValue : null);
  const clean = (s: string) => (s || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();

  const metric = (id: string) => ({
    value: num(id),
    display: a[id]?.displayValue ?? null,
    score: typeof a[id]?.score === "number" ? a[id].score : null,
  });
  const lab = {
    fcp: metric("first-contentful-paint"),
    lcp: metric("largest-contentful-paint"),
    cls: metric("cumulative-layout-shift"),
    tbt: metric("total-blocking-time"),
    speedIndex: metric("speed-index"),
    tti: metric("interactive"),
    ttfb: metric("server-response-time"),
  };

  const le = data.loadingExperience?.metrics ?? {};
  const fieldMetric = (k: string) => {
    const m = le[k];
    return m ? { percentile: m.percentile ?? null, category: m.category ?? null } : null;
  };
  const field = data.loadingExperience
    ? {
        overall: data.loadingExperience.overall_category ?? null,
        lcp: fieldMetric("LARGEST_CONTENTFUL_PAINT_MS"),
        inp: fieldMetric("INTERACTION_TO_NEXT_PAINT") || fieldMetric("EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT"),
        cls: fieldMetric("CUMULATIVE_LAYOUT_SHIFT_SCORE"),
        fcp: fieldMetric("FIRST_CONTENTFUL_PAINT_MS"),
        ttfb: fieldMetric("EXPERIMENTAL_TIME_TO_FIRST_BYTE"),
      }
    : null;

  const refs: any[] = lh.categories?.performance?.auditRefs ?? [];
  const diagGroup = new Set(refs.filter((r) => r.group === "diagnostics").map((r) => r.id));

  // Flatten a Lighthouse audit's details table into { headings, items } so the
  // UI can show exactly WHICH elements/links/resources are affected. Numeric
  // cells stay numbers (with a valueType) so the UI can format units + bars.
  const detailsOf = (audit: any): { headings: { key: string; label: string; valueType: string }[]; items: Record<string, string | number>[] } | null => {
    const d = audit?.details;
    if (!d || !Array.isArray(d.items) || d.items.length === 0) return null;
    const headings = (d.headings || [])
      .map((h: any) => ({ key: h.key || h.valueType || "", label: h.label || h.text || "", valueType: h.valueType || h.itemType || "text" }))
      .filter((h: any) => h.key);
    if (headings.length === 0) return null;
    const flat = (v: any): string | number => {
      if (v == null) return "";
      if (typeof v === "object") {
        if (v.type === "node") return v.nodeLabel || v.snippet || v.selector || "";
        if (v.type === "source-location" || v.url) return v.url || "";
        if (v.text != null) return String(v.text);
        if (v.value != null) return flat(v.value);
        return "";
      }
      if (typeof v === "number") return Math.round(v * 100) / 100;
      return String(v).slice(0, 400);
    };
    const items = d.items
      .slice(0, 100)
      .map((row: any) => {
        const o: Record<string, string | number> = {};
        for (const h of headings) o[h.key] = flat(row[h.key]);
        return o;
      })
      .filter((o: Record<string, string | number>) => Object.values(o).some((v) => v !== "" && v !== 0));
    return items.length ? { headings, items } : null;
  };

  // Opportunities: audits with actionable load-time savings.
  const opportunities = Object.values(a)
    .filter((x: any) => x?.details?.type === "opportunity" && (x?.details?.overallSavingsMs ?? 0) > 0)
    .map((x: any) => ({
      id: x.id,
      title: x.title,
      description: clean(x.description),
      savingsMs: round(x.details.overallSavingsMs),
      savingsBytes: round(x.details.overallSavingsBytes),
      score: typeof x.score === "number" ? x.score : null,
      details: detailsOf(x),
    }))
    .sort((p, q) => (q.savingsMs ?? 0) - (p.savingsMs ?? 0));
  const oppSet = new Set(opportunities.map((o) => o.id));

  // Diagnostics: the performance "diagnostics" group audits that failed or
  // carry a value, excluding anything already shown as an opportunity.
  const diagnostics = [...diagGroup]
    .map((id) => a[id])
    .filter((x: any) => {
      if (!x || oppSet.has(x.id)) return false;
      if (x.scoreDisplayMode === "notApplicable" || x.scoreDisplayMode === "manual") return false;
      return !!x.displayValue || (typeof x.score === "number" && x.score < 1);
    })
    .map((x: any) => ({
      id: x.id,
      title: x.title,
      description: clean(x.description),
      display: x.displayValue ?? null,
      score: typeof x.score === "number" ? x.score : null,
      details: detailsOf(x),
    }))
    .sort((p, q) => (p.score ?? 1) - (q.score ?? 1));

  // Failing audits from the other three categories (Accessibility, SEO, Best
  // Practices) — each with the specific affected elements.
  const CAT_LABEL: Record<string, string> = { accessibility: "Accessibility", seo: "SEO", "best-practices": "Best Practices" };
  const audits: any[] = [];
  for (const catId of ["accessibility", "seo", "best-practices"]) {
    const catRefs: any[] = lh.categories?.[catId]?.auditRefs ?? [];
    for (const r of catRefs) {
      const x = a[r.id];
      if (!x) continue;
      if (x.scoreDisplayMode === "notApplicable" || x.scoreDisplayMode === "manual" || x.scoreDisplayMode === "informative") continue;
      if (typeof x.score !== "number" || x.score >= 0.9) continue; // only failing
      audits.push({
        id: x.id,
        category: CAT_LABEL[catId],
        title: x.title,
        description: clean(x.description),
        display: x.displayValue ?? null,
        score: x.score,
        details: detailsOf(x),
      });
    }
  }
  audits.sort((p, q) => (p.score ?? 1) - (q.score ?? 1));

  const passedAudits = Object.values(a).filter((x: any) => typeof x?.score === "number" && x.score >= 0.9).length;

  return {
    scores: {
      performance: scoreOf("performance"),
      accessibility: scoreOf("accessibility"),
      bestPractices: scoreOf("best-practices"),
      seo: scoreOf("seo"),
    },
    lab,
    field,
    opportunities,
    diagnostics,
    audits,
    passedAudits,
  };
}

// Google PageSpeed Insights - best effort. Fetches BOTH mobile and desktop in
// parallel and returns a rich `pagespeed` blob plus the scalar Core Web Vitals
// (from mobile, Google's primary index) for backward compatibility.
async function runPageSpeed(url: string) {
  const key = process.env.PAGESPEED_API_KEY;
  const round = (v: unknown) => (typeof v === "number" ? Math.round(v) : null);
  try {
    const [mobile, desktop] = await Promise.all([
      pagespeedFetch(url, "mobile", key),
      pagespeedFetch(url, "desktop", key),
    ]);
    if (!mobile && !desktop) return null;
    const primary = mobile ?? desktop!;

    const pagespeed = {
      fetchedAt: new Date().toISOString(),
      mobile,
      desktop,
    };

    return {
      perfScore: primary.scores.performance ?? 0,
      lcpMs: round(primary.lab.lcp.value),
      clsScore: typeof primary.lab.cls.value === "number" ? Number(primary.lab.cls.value.toFixed(3)) : null,
      fcpMs: round(primary.lab.fcp.value),
      ttfbMs: round(primary.lab.ttfb.value),
      pagespeed: pagespeed as unknown as Prisma.InputJsonValue,
    };
  } catch {
    return null;
  }
}

type SummaryEntry = { severity: Severity; category: string; message: string; count: number };

@Injectable()
export class CrawlService implements OnModuleInit {
  private readonly logger = new Logger(CrawlService.name);
  // In-flight crawls we can cancel (crawlId -> AbortController).
  private readonly cancels = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // A crawl runs in-process; if the server restarts mid-crawl the DB row is left
  // stuck on RUNNING forever. On boot, no crawl can actually be running, so mark
  // any leftover RUNNING crawls as failed to unblock the UI.
  async onModuleInit() {
    try {
      const res = await this.prisma.crawl.updateMany({
        where: { status: "RUNNING" },
        data: { status: "FAILED", error: "Interrupted — the server restarted during this crawl.", finishedAt: new Date() },
      });
      if (res.count) this.logger.log(`recovered ${res.count} interrupted crawl(s) on startup`);
    } catch (e) {
      this.logger.error(`startup crawl recovery failed: ${String(e)}`);
    }
  }

  async start(project: { id: string; domain: string }, maxPages = 1000, byUserId?: string) {
    const startUrl = `https://${project.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
    // Supersede any crawl already running for this project (a stale/stuck one, or
    // a double-click) so the newest re-run always wins.
    await this.prisma.crawl.updateMany({
      where: { projectId: project.id, status: "RUNNING" },
      data: { status: "FAILED", error: "Superseded by a newer audit.", finishedAt: new Date() },
    });
    const crawl = await this.prisma.crawl.create({
      data: { projectId: project.id, status: "RUNNING", startUrl, maxPages },
    });
    // Keep only the latest few audits per project — avoids unbounded row growth
    // from repeated re-runs (which slows the "latest audit" lookup + history).
    void this.pruneOldCrawls(project.id, 5);
    void this.run(crawl.id, startUrl, maxPages, project.id, byUserId);
    return crawl;
  }

  private async pruneOldCrawls(projectId: string, keep: number) {
    try {
      const old = await this.prisma.crawl.findMany({
        where: { projectId },
        orderBy: { startedAt: "desc" },
        skip: keep,
        select: { id: true },
      });
      if (old.length) await this.prisma.crawl.deleteMany({ where: { id: { in: old.map((c) => c.id) } } });
    } catch { /* best-effort cleanup */ }
  }

  // Cancel the running audit for a project: stop the crawl and mark it cancelled.
  async cancel(projectId: string) {
    const crawl = await this.prisma.crawl.findFirst({
      where: { projectId, status: { in: ["RUNNING", "QUEUED"] } },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    if (!crawl) return { cancelled: false };
    this.cancels.get(crawl.id)?.abort();
    await this.prisma.crawl.update({
      where: { id: crawl.id },
      data: { status: "CANCELLED", error: "Canceled by user.", finishedAt: new Date() },
    });
    return { cancelled: true };
  }

  private async run(crawlId: string, startUrl: string, maxPages: number, projectId?: string, byUserId?: string) {
    const controller = new AbortController();
    this.cancels.set(crawlId, controller);
    let buffer: Prisma.CrawlPageCreateManyInput[] = [];
    let count = 0;
    let errors = 0;
    let warnings = 0;
    let notices = 0;
    const summary = new Map<string, SummaryEntry>();

    const bump = (i: Issue) => {
      if (i.severity === "error") errors++;
      else if (i.severity === "warning") warnings++;
      else notices++;
      const e = summary.get(i.code);
      if (e) e.count++;
      else summary.set(i.code, { severity: i.severity, category: i.category, message: i.message, count: 1 });
    };

    const flush = async () => {
      if (buffer.length === 0) return;
      const batch = buffer;
      buffer = [];
      try {
        await this.prisma.crawlPage.createMany({ data: batch });
      } catch (e) {
        this.logger.error(`flush failed: ${String(e)}`);
      }
    };

    const ticker = setInterval(() => {
      void flush();
      this.prisma.crawl
        .update({ where: { id: crawlId }, data: { pagesCrawled: count, errors, warnings, notices } })
        .catch(() => {});
    }, 1000);

    // Lazily start a headless browser only when a page yields no links (a JS
    // site). Server-rendered sites never trigger it, so they pay no cost.
    let rendererInit: Promise<Renderer | null> | null = null;
    const lazyRender: RenderFn = async (url) => {
      if (!rendererInit) {
        this.logger.log(`crawl ${crawlId}: JS render engine starting (site needs rendering)`);
        rendererInit = createRenderer();
      }
      const r = await rendererInit;
      return r ? r.render(url) : null;
    };

    // Internal link graph: who links to whom, so we can compute inlinks per
    // page, orphan pages (0 inlinks) and broken internal links (4xx/5xx targets).
    const inlinks = new Map<string, number>();
    const referrers = new Map<string, Set<string>>();
    // Outbound (off-domain) URL -> pages that link to it, for the broken-external-link check.
    const externalRefs = new Map<string, Set<string>>();
    // Image URL -> pages that embed it, for the broken-image check.
    const imageRefs = new Map<string, Set<string>>();
    // Per-page canonical target, for the canonical-points-to-a-dead-page check.
    const canonicalOf = new Map<string, string>();
    // URLs the crawl saw as noindex, for the noindex-in-sitemap cross-check.
    const noindexUrls = new Set<string>();
    // Indexable pages (title + meta) for the post-crawl keyword-cannibalization pass.
    const cannibPages: CannibalPage[] = [];
    // Content fingerprints for the near-duplicate-content check.
    const dupPages: { url: string; shingles: number[] }[] = [];
    const pageMeta = new Map<string, { statusCode: number | null; depth: number; title: string | null }>();

    try {
      // Site-level checks (robots.txt, sitemap, HTTPS) run once.
      for (const iss of await siteChecks(startUrl)) bump(iss);
      // Targeted technical checks (compression, https/www enforcement, exposed files).
      try { for (const iss of await technicalSiteChecks(startUrl)) bump(iss); }
      catch (e) { this.logger.error(`technical site checks failed: ${String(e)}`); }

      // Seed the crawl from the sitemap so EVERY page (even orphans not linked
      // from anywhere) is discovered and audited — nothing gets missed.
      let seeds: string[] = [];
      try { seeds = await fetchSitemapUrls(startUrl); this.logger.log(`crawl ${crawlId}: seeded ${seeds.length} URL(s) from sitemap`); }
      catch (e) { this.logger.error(`sitemap seed failed: ${String(e)}`); }

      await crawlSite(startUrl, {
        maxPages,
        concurrency: 14,
        maxDepth: 10,
        seeds,
        render: lazyRender,
        signal: controller.signal,
        onPage: (page) => {
          count++;
          for (const iss of page.issues) bump(iss);
          buffer.push(toRow(crawlId, page));
          pageMeta.set(page.url, { statusCode: page.statusCode, depth: page.depth, title: page.title });
          for (const t of page.outlinks ?? []) {
            inlinks.set(t, (inlinks.get(t) ?? 0) + 1);
            let s = referrers.get(t);
            if (!s) { s = new Set(); referrers.set(t, s); }
            if (s.size < 25) s.add(page.url);
          }
          for (const ex of page.externalUrls ?? []) {
            let s = externalRefs.get(ex);
            if (!s) { s = new Set(); externalRefs.set(ex, s); }
            if (s.size < 10) s.add(page.url);
          }
          for (const img of page.imageUrls ?? []) {
            let s = imageRefs.get(img);
            if (!s) { s = new Set(); imageRefs.set(img, s); }
            if (s.size < 10) s.add(page.url);
          }
          if (page.canonical) canonicalOf.set(page.url, page.canonical);
          if (page.issues.some((i) => i.code === "noindex")) noindexUrls.add(page.url);
          // Only indexable pages compete for keywords: 2xx and not noindex.
          if (page.statusCode != null && page.statusCode >= 200 && page.statusCode < 300 && page.title && !page.issues.some((i) => i.code === "noindex")) {
            cannibPages.push({ url: page.url, title: page.title, metaDescription: page.metaDescription });
            if (page.contentShingles?.length) dupPages.push({ url: page.url, shingles: page.contentShingles });
          }
        },
      });

      clearInterval(ticker);
      await flush();

      // If the user cancelled mid-crawl, don't overwrite the CANCELLED status.
      if (controller.signal.aborted) {
        this.logger.log(`crawl ${crawlId} cancelled by user (${count} pages)`);
        return;
      }

      // Duplicate title / meta detection (post-crawl, marks affected pages).
      await this.markDuplicates(crawlId, summary, (n) => {
        warnings += n;
      });

      // Build the link graph + broken-link / orphan findings.
      const linkGraph = await this.buildLinkGraph(crawlId, startUrl, inlinks, referrers, pageMeta, summary, (n) => { warnings += n; });

      // External broken links: probe every outbound URL, flag the pages linking to
      // dead ones. Bounded (URL cap + wall-clock budget) so it can't stall the audit.
      try {
        const ext = await checkExternalLinks(externalRefs, { signal: controller.signal });
        if (ext.broken.length) {
          const msg = "Links to a broken external URL (returns 4xx/5xx or unreachable)";
          summary.set("broken-external-link", { severity: "warning", category: "links", message: msg, count: ext.broken.length });
          warnings += ext.broken.length;
          const pagesToTag = [...new Set(ext.broken.flatMap((b) => b.referrers))];
          await this.tagPages(crawlId, pagesToTag, "broken-external-link", "warning", "links", msg);
        }
        (linkGraph as { brokenExternal?: unknown; externalChecked?: number; externalTotal?: number }).brokenExternal = ext.broken.slice(0, 100);
        (linkGraph as { externalChecked?: number }).externalChecked = ext.checked;
        (linkGraph as { externalTotal?: number }).externalTotal = ext.total;
        this.logger.log(`crawl ${crawlId}: external links checked ${ext.checked}/${ext.total}, ${ext.broken.length} broken`);
      } catch (e) {
        this.logger.error(`external link check failed: ${String(e)}`);
      }

      // Broken images: HEAD-check every embedded image URL and flag the pages
      // that show a dead one (reuses the outbound-link probe).
      try {
        const img = await checkExternalLinks(imageRefs, { signal: controller.signal });
        if (img.broken.length) {
          const msg = "Embeds a broken image (returns 4xx/5xx or unreachable)";
          summary.set("broken-image", { severity: "warning", category: "onpage", message: msg, count: img.broken.length });
          warnings += img.broken.length;
          const pagesToTag = [...new Set(img.broken.flatMap((b) => b.referrers))];
          await this.tagPages(crawlId, pagesToTag, "broken-image", "warning", "onpage", msg);
        }
        (linkGraph as { brokenImages?: unknown }).brokenImages = img.broken.slice(0, 100);
      } catch (e) {
        this.logger.error(`broken image check failed: ${String(e)}`);
      }

      // Canonical health: a canonical tag pointing at an on-domain page the crawl
      // saw return 4xx/5xx tells Google to index a dead URL (no extra network).
      try {
        const statusByNorm = new Map<string, number | null>();
        for (const [u, m] of pageMeta) statusByNorm.set(u.replace(/\/+$/, ""), m.statusCode);
        const bad: string[] = [];
        for (const [pageUrl, canonical] of canonicalOf) {
          try {
            const target = new URL(canonical, pageUrl).href.replace(/#.*$/, "").replace(/\/+$/, "");
            const st = statusByNorm.get(target);
            if (typeof st === "number" && st >= 400) bad.push(pageUrl);
          } catch { /* ignore */ }
        }
        if (bad.length) {
          const msg = "Canonical tag points to a page that returns 4xx/5xx";
          summary.set("canonical-broken", { severity: "warning", category: "indexability", message: msg, count: bad.length });
          warnings += bad.length;
          await this.tagPages(crawlId, bad, "canonical-broken", "warning", "indexability", msg);
        }

        // Canonical chain: page A's canonical points at B, but B canonicals to a
        // third URL — Google may ignore the whole chain.
        const canonNorm = (u: string, base: string) => { try { return new URL(u, base).href.replace(/#.*$/, "").replace(/\/+$/, ""); } catch { return ""; } };
        const targetByPage = new Map<string, string>();
        for (const [p, c] of canonicalOf) targetByPage.set(p.replace(/\/+$/, ""), canonNorm(c, p));
        const chained: string[] = [];
        for (const [pageUrl, canonical] of canonicalOf) {
          const target = canonNorm(canonical, pageUrl);
          const pageNorm = pageUrl.replace(/\/+$/, "");
          if (!target || target === pageNorm) continue; // self-canonical is fine
          const next = targetByPage.get(target);
          if (next && next !== target) chained.push(pageUrl); // target canonicals elsewhere
        }
        if (chained.length) {
          const msg = "Canonical chain — this page's canonical target canonicalizes to yet another URL";
          summary.set("canonical-chain", { severity: "warning", category: "indexability", message: msg, count: chained.length });
          warnings += chained.length;
          await this.tagPages(crawlId, chained, "canonical-chain", "warning", "indexability", msg);
        }
      } catch (e) {
        this.logger.error(`canonical health check failed: ${String(e)}`);
      }

      // Sitemap ↔ robots.txt cross-check: sitemap URLs that are blocked by
      // robots.txt or that the crawl found broken (contradictory index signals).
      try {
        const statusByUrl = new Map<string, number | null>();
        for (const [u, m] of pageMeta) statusByUrl.set(u, m.statusCode);
        const sm = await auditSitemap(startUrl, { statusByUrl });
        for (const iss of sm.issues) bump(iss);
        // Noindex pages listed in the sitemap send contradictory signals.
        const smSet = new Set(sm.sitemapUrls.map((u) => u.replace(/\/+$/, "")));
        const noindexInSitemap = [...noindexUrls].filter((u) => smSet.has(u.replace(/^https?:\/\//, "https://").replace(/\/+$/, "")) || smSet.has(u.replace(/\/+$/, "")));
        if (noindexInSitemap.length) {
          summary.set("noindex-in-sitemap", { severity: "warning", category: "indexability", message: "Noindex page(s) are listed in the XML sitemap — contradictory signals to search engines", count: noindexInSitemap.length });
          warnings += noindexInSitemap.length;
        }
        (linkGraph as { sitemapAudit?: unknown }).sitemapAudit = {
          sitemapUrlCount: sm.sitemapUrls.length,
          blocked: sm.blocked.slice(0, 100),
          broken: sm.broken.slice(0, 100),
          noindexInSitemap: noindexInSitemap.slice(0, 100),
        };
      } catch (e) {
        this.logger.error(`sitemap audit failed: ${String(e)}`);
      }

      // Keyword cannibalization: cluster pages that compete for the same intent.
      try {
        const cann = detectCannibalization(cannibPages, startUrl);
        if (cann.pagesInvolved > 0) {
          const msg = "Competes with other pages for the same keywords (cannibalization)";
          summary.set("keyword-cannibalization", { severity: "notice", category: "content", message: msg, count: cann.pagesInvolved });
          notices += cann.pagesInvolved;
          const pagesToTag = [...new Set(cann.clusters.flatMap((c) => c.pages.map((p) => p.url)))];
          await this.tagPages(crawlId, pagesToTag, "keyword-cannibalization", "notice", "content", msg);
        }
        (linkGraph as { cannibalization?: unknown }).cannibalization = cann.clusters.slice(0, 50);
        this.logger.log(`crawl ${crawlId}: cannibalization ${cann.clusters.length} cluster(s), ${cann.pagesInvolved} pages`);
      } catch (e) {
        this.logger.error(`cannibalization check failed: ${String(e)}`);
      }

      // Near-duplicate content: pages whose main body is almost identical
      // (SimHash), e.g. a template copied per city — beyond exact title/meta dupes.
      try {
        const dup = detectNearDuplicates(dupPages);
        if (dup.pagesInvolved > 0) {
          const msg = "Near-duplicate content — this page's body is almost identical to other page(s)";
          summary.set("duplicate-content", { severity: "warning", category: "content", message: msg, count: dup.pagesInvolved });
          warnings += dup.pagesInvolved;
          const pagesToTag = [...new Set(dup.clusters.flatMap((c) => c.urls))];
          await this.tagPages(crawlId, pagesToTag, "duplicate-content", "warning", "content", msg);
        }
        (linkGraph as { duplicateContent?: unknown }).duplicateContent = dup.clusters.slice(0, 50);
        this.logger.log(`crawl ${crawlId}: near-duplicate ${dup.clusters.length} cluster(s), ${dup.pagesInvolved} pages`);
      } catch (e) {
        this.logger.error(`near-duplicate check failed: ${String(e)}`);
      }

      // Full-site accessibility (axe-core, WCAG A/AA) on a sample: homepage-first,
      // then the most internally-linked live HTML pages. Bounded to keep it fast.
      try {
        const sample = [...pageMeta.entries()]
          .filter(([, m]) => m.statusCode != null && m.statusCode >= 200 && m.statusCode < 300)
          .sort((a, b) => {
            const home = (u: string) => (u === startUrl.replace(/\/+$/, "") || u === `${startUrl.replace(/\/+$/, "")}/` ? -1 : 0);
            return (home(a[0]) - home(b[0])) || a[1].depth - b[1].depth || (inlinks.get(b[0]) ?? 0) - (inlinks.get(a[0]) ?? 0);
          })
          .slice(0, 10)
          .map(([u]) => u);
        const a11y = await runAccessibilityAudit(sample, { signal: controller.signal });
        for (const iss of a11y.issues) bump(iss);
        (linkGraph as { accessibility?: unknown }).accessibility = {
          pagesAudited: a11y.pagesAudited,
          totals: a11y.totals,
          byRule: a11y.byRule.slice(0, 30),
          perPage: a11y.perPage,
        };
        this.logger.log(`crawl ${crawlId}: accessibility audited ${a11y.pagesAudited} page(s), ${a11y.totals.critical + a11y.totals.serious} serious+`);
      } catch (e) {
        this.logger.error(`accessibility audit failed: ${String(e)}`);
      }

      // Unified AI-Readiness (GEO) score: fold the individual answer-engine
      // signals already in `summary` into one headline number for the UI.
      try {
        const cnt = (code: string) => summary.get(code)?.count ?? 0;
        const ai = computeAiReadiness({
          pagesCrawled: count,
          poorAnswerStructurePages: cnt("poor-answer-structure"),
          pagesNoSchema: cnt("no-structured-data"),
          pagesIncompleteSchema: cnt("incomplete-structured-data"),
          jsDependentPages: cnt("js-dependent-content"),
          hasLlmsTxt: !summary.has("no-llms-txt"),
          aiCrawlersBlocked: summary.has("ai-crawlers-blocked"),
        });
        (linkGraph as { aiReadiness?: unknown }).aiReadiness = ai;
        this.logger.log(`crawl ${crawlId}: AI-Readiness ${ai.score}/100 (${ai.grade})`);
      } catch (e) {
        this.logger.error(`ai-readiness compute failed: ${String(e)}`);
      }

      // Site-wide checks aren't tied to any single page, so the UI must not try
      // to filter the pages table by them.
      const SITE_LEVEL_CODES = new Set([
        "site-no-https", "no-robots", "no-sitemap", "robots-blocks-site", "sitemap-not-in-robots",
        "no-hsts", "no-csp", "no-xcto", "no-clickjack-protection", "no-referrer-policy",
        "ai-crawlers-blocked", "no-llms-txt", "sitemap-url-blocked", "sitemap-url-broken",
        "a11y-serious", "a11y-moderate",
        "no-compression", "no-https-redirect", "www-duplicate", "exposed-files",
        "robots-blocks-resources", "noindex-in-sitemap",
      ]);
      const issuesSummary = Array.from(summary.entries())
        .map(([code, v]) => ({ code, ...v, scope: SITE_LEVEL_CODES.has(code) ? "site" : "page" }))
        .sort((a, b) => {
          const order = { error: 0, warning: 1, notice: 2 } as const;
          return order[a.severity] - order[b.severity] || b.count - a.count;
        });

      const technologies = await detectTechnologies(startUrl);

      await this.prisma.crawl.update({
        where: { id: crawlId },
        data: {
          status: "COMPLETED",
          pagesCrawled: count,
          errors,
          warnings,
          notices,
          healthScore: computeHealth(count, errors, warnings, notices),
          issuesSummary: issuesSummary as unknown as Prisma.InputJsonValue,
          technologies: technologies as unknown as Prisma.InputJsonValue,
          linkGraph: linkGraph as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      this.logger.log(`crawl ${crawlId} done: ${count} pages`);

      // Notify whoever started the audit (honours their notification prefs).
      if (byUserId && projectId) {
        const health = computeHealth(count, errors, warnings, notices);
        const domain = (() => { try { return new URL(startUrl).hostname.replace(/^www\./, ""); } catch { return startUrl; } })();
        void this.notifications.notify(byUserId, "audit_complete", {
          title: `Site audit finished for ${domain}`,
          body: `${count} pages crawled · health ${health}/100 · ${errors} errors, ${warnings} warnings.`,
          link: `/dashboard/projects/${projectId}`,
        });
      }

      // Page speed runs after the report is ready so results show immediately.
      const speed = await runPageSpeed(startUrl);
      if (speed) {
        await this.prisma.crawl
          .update({ where: { id: crawlId }, data: speed })
          .catch(() => {});
      } else {
        // mark as attempted (perfScore 0 == unavailable) so the UI stops waiting
        await this.prisma.crawl.update({ where: { id: crawlId }, data: { perfScore: 0 } }).catch(() => {});
      }
    } catch (e) {
      clearInterval(ticker);
      await flush();
      if (!controller.signal.aborted) {
        await this.prisma.crawl.update({
          where: { id: crawlId },
          data: { status: "FAILED", error: String((e as Error)?.message || e), finishedAt: new Date() },
        });
        // Worst case: the audit crashed — tell the person who started it.
        if (byUserId && projectId) {
          const domain = (() => { try { return new URL(startUrl).hostname.replace(/^www\./, ""); } catch { return startUrl; } })();
          void this.notifications.notify(byUserId, "audit_complete", {
            title: `Site audit failed for ${domain}`,
            body: `The audit couldn't finish: ${String((e as Error)?.message || e).slice(0, 140)}. You can try running it again.`,
            link: `/dashboard/projects/${projectId}`,
          });
        }
      }
    } finally {
      this.cancels.delete(crawlId);
      const init = rendererInit as Promise<Renderer | null> | null;
      const r = init ? await init : null;
      if (r) await r.close().catch(() => {});
    }
  }

  // Find duplicate titles + meta descriptions and flag the affected pages.
  private async markDuplicates(crawlId: string, summary: Map<string, SummaryEntry>, onCount: (n: number) => void) {
    const dupFor = async (
      column: "title" | "metaDescription",
      code: string,
      message: string,
      category: string,
    ) => {
      try {
        const groups = await this.prisma.crawlPage.groupBy({
          by: [column],
          where: { crawlId, [column]: { not: null } },
          _count: { [column]: true },
          having: { [column]: { _count: { gt: 1 } } },
        } as never);
        const values = (groups as Array<Record<string, unknown>>)
          .map((g) => g[column] as string)
          .filter(Boolean);
        if (values.length === 0) return;
        const issueJson = JSON.stringify([{ code, severity: "warning", category, message }]);
        const affected: number = await this.prisma.$executeRawUnsafe(
          `UPDATE "CrawlPage"
             SET "issueCodes" = array_append("issueCodes", $1),
                 "issueCount" = "issueCount" + 1,
                 "issues" = COALESCE("issues", '[]'::jsonb) || $2::jsonb
           WHERE "crawlId" = $3 AND "${column}" = ANY($4::text[])`,
          code,
          issueJson,
          crawlId,
          values,
        );
        if (affected > 0) {
          summary.set(code, { severity: "warning", category, message, count: affected });
          onCount(affected);
        }
      } catch (e) {
        this.logger.warn(`duplicate check (${column}) failed: ${String(e)}`);
      }
    };
    await dupFor("title", "duplicate-title", "Duplicate title tag", "onpage");
    await dupFor("metaDescription", "duplicate-meta", "Duplicate meta description", "onpage");
  }

  // Compute internal-linking analytics from the crawl's link graph, persist
  // per-page inlink counts, and register orphan / broken-link findings.
  private async buildLinkGraph(
    crawlId: string,
    startUrl: string,
    inlinks: Map<string, number>,
    referrers: Map<string, Set<string>>,
    pageMeta: Map<string, { statusCode: number | null; depth: number; title: string | null }>,
    summary: Map<string, SummaryEntry>,
    onWarn: (n: number) => void,
  ) {
    const homeNorm = startUrl.replace(/\/+$/, "");
    const titleOf = (u: string) => pageMeta.get(u)?.title ?? null;

    const broken: { url: string; statusCode: number | null; referrers: string[] }[] = [];
    const orphans: { url: string; depth: number }[] = [];
    for (const [url, meta] of pageMeta) {
      if (meta.statusCode != null && meta.statusCode >= 400) {
        broken.push({ url, statusCode: meta.statusCode, referrers: [...(referrers.get(url) ?? [])].slice(0, 10) });
      }
      const isHome = url === homeNorm || url === `${homeNorm}/`;
      if (!isHome && (inlinks.get(url) ?? 0) === 0 && (meta.statusCode == null || meta.statusCode < 400)) {
        orphans.push({ url, depth: meta.depth });
      }
    }

    const topLinked = [...inlinks.entries()]
      .filter(([u]) => pageMeta.has(u))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([url, count]) => ({ url, inlinks: count, title: titleOf(url) }));

    // Pages the crawler reached but that have the fewest internal links in.
    const leastLinked = [...pageMeta.keys()]
      .filter((u) => !(u === homeNorm || u === `${homeNorm}/`))
      .map((url) => ({ url, inlinks: inlinks.get(url) ?? 0, title: titleOf(url) }))
      .sort((a, b) => a.inlinks - b.inlinks)
      .slice(0, 20);

    const depthDist: Record<string, number> = {};
    let inlinkTotal = 0;
    for (const [url, meta] of pageMeta) {
      depthDist[meta.depth] = (depthDist[meta.depth] ?? 0) + 1;
      inlinkTotal += inlinks.get(url) ?? 0;
    }

    // Persist per-page inlink counts in one bulk statement.
    const urls = [...pageMeta.keys()];
    const counts = urls.map((u) => inlinks.get(u) ?? 0);
    if (urls.length) {
      try {
        await this.prisma.$executeRaw`
          UPDATE "CrawlPage" AS cp SET "inlinks" = data.cnt
          FROM (SELECT unnest(${urls}::text[]) AS url, unnest(${counts}::int[]) AS cnt) AS data
          WHERE cp."crawlId" = ${crawlId} AND cp."url" = data.url`;
      } catch (e) {
        this.logger.error(`inlink update failed: ${String(e)}`);
      }
    }

    // Surface orphan pages + broken internal links as findings.
    if (orphans.length) {
      summary.set("orphan-page", { severity: "warning", category: "links", message: "Orphan page (no internal links pointing to it)", count: orphans.length });
      onWarn(orphans.length);
      await this.tagPages(crawlId, orphans.map((o) => o.url), "orphan-page", "warning", "links", "Orphan page (no internal links pointing to it)");
    }
    if (broken.length) {
      summary.set("broken-internal-link", { severity: "error", category: "links", message: "Broken internal link (page returns 4xx/5xx)", count: broken.length });
      await this.tagPages(crawlId, broken.map((b) => b.url), "broken-internal-link", "error", "links", "Broken internal link (page returns 4xx/5xx)");
    }

    // Nodes for the visual crawl map. Cap for render performance, keeping the
    // homepage, everything shallow, then the most-linked of the rest.
    const NODE_CAP = 250;
    const allNodes = [...pageMeta.entries()].map(([url, meta]) => ({
      url,
      path: (() => { try { return new URL(url).pathname; } catch { return url; } })(),
      depth: meta.depth,
      status: meta.statusCode,
      inlinks: inlinks.get(url) ?? 0,
    }));
    const nodes = allNodes.length <= NODE_CAP
      ? allNodes
      : allNodes.sort((a, b) => a.depth - b.depth || b.inlinks - a.inlinks).slice(0, NODE_CAP);

    return {
      totals: {
        pages: pageMeta.size,
        internalLinks: inlinkTotal,
        avgInlinks: pageMeta.size ? Math.round((inlinkTotal / pageMeta.size) * 10) / 10 : 0,
        orphans: orphans.length,
        broken: broken.length,
        maxDepth: Math.max(0, ...[...pageMeta.values()].map((m) => m.depth)),
      },
      topLinked,
      leastLinked,
      orphans: orphans.slice(0, 100),
      broken: broken.slice(0, 100),
      depthDist,
      nodes,
    };
  }

  // Append an issue code to a set of pages (raw SQL array ops).
  private async tagPages(crawlId: string, urls: string[], code: string, severity: string, category: string, message: string) {
    if (!urls.length) return;
    const issueJson = JSON.stringify([{ code, severity, category, message }]);
    try {
      await this.prisma.$executeRaw`
        UPDATE "CrawlPage" SET
          "issueCodes" = array_append("issueCodes", ${code}),
          "issueCount" = "issueCount" + 1,
          "issues" = COALESCE("issues", '[]'::jsonb) || ${issueJson}::jsonb
        WHERE "crawlId" = ${crawlId} AND "url" = ANY(${urls}::text[]) AND NOT (${code} = ANY("issueCodes"))`;
    } catch (e) {
      this.logger.error(`tagPages(${code}) failed: ${String(e)}`);
    }
  }

  // On-demand PageSpeed for any single URL (used by the per-page speed test).
  async pageSpeedFor(url: string) {
    const r = await runPageSpeed(url);
    return r?.pagespeed ?? null;
  }

  // Build a branded PDF of the latest completed audit.
  async reportPdf(project: { id: string; name: string; domain: string }, brand: ReportBrand, extra: ReportExtra = {}): Promise<Buffer | null> {
    const crawl = await this.prisma.crawl.findFirst({
      where: { projectId: project.id, status: "COMPLETED" },
      orderBy: { startedAt: "desc" },
    });
    const hasExtra = !!(extra.gsc?.matched || extra.ga?.matched || extra.backlinks?.connected || extra.ranked?.connected || extra.competitors?.competitors?.length);
    if (!crawl && !hasExtra) return null;
    const html = buildReportHtml({ name: project.name, domain: project.domain }, crawl as any, brand, extra);
    return renderPdf(html);
  }

  latestForProject(projectId: string) {
    // Skip FAILED crawls so a stuck/interrupted attempt never hides the last
    // good report — the UI always shows the newest COMPLETED (or in-progress) one.
    return this.prisma.crawl.findFirst({
      where: { projectId, status: { in: ["COMPLETED", "RUNNING", "QUEUED"] } },
      orderBy: { startedAt: "desc" },
    });
  }

  // Past completed audits (newest first) for the history / trends view.
  historyForProject(projectId: string) {
    return this.prisma.crawl.findMany({
      where: { projectId, status: "COMPLETED" },
      orderBy: { startedAt: "desc" },
      take: 30,
      select: {
        id: true,
        startedAt: true,
        finishedAt: true,
        pagesCrawled: true,
        healthScore: true,
        errors: true,
        warnings: true,
        notices: true,
        perfScore: true,
        lcpMs: true,
        clsScore: true,
        fcpMs: true,
        ttfbMs: true,
      },
    });
  }

  getCrawl(id: string) {
    return this.prisma.crawl.findUnique({ where: { id } });
  }

  async pages(
    crawlId: string,
    opts: { skip?: number; take?: number; issuesOnly?: boolean; q?: string; code?: string },
  ) {
    const take = Math.min(200, Math.max(1, opts.take ?? 50));
    const skip = Math.max(0, opts.skip ?? 0);
    const where: Prisma.CrawlPageWhereInput = { crawlId };
    if (opts.issuesOnly) where.issueCount = { gt: 0 };
    if (opts.code) where.issueCodes = { has: opts.code };
    if (opts.q) where.url = { contains: opts.q, mode: "insensitive" };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.crawlPage.count({ where }),
      this.prisma.crawlPage.findMany({
        where,
        orderBy: [{ issueCount: "desc" }, { depth: "asc" }],
        skip,
        take,
      }),
    ]);
    return { total, rows };
  }
}
