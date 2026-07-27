import { chromium } from "playwright";

interface ReportProject {
  name: string;
  domain: string;
}
interface ReportCrawl {
  healthScore: number | null;
  pagesCrawled: number;
  errors: number;
  warnings: number;
  notices: number;
  finishedAt: Date | null;
  issuesSummary: unknown;
  pagespeed: unknown;
  linkGraph: unknown;
  technologies: unknown;
}

// Extra SEO datasets (Search Console, Analytics, DataForSEO) folded into the report.
export interface ReportExtra {
  gsc?: any;
  ga?: any;
  backlinks?: any;
  ranked?: any;
  competitors?: any;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const fmtN = (n: unknown): string => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(v);
};
const pctOf = (v: unknown) => `${((Number(v) || 0) * 100).toFixed(1)}%`;
const posColor = (p: number | null) => (p == null ? GREY : p <= 3 ? GREEN : p <= 10 ? AMBER : GREY);
const rootDomain = (u: string) => String(u ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

const GREEN = "#16a34a", AMBER = "#d97706", RED = "#dc2626", GREY = "#6b7280";
const healthColor = (v: number) => (v >= 80 ? GREEN : v >= 50 ? AMBER : RED);
const sevColor = (s: string) => (s === "error" ? RED : s === "warning" ? AMBER : GREY);
const scoreColor = (v: number | null) => (v == null ? GREY : v >= 90 ? GREEN : v >= 50 ? AMBER : RED);
const shortUrl = (u: string) => { try { const x = new URL(u); return x.pathname === "/" ? "/" : x.pathname; } catch { return u; } };
const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${Math.round(n)} B`);
const fmtMs = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

const CAT_LABELS: Record<string, string> = {
  crawlability: "Crawlability", indexability: "Indexability", onpage: "On-page", content: "Content",
  technical: "Technical", performance: "Performance", security: "Security", links: "Links",
};

// One Lighthouse strategy's Core Web Vitals table.
function vitalsTable(rep: any): string {
  if (!rep?.lab) return "";
  const rows = [
    ["LCP", rep.lab.lcp], ["CLS", rep.lab.cls], ["TBT", rep.lab.tbt],
    ["FCP", rep.lab.fcp], ["Speed Index", rep.lab.speedIndex], ["TTFB", rep.lab.ttfb],
  ].map(([label, m]: any) => {
    const score = typeof m?.score === "number" ? m.score : null;
    const color = score == null ? GREY : score >= 0.9 ? GREEN : score >= 0.5 ? AMBER : RED;
    return `<tr><td>${label}</td><td class="right" style="color:${color};font-weight:600">${esc(m?.display ?? "—")}</td></tr>`;
  }).join("");
  return `<table class="mini"><tbody>${rows}</tbody></table>`;
}

function scoreBlock(rep: any, title: string): string {
  if (!rep?.scores) return "";
  const cards = [["performance", "Performance"], ["accessibility", "Accessibility"], ["bestPractices", "Best Practices"], ["seo", "SEO"]]
    .map(([k, l]) => `<div class="scard"><div class="sval" style="color:${scoreColor(rep.scores[k])}">${rep.scores[k] ?? "—"}</div><div class="slabel">${l}</div></div>`)
    .join("");
  return `<div class="ps-col"><div class="ps-h">${title}</div><div class="scores">${cards}</div>${vitalsTable(rep)}</div>`;
}

export function buildReportHtml(project: ReportProject, crawl: ReportCrawl | null, brand: string, extra: ReportExtra = {}): string {
  // Allow a report even before the first crawl — SEO datasets still render.
  crawl = crawl ?? { healthScore: null, pagesCrawled: 0, errors: 0, warnings: 0, notices: 0, finishedAt: null, issuesSummary: [], pagespeed: null, linkGraph: null, technologies: [] };
  const hasCrawl = (crawl.pagesCrawled ?? 0) > 0;
  const health = crawl.healthScore ?? 0;
  const label = health >= 80 ? "Good" : health >= 50 ? "Needs work" : "Poor";
  const date = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const summary = (Array.isArray(crawl.issuesSummary) ? crawl.issuesSummary : []) as any[];
  const ps = crawl.pagespeed as any;
  const lg = crawl.linkGraph as any;
  const tech = (Array.isArray(crawl.technologies) ? crawl.technologies : []) as any[];
  const mob = ps?.mobile, desk = ps?.desktop;

  const catTotals = new Map<string, number>();
  for (const s of summary) catTotals.set(s.category, (catTotals.get(s.category) ?? 0) + s.count);
  const catRows = Object.entries(CAT_LABELS).map(([k, l]) =>
    `<div class="catcell"><div class="catn">${catTotals.get(k) ?? 0}</div><div class="catl">${l}</div></div>`).join("");

  // Full issue list, sorted by severity then count.
  const order: Record<string, number> = { error: 0, warning: 1, notice: 2 };
  const allIssues = [...summary].sort((a, b) => (order[a.severity] - order[b.severity]) || b.count - a.count);
  const issueRows = allIssues.map((s) => `
    <tr>
      <td><span class="dot" style="background:${sevColor(s.severity)}"></span>${esc(s.message)}</td>
      <td class="muted">${esc(CAT_LABELS[s.category] || s.category)}</td>
      <td class="cap muted">${esc(s.severity)}</td>
      <td class="num">${s.count}</td>
    </tr>`).join("");

  // PageSpeed opportunities + diagnostics (from mobile).
  const oppRows = (mob?.opportunities ?? []).map((o: any) =>
    `<tr><td>${esc(o.title)}</td><td class="num" style="color:${AMBER};font-weight:600">${o.savingsMs ? `−${fmtMs(o.savingsMs)}` : ""}</td></tr>`).join("");
  const diagRows = (mob?.diagnostics ?? []).map((d: any) =>
    `<tr><td>${esc(d.title)}</td><td class="num muted">${esc(d.display ?? "")}</td></tr>`).join("");
  const auditRows = (mob?.audits ?? []).map((a: any) =>
    `<tr><td>${esc(a.title)}</td><td class="muted">${esc(a.category)}</td><td class="num muted">${esc(a.display ?? "")}</td></tr>`).join("");

  // Internal linking detail.
  const brokenRows = (lg?.broken ?? []).map((b: any) =>
    `<tr><td><span class="dot" style="background:${RED}"></span>${esc(shortUrl(b.url))}</td><td class="num" style="color:${RED};font-weight:600">${esc(b.statusCode ?? "ERR")}</td><td class="num muted">${b.referrers?.length ?? 0}</td></tr>`).join("");
  const orphanRows = (lg?.orphans ?? []).slice(0, 40).map((o: any) =>
    `<tr><td>${esc(shortUrl(o.url))}</td><td class="num muted">depth ${o.depth}</td></tr>`).join("");
  const topLinkedRows = (lg?.topLinked ?? []).slice(0, 15).map((p: any) =>
    `<tr><td>${esc(shortUrl(p.url))}</td><td class="num" style="font-weight:600">${p.inlinks}</td></tr>`).join("");
  const depthRows = Object.entries(lg?.depthDist ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([d, n]) => `<tr><td>${d === "0" ? "Homepage" : `Depth ${d}`}</td><td class="num" style="font-weight:600">${n}</td></tr>`).join("");

  const section = (title: string, body: string) => body ? `<div class="sec"><h2>${title}</h2>${body}</div>` : "";
  const table = (head: string, rows: string, empty = "No data") =>
    `<table><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="9" class="muted" style="padding:14px">${empty}</td></tr>`}</tbody></table>`;
  const kpi = (v: string, l: string, color = "#1f2430") => `<div class="catcell"><div class="catn" style="color:${color}">${v}</div><div class="catl">${l}</div></div>`;
  const kpis = (cards: string) => `<div class="cats">${cards}</div>`;

  // ---- Search Console (GSC) ----
  const gsc = extra.gsc;
  const gscLive = gsc?.connected && gsc?.matched;
  const gscKpis = gscLive ? kpis(
    kpi(fmtN(gsc.totals?.clicks), "Clicks") + kpi(fmtN(gsc.totals?.impressions), "Impressions") +
    kpi(pctOf(gsc.totals?.ctr), "Avg. CTR") + kpi((gsc.totals?.position ?? 0).toFixed(1), "Avg. position")) : "";
  const gscQueryRows = (gsc?.queries ?? []).slice(0, 25).map((q: any) =>
    `<tr><td>${esc(q.key)}</td><td class="num">${fmtN(q.clicks)}</td><td class="num muted">${fmtN(q.impressions)}</td><td class="num muted">${pctOf(q.ctr)}</td><td class="num" style="color:${posColor(q.position)};font-weight:600">${(q.position ?? 0).toFixed(1)}</td></tr>`).join("");
  const gscSection = gscLive ? section("Search performance (Google Search Console)",
    `${gscKpis}<div style="height:10px"></div>${table(`<th>Query</th><th class="num">Clicks</th><th class="num">Impr.</th><th class="num">CTR</th><th class="num">Position</th>`, gscQueryRows, "No query data.")}`) : "";

  // ---- Analytics (GA4) ----
  const ga = extra.ga;
  const gaLive = ga?.connected && ga?.matched;
  const gaKpis = gaLive ? kpis(
    kpi(fmtN(ga.totals?.sessions), "Sessions") + kpi(fmtN(ga.totals?.users), "Users") +
    kpi(fmtN(ga.totals?.pageviews), "Pageviews") + kpi(pctOf(ga.totals?.engagementRate), "Engagement")) : "";
  const gaChannelRows = (ga?.channels ?? []).slice(0, 10).map((c: any) =>
    `<tr><td>${esc(c.channel)}</td><td class="num" style="font-weight:600">${fmtN(c.sessions)}</td></tr>`).join("");
  const gaPageRows = (ga?.topPages ?? []).slice(0, 15).map((p: any) =>
    `<tr><td>${esc(p.path)}</td><td class="num">${fmtN(p.pageviews)}</td><td class="num muted">${fmtN(p.sessions)}</td></tr>`).join("");
  const gaSection = gaLive ? section("Website traffic (Google Analytics)",
    `${gaKpis}<div class="grid2" style="margin-top:12px">
      <div><h2>Traffic channels</h2>${table(`<th>Channel</th><th class="num">Sessions</th>`, gaChannelRows)}</div>
      <div><h2>Top pages</h2>${table(`<th>Page</th><th class="num">Views</th><th class="num">Sessions</th>`, gaPageRows)}</div>
    </div>`) : "";

  // ---- Keyword rankings (DataForSEO Labs) ----
  const ranked = extra.ranked;
  const rankedLive = ranked?.connected && (ranked?.keywords?.length ?? 0) > 0;
  const rt = ranked?.totals;
  const rankedKpis = rt ? kpis(
    kpi(fmtN(rt.count), "Ranked keywords") + kpi(fmtN(rt.pos_1 + rt.pos_2_3), "Top 3", GREEN) +
    kpi(fmtN(rt.pos_4_10), "Positions 4-10", AMBER) + kpi(fmtN(rt.etv), "Est. traffic / mo")) : "";
  const rankedRows = (ranked?.keywords ?? []).slice(0, 40).map((k: any) =>
    `<tr><td>${esc(k.keyword)}</td><td class="num" style="color:${posColor(k.position)};font-weight:600">${k.position ?? "—"}</td><td class="num muted">${fmtN(k.volume)}</td><td class="muted" style="font-size:10px">${esc(k.url ? rootDomain(k.url) + (new URL(k.url).pathname || "") : "")}</td></tr>`).join("");
  const rankedSection = rankedLive ? section("Keyword rankings",
    `${rankedKpis}<div style="height:10px"></div>${table(`<th>Keyword</th><th class="num">Position</th><th class="num">Volume</th><th>Ranking page</th>`, rankedRows)}`) : "";

  // ---- Backlink profile (DataForSEO Backlinks) ----
  const bl = extra.backlinks;
  const blLive = bl?.connected && (bl?.summary?.backlinks ?? 0) > 0;
  const bs = bl?.summary;
  const blKpis = bs ? kpis(
    kpi(fmtN(bs.backlinks), "Backlinks") + kpi(fmtN(bs.referringDomains), "Referring domains") +
    kpi(fmtN(bs.dofollow), "Dofollow", GREEN) + kpi(`${bs.spamScore ?? 0}%`, "Spam score", (bs.spamScore ?? 0) >= 30 ? RED : GREEN)) : "";
  const blRows = (bl?.referringDomains ?? []).slice(0, 25).map((d: any) =>
    `<tr><td>${esc(d.domain)}</td><td class="num">${fmtN(d.backlinks)}</td><td class="num" style="color:${GREEN}">${fmtN(d.dofollow)}</td><td class="num muted">${d.rank ?? 0}</td></tr>`).join("");
  const blSection = blLive ? section("Backlink profile",
    `${blKpis}<div style="height:10px"></div>${table(`<th>Referring domain</th><th class="num">Backlinks</th><th class="num">Dofollow</th><th class="num">Rank</th>`, blRows)}`) : "";

  // ---- Competitors (DataForSEO Labs) ----
  const comp = extra.competitors;
  const compLive = (comp?.competitors?.length ?? 0) > 0;
  const compRows = (comp?.competitors ?? []).slice(0, 20).map((c: any) =>
    `<tr><td>${esc(c.domain)}</td><td class="num" style="font-weight:600">${fmtN(c.commonKeywords)}</td><td class="num muted">${fmtN(c.keywords)}</td><td class="num" style="color:${GREEN}">${fmtN(c.top10)}</td><td class="num muted">${fmtN(c.etv)}</td></tr>`).join("");
  const compSection = compLive ? section("Organic competitors",
    table(`<th>Domain</th><th class="num">Common kw</th><th class="num">Keywords</th><th class="num">Top 10</th><th class="num">Est. traffic</th>`, compRows)) : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing:border-box; }
    body { font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#1f2430; margin:0; font-size:12.5px; }
    .page { padding:2px 6px; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #eef0f4; padding-bottom:14px; margin-bottom:18px; }
    .brand { font-size:11px; font-weight:700; letter-spacing:.5px; color:#4f46e5; text-transform:uppercase; }
    h1 { font-size:22px; margin:6px 0 2px; }
    h2 { font-size:14px; margin:0 0 10px; padding-bottom:6px; border-bottom:1px solid #eef0f4; }
    .muted { color:#6b7280; }
    .cap { text-transform:capitalize; }
    .sec { margin-top:22px; page-break-inside:avoid; }
    .hero { display:flex; gap:20px; align-items:center; background:#f8f9fb; border:1px solid #eef0f4; border-radius:12px; padding:18px; margin-bottom:6px; }
    .ring { width:92px; height:92px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-direction:column; color:#fff; }
    .ring .n { font-size:30px; font-weight:800; line-height:1; }
    .ring .of { font-size:10px; opacity:.9; }
    .hstats { display:flex; gap:22px; margin-top:10px; }
    .hstat .v { font-size:20px; font-weight:700; }
    .hstat .l { font-size:11px; color:#6b7280; }
    .cats { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
    .catcell { border:1px solid #eef0f4; border-radius:8px; padding:9px 12px; }
    .catn { font-size:18px; font-weight:700; }
    .catl { font-size:11px; color:#6b7280; }
    .ps-wrap { display:flex; gap:12px; }
    .ps-col { flex:1; border:1px solid #eef0f4; border-radius:10px; padding:12px; }
    .ps-h { font-size:12px; font-weight:700; margin-bottom:8px; color:#4b5563; }
    .scores { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:8px; }
    .scard { border:1px solid #f1f2f5; border-radius:7px; padding:8px; text-align:center; }
    .sval { font-size:20px; font-weight:800; }
    .slabel { font-size:9px; color:#6b7280; }
    table { width:100%; border-collapse:collapse; }
    th { text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:.4px; color:#9aa1ad; border-bottom:1px solid #eef0f4; padding:6px 8px; }
    td { padding:6px 8px; border-bottom:1px solid #f2f3f6; font-size:12px; }
    td.num, th.num, td.right, th.right { text-align:right; }
    table.mini td { padding:3px 4px; border-bottom:1px solid #f5f6f8; font-size:11px; }
    .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; vertical-align:middle; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .chips span { display:inline-block; border:1px solid #eef0f4; border-radius:6px; padding:2px 8px; margin:0 4px 4px 0; font-size:11px; }
    .foot { margin-top:26px; padding-top:10px; border-top:1px solid #eef0f4; font-size:10px; color:#9aa1ad; text-align:center; }
  </style></head><body><div class="page">
    <div class="head">
      <div><div class="brand">${esc(brand)}</div><h1>SEO Performance Report</h1><div class="muted">${esc(project.name)} · ${esc(project.domain)}</div></div>
      <div class="muted" style="text-align:right">Generated<br><strong>${esc(date)}</strong></div>
    </div>

    ${hasCrawl ? `<div class="hero">
      <div class="ring" style="background:${healthColor(health)}"><div class="n">${health}</div><div class="of">of 100</div></div>
      <div>
        <div style="font-size:16px;font-weight:700">Site health: ${label}</div>
        <div class="muted" style="margin-top:2px">Crawled ${crawl.pagesCrawled} pages</div>
        <div class="hstats">
          <div class="hstat"><div class="v" style="color:${RED}">${crawl.errors}</div><div class="l">Errors</div></div>
          <div class="hstat"><div class="v" style="color:${AMBER}">${crawl.warnings}</div><div class="l">Warnings</div></div>
          <div class="hstat"><div class="v" style="color:${GREY}">${crawl.notices}</div><div class="l">Notices</div></div>
        </div>
      </div>
    </div>` : ""}

    ${gscSection}
    ${gaSection}
    ${rankedSection}
    ${blSection}
    ${compSection}

    ${hasCrawl ? `<h2 style="font-size:15px;margin:26px 0 4px;border:0">Technical site audit</h2>` : ""}

    ${hasCrawl ? section("Issues by category", `<div class="cats">${catRows}</div>`) : ""}

    ${(mob || desk) ? section("Performance — Lighthouse & Core Web Vitals", `<div class="ps-wrap">${scoreBlock(mob, "Mobile")}${scoreBlock(desk, "Desktop")}</div>`) : ""}

    ${lg?.totals ? section("Internal linking", `<div class="cats">
      <div class="catcell"><div class="catn">${(lg.totals.internalLinks ?? 0).toLocaleString()}</div><div class="catl">Internal links</div></div>
      <div class="catcell"><div class="catn">${lg.totals.avgInlinks}</div><div class="catl">Avg links / page</div></div>
      <div class="catcell"><div class="catn" style="color:${lg.totals.orphans > 0 ? AMBER : GREEN}">${lg.totals.orphans}</div><div class="catl">Orphan pages</div></div>
      <div class="catcell"><div class="catn" style="color:${lg.totals.broken > 0 ? RED : GREEN}">${lg.totals.broken}</div><div class="catl">Broken links</div></div>
    </div>`) : ""}

    ${hasCrawl ? section("All issues found", table(`<th>Issue</th><th>Category</th><th>Severity</th><th class="num">Pages</th>`, issueRows, "No issues found.")) : ""}

    ${oppRows ? section("PageSpeed opportunities (mobile)", table(`<th>Opportunity</th><th class="num">Est. savings</th>`, oppRows)) : ""}
    ${diagRows ? section("PageSpeed diagnostics (mobile)", table(`<th>Diagnostic</th><th class="num">Value</th>`, diagRows)) : ""}
    ${auditRows ? section("Accessibility, SEO & Best-Practice checks", table(`<th>Check</th><th>Category</th><th class="num">Value</th>`, auditRows)) : ""}

    ${brokenRows ? section("Broken internal links", table(`<th>Page</th><th class="num">Status</th><th class="num">Referrers</th>`, brokenRows)) : ""}

    <div class="sec grid2">
      ${topLinkedRows ? `<div><h2>Most-linked pages</h2>${table(`<th>Page</th><th class="num">Inlinks</th>`, topLinkedRows)}</div>` : ""}
      ${depthRows ? `<div><h2>Crawl depth</h2>${table(`<th>Level</th><th class="num">Pages</th>`, depthRows)}</div>` : ""}
    </div>

    ${orphanRows ? section("Orphan pages", table(`<th>Page</th><th class="num">Depth</th>`, orphanRows)) : ""}

    ${tech.length ? section("Detected technologies", `<div class="chips">${tech.map((t: any) => `<span>${esc(t.name)}</span>`).join("")}</div>`) : ""}

    <div class="foot">${esc(brand)} — SEO Performance Report for ${esc(project.domain)} · Generated ${esc(date)}</div>
  </div></body></html>`;
}

// Render an HTML string to a PDF buffer via headless Chromium.
export async function renderPdf(html: string): Promise<Buffer | null> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle", timeout: 20000 });
    const buf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "14mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(buf);
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
