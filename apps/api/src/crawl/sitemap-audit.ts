// Sitemap ↔ robots.txt cross-check.
//
// The audit already checks that robots.txt and a sitemap EXIST; this catches the
// contradictions BETWEEN them, which are the ones that actually silently drop
// pages from the index:
//   - a URL is listed in the sitemap but DISALLOWED by robots.txt (you're telling
//     Google both "crawl this" and "don't crawl this")
//   - a URL is in the sitemap but the crawl found it returning 4xx/5xx (a sitemap
//     should only list live, indexable pages)
// Self-contained: fetches robots.txt + sitemap(s) itself; the crawl's page-status
// map is optional and only enriches the broken-URL check.
import { fetch as uFetch } from "undici";
import type { Issue } from "./crawler";

const UA =
  "Mozilla/5.0 (compatible; SEOPlatformBot/1.0; +https://seo-platform.local) AppleWebKit/537.36";

async function getText(url: string): Promise<string | null> {
  try {
    const r = await uFetch(url, { signal: AbortSignal.timeout(12000), headers: { "User-Agent": UA } });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

// Disallow rules that apply to the generic `*` user-agent (what Googlebot honours
// unless a more specific block exists). Empty `Disallow:` means "allow all".
export function parseDisallows(robots: string): string[] {
  const rules: string[] = [];
  let applies = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") applies = val === "*";
    else if (applies && key === "disallow" && val) rules.push(val);
  }
  return rules;
}

// Googlebot-style prefix/wildcard match of a path against a Disallow pattern.
export function pathBlocked(pathname: string, pattern: string): boolean {
  // Translate the two robots wildcards (* = any run, $ = end anchor) to regex.
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    "^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""),
  );
  return re.test(pathname);
}

// Pull <loc> URLs out of a sitemap, following one level of sitemap-index nesting.
async function collectSitemapUrls(sitemapUrl: string, seen: Set<string>, cap: number): Promise<string[]> {
  if (seen.has(sitemapUrl) || seen.size > 50) return [];
  seen.add(sitemapUrl);
  const xml = await getText(sitemapUrl);
  if (!xml) return [];
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  if (/<sitemapindex[\s>]/i.test(xml)) {
    // It's an index — recurse into child sitemaps (bounded).
    const out: string[] = [];
    for (const child of locs) {
      if (out.length >= cap) break;
      out.push(...(await collectSitemapUrls(child, seen, cap - out.length)));
    }
    return out;
  }
  return locs.slice(0, cap);
}

function normUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    x.hostname = x.hostname.toLowerCase().replace(/^www\./, "");
    let s = `${x.protocol}//${x.hostname}${x.pathname}${x.search}`;
    if (s.endsWith("/") && x.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return u;
  }
}

export interface SitemapAuditResult {
  issues: Issue[];
  sitemapUrls: string[]; // normalized, for the caller's reverse checks (e.g. orphans missing from sitemap)
  blocked: string[]; // sitemap URLs disallowed by robots.txt
  broken: string[]; // sitemap URLs the crawl saw as 4xx/5xx
  stats: { sitemapCount: number };
}

// Discover + collect every URL in the site's sitemap(s). Used to SEED the crawl
// so pages that exist but aren't internally linked (orphans) are still audited.
export async function fetchSitemapUrls(startUrl: string, cap = 5000): Promise<string[]> {
  let origin: string;
  try { origin = new URL(startUrl).origin; } catch { return []; }
  const robots = (await getText(origin + "/robots.txt")) || "";
  const declared = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1].trim());
  const candidates = declared.length ? declared : [origin + "/sitemap.xml", origin + "/sitemap_index.xml"];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const sm of candidates) {
    if (urls.length >= cap) break;
    urls.push(...(await collectSitemapUrls(sm, seen, cap - urls.length)));
  }
  return [...new Set(urls)];
}

export async function auditSitemap(
  startUrl: string,
  opts: { statusByUrl?: Map<string, number | null> } = {},
): Promise<SitemapAuditResult> {
  const origin = new URL(startUrl).origin;
  const issues: Issue[] = [];

  const robots = (await getText(origin + "/robots.txt")) || "";
  const disallows = robots ? parseDisallows(robots) : [];

  // Discover sitemaps: those declared in robots.txt, plus the conventional paths.
  const declared = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1].trim());
  const candidates = declared.length ? declared : [origin + "/sitemap.xml", origin + "/sitemap_index.xml"];

  const seen = new Set<string>();
  const rawUrls: string[] = [];
  for (const sm of candidates) {
    if (rawUrls.length >= 5000) break;
    rawUrls.push(...(await collectSitemapUrls(sm, seen, 5000 - rawUrls.length)));
  }
  const sitemapUrls = [...new Set(rawUrls.map(normUrl))];

  // Normalize the crawl's status map keys once for matching.
  const statusByNorm = new Map<string, number | null>();
  if (opts.statusByUrl) for (const [u, s] of opts.statusByUrl) statusByNorm.set(normUrl(u), s);

  const blocked: string[] = [];
  const broken: string[] = [];
  for (const u of sitemapUrls) {
    let pathname = "/";
    try {
      pathname = new URL(u).pathname;
    } catch {
      /* ignore */
    }
    if (disallows.some((d) => pathBlocked(pathname, d))) blocked.push(u);
    const st = statusByNorm.get(u);
    if (typeof st === "number" && st >= 400) broken.push(u);
  }

  if (blocked.length)
    issues.push({
      code: "sitemap-url-blocked",
      severity: "warning",
      category: "crawlability",
      message: `${blocked.length} sitemap URL(s) are disallowed by robots.txt — contradictory signals that waste crawl budget`,
    });
  if (broken.length)
    issues.push({
      code: "sitemap-url-broken",
      severity: "warning",
      category: "crawlability",
      message: `${broken.length} sitemap URL(s) return 4xx/5xx — a sitemap should only list live pages`,
    });

  return { issues, sitemapUrls, blocked, broken, stats: { sitemapCount: seen.size } };
}
