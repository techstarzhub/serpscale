import * as cheerio from "cheerio";
import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
// Use undici's OWN fetch (not Node's global fetch) so a ProxyAgent dispatcher from
// this same undici build attaches cleanly — mixing versions throws "invalid
// onRequestStart method". uFetch returns a WHATWG-compatible Response.
import { fetch as uFetch, ProxyAgent } from "undici";
import { validateStructuredData } from "./structured-data";
import { detectEeat } from "./eeat";
import { detectOnPageIssues } from "./onpage-checks";
import { detectContentQuality } from "./content-quality";
import { contentShingles as computeShingles } from "./near-duplicate";

export type Severity = "error" | "warning" | "notice";
export type Category =
  | "crawlability"
  | "indexability"
  | "onpage"
  | "content"
  | "technical"
  | "performance"
  | "security"
  | "links";

export interface Issue {
  code: string;
  severity: Severity;
  category: Category;
  message: string;
}

export interface CrawledPage {
  url: string;
  statusCode: number | null;
  title: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  metaLength: number | null;
  h1Count: number;
  wordCount: number;
  imagesNoAlt: number;
  internalLinks: number;
  externalLinks: number;
  canonical: string | null;
  depth: number;
  loadMs: number;
  issues: Issue[];
  outlinks?: string[]; // normalized on-domain link targets (for the link graph)
  externalUrls?: string[]; // raw off-domain link targets (for the broken-external-link check)
  imageUrls?: string[]; // on-page image src URLs (for the broken-image check)
  contentShingles?: number[]; // main-content shingle hashes (for the near-duplicate check)
}

export interface CrawlOptions {
  maxPages?: number;
  concurrency?: number;
  maxDepth?: number;
  onPage?: (page: CrawledPage) => void;
  // When provided, pages with no links found in the raw HTML are re-rendered
  // in a headless browser so JavaScript-rendered sites crawl fully.
  render?: RenderFn;
  // Abort signal — when aborted, the crawl stops pumping new pages and resolves
  // as soon as in-flight pages settle (used for user-initiated cancellation).
  signal?: AbortSignal;
  // Extra URLs to seed the frontier with (e.g. from the sitemap) so pages that
  // aren't internally linked are still crawled and audited.
  seeds?: string[];
}

const UA =
  "Mozilla/5.0 (compatible; SEOPlatformBot/1.0; +https://seo-platform.local) AppleWebKit/537.36";

// DataImpulse residential proxy — reused from the (unused) SERP config. We only
// route a crawl through it when the site BLOCKS our own IP (403/429/network), so
// pay-per-GB cost stays near-zero while the audit still gets past bot walls.
// CRAWL_PROXY_COUNTRY (optional) geo-targets the exit node for location-aware crawls.
let _proxyDispatcher: ProxyAgent | null | undefined;
function proxyDispatcher(): ProxyAgent | undefined {
  if (_proxyDispatcher !== undefined) return _proxyDispatcher ?? undefined;
  const host = process.env.CRAWL_PROXY_HOST || process.env.SERP_PROXY_HOST;
  const user = process.env.CRAWL_PROXY_USER || process.env.SERP_PROXY_USER;
  const pass = process.env.CRAWL_PROXY_PASS || process.env.SERP_PROXY_PASS;
  if (process.env.CRAWL_PROXY_DISABLED === "true" || !host || !user || !pass) {
    _proxyDispatcher = null;
    return undefined;
  }
  const port = process.env.CRAWL_PROXY_PORT || process.env.SERP_PROXY_PORT || "823";
  const country = process.env.CRAWL_PROXY_COUNTRY;
  const username = country ? `${user}__cr.${country.toLowerCase()}` : user;
  const uri = `http://${encodeURIComponent(username)}:${encodeURIComponent(pass)}@${host}:${port}`;
  _proxyDispatcher = new ProxyAgent(uri);
  return _proxyDispatcher;
}
export function crawlProxyConfigured(): boolean {
  return !!proxyDispatcher();
}

// Analytics / ad params that create duplicate URLs but no new content.
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "gclsrc", "dclid", "fbclid", "msclkid", "mc_cid", "mc_eid", "yclid",
  "_ga", "_gl", "ref", "ref_src", "source", "igshid", "vero_id", "wickedid",
]);

// Non-HTML assets we should never queue as crawlable pages.
const ASSET_EXT = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "svg", "ico", "bmp", "tiff", "avif",
  "css", "js", "mjs", "map", "json", "xml", "rss", "txt", "csv",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "rtf",
  "zip", "rar", "gz", "tar", "7z", "bz2", "dmg", "exe", "apk", "msi",
  "mp3", "mp4", "avi", "mov", "wmv", "flv", "webm", "ogg", "wav", "m4a", "mkv",
  "woff", "woff2", "ttf", "otf", "eot",
]);

function rootHost(hostname: string): string {
  return hostname.replace(/^www\./, "").toLowerCase();
}

// Canonicalise a URL so equivalent variants collapse to one key: drop the hash,
// strip tracking params, sort the remaining query, lowercase host, trim the
// trailing slash. This is what dedupes the crawl frontier.
function normalize(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    // Drop default ports.
    if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) u.port = "";
    // Remove tracking params, then sort the rest for a stable key.
    const kept: [string, string][] = [];
    for (const [k, v] of u.searchParams) {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) kept.push([k, v]);
    }
    kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
    u.search = "";
    for (const [k, v] of kept) u.searchParams.append(k, v);
    let s = u.href;
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return raw;
  }
}

// Compare a canonical URL against the page URL, tolerating the differences that are
// SEO-EQUIVALENT and must NOT trigger a "canonical points elsewhere" warning:
//   - http vs https, www vs non-www, trailing slash, #hash, tracking params.
// (We deliberately do NOT fold www/protocol in the frontier `normalize()` — there
//  it could wrongly merge distinct hosts — only here for the canonical check.)
// Also resolves a relative canonical (e.g. "/about") against the page URL.
function canonicalKey(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    const kept: [string, string][] = [];
    for (const [k, v] of u.searchParams) {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) kept.push([k, v]);
    }
    kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
    const qs = kept.length ? "?" + kept.map(([k, v]) => `${k}=${v}`).join("&") : "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    let path = u.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${host}${path}${qs}`; // protocol- and www-agnostic
  } catch {
    return null;
  }
}
function sameCanonical(canonical: string, pageUrl: string): boolean {
  const a = canonicalKey(canonical, pageUrl);
  const b = canonicalKey(pageUrl, pageUrl);
  return a != null && b != null && a === b;
}

// Should this link be queued as a crawlable HTML page?
function isCrawlableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false; // mailto:, tel:, javascript:, data:
    if (url.length > 2000) return false; // pathological / trap URLs
    // Skip obvious asset files by extension.
    const last = u.pathname.split("/").pop() || "";
    const dot = last.lastIndexOf(".");
    if (dot > -1) {
      const ext = last.slice(dot + 1).toLowerCase();
      if (ASSET_EXT.has(ext)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// A key that groups URLs by path shape so we can cap crawler-trap explosions
// (e.g. faceted navigation generating endless ?filter= combinations).
function pathKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}

// All the signals extracted from a page, used to derive issues.
interface PageSignals {
  url: string;
  statusCode: number | null;
  isHtml: boolean;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  h2Count: number;
  wordCount: number;
  imagesNoAlt: number;
  internalLinks: number;
  externalLinks: number;
  externalUrls: string[];
  imageUrls: string[];
  contentShingles: number[];
  canonical: string | null;
  canonicalCount: number;
  viewport: boolean;
  noindex: boolean;
  robotsConflict: boolean;
  lang: string | null;
  hasStructuredData: boolean;
  structuredTypes: string[];
  invalidJsonLd: boolean;
  hasOgTitle: boolean;
  hasOgImage: boolean;
  hasTwitterCard: boolean;
  mixedContent: boolean;
  insecureForm: boolean;
  metaRefresh: boolean;
  hreflangCount: number;
  hreflangHasXDefault: boolean;
  titleEmpty: boolean;
  h1Empty: boolean;
  h3Count: number;
  hasList: boolean;
  hasTable: boolean;
  redirectHops: number;
  redirectLoop: boolean;
  pageBytes: number;
  depth: number;
  loadMs: number;
  // Issues produced by richer analyzers (structured-data validity, E-E-A-T, JS diff)
  // that run where the DOM is available; merged into the page's issue list.
  extraIssues: Issue[];
}

function computeIssues(s: PageSignals): Issue[] {
  const out: Issue[] = [];
  const add = (code: string, severity: Severity, category: Category, message: string) =>
    out.push({ code, severity, category, message });

  // ---- Crawlability / status ----
  if (s.statusCode == null) {
    add("unreachable", "error", "crawlability", "Page could not be fetched (timeout or DNS error)");
    return out;
  }
  if (s.statusCode >= 500) add("5xx", "error", "crawlability", `Server error (HTTP ${s.statusCode})`);
  else if (s.statusCode >= 400) add("4xx", "error", "crawlability", `Broken page (HTTP ${s.statusCode})`);

  // ---- Redirects (traced manually, so we see the whole chain) ----
  // A single 301 (http->https, non-www->www) is standard and fine — only flag
  // multi-hop CHAINS (slow, leak link equity) and LOOPS (page never resolves).
  if (s.redirectLoop) add("redirect-loop", "error", "crawlability", "Redirect loop — this URL never resolves to a final page");
  else if (s.redirectHops >= 2) add("redirect-chain", "warning", "crawlability", `Redirect chain — ${s.redirectHops} hops before the final page (slows load, wastes crawl budget, dilutes link equity)`);

  // ---- Security ----
  if (s.url.startsWith("http://")) add("not-https", "warning", "security", "Page is served over HTTP, not HTTPS");
  if (s.mixedContent) add("mixed-content", "warning", "security", "HTTPS page loads insecure HTTP resources");
  if (s.insecureForm) add("insecure-form", "warning", "security", "A form on this page submits over insecure HTTP");

  // ---- URL hygiene ----
  try {
    const p = new URL(s.url);
    if (s.url.length > 115) add("url-too-long", "notice", "technical", "URL is longer than 115 characters");
    if (/[A-Z]/.test(p.pathname)) add("url-uppercase", "notice", "technical", "URL contains uppercase letters");
    if (p.pathname.includes("_")) add("url-underscore", "notice", "technical", "URL uses underscores instead of hyphens");
  } catch {
    /* ignore */
  }

  if (!(s.statusCode >= 200 && s.statusCode < 300 && s.isHtml)) return out;

  // ---- Meta refresh redirect (before the 2xx gate: applies to any HTML) ----
  if (s.metaRefresh) add("meta-refresh", "warning", "technical", "Uses a slow meta-refresh redirect instead of a 301");

  // ---- Indexability ----
  if (s.noindex) add("noindex", "warning", "indexability", "Page is set to noindex - it won't appear in search");
  if (s.robotsConflict) add("robots-conflict", "warning", "indexability", "Robots meta tag and X-Robots-Tag header disagree on noindex — search engines obey the stricter one");
  if (!s.canonical) add("missing-canonical", "notice", "indexability", "Missing canonical tag");
  else if (!sameCanonical(s.canonical, s.url))
    add("non-self-canonical", "notice", "indexability", "Canonical points to a different URL");
  if (s.canonicalCount > 1) add("multiple-canonical", "warning", "indexability", "More than one canonical tag (search engines may ignore all)");

  // ---- On-page ----
  if (!s.title) add("missing-title", "error", "onpage", s.titleEmpty ? "Title tag is empty" : "Missing page title");
  else {
    if (s.title.length > 60) add("long-title", "notice", "onpage", "Title is longer than 60 characters");
    if (s.title.length < 15) add("short-title", "notice", "onpage", "Title is very short (under 15 characters)");
  }
  if (!s.metaDescription) add("missing-meta", "warning", "onpage", "Missing meta description");
  else {
    if (s.metaDescription.length > 160) add("long-meta", "notice", "onpage", "Meta description longer than 160 characters");
    if (s.metaDescription.length < 50) add("short-meta", "notice", "onpage", "Meta description is short (under 50 characters)");
  }
  if (s.h1Count === 0) add("missing-h1", "warning", "onpage", "Missing H1 heading");
  else if (s.h1Empty) add("empty-h1", "warning", "onpage", "H1 heading is empty");
  else if (s.h1Count > 1) add("multiple-h1", "notice", "onpage", "More than one H1 heading");
  if (s.h2Count === 0 && s.wordCount > 300) add("missing-h2", "notice", "onpage", "No H2 subheadings on a long page");
  if (s.imagesNoAlt > 0) add("img-no-alt", "notice", "onpage", `${s.imagesNoAlt} image(s) missing alt text`);
  if (s.internalLinks + s.externalLinks > 300) add("too-many-links", "notice", "onpage", `Very many links on one page (${s.internalLinks + s.externalLinks}) — dilutes link equity`);

  // ---- Content ----
  if (s.wordCount > 0 && s.wordCount < 200) add("thin-content", "notice", "content", "Thin content (under 200 words)");
  // AI/GEO: a long page with no headings, lists or tables is a "wall of text" that
  // AI answer engines can't chunk into a quotable answer.
  if (s.wordCount >= 400 && s.h2Count === 0 && s.h3Count === 0 && !s.hasList && !s.hasTable)
    add("poor-answer-structure", "notice", "content", "Long page with no subheadings, lists or tables — hard for AI answer engines (ChatGPT / Perplexity / AI Overviews) to extract and quote");

  // ---- Technical / mobile / structured data ----
  if (!s.viewport) add("missing-viewport", "warning", "technical", "Missing viewport meta tag (not mobile friendly)");
  if (!s.lang) add("missing-lang", "notice", "technical", "Missing lang attribute on <html>");
  if (s.invalidJsonLd) add("invalid-structured-data", "warning", "technical", "Structured data (JSON-LD) is present but has invalid JSON");
  else if (!s.hasStructuredData) add("no-structured-data", "notice", "technical", "No structured data (JSON-LD) found");
  if (!s.hasOgTitle && !s.hasOgImage) add("missing-og", "notice", "technical", "Missing Open Graph tags for social sharing");
  else if (!s.hasOgImage) add("missing-og-image", "notice", "technical", "Missing og:image — the social share preview will render blank");
  else if (!s.hasOgTitle) add("missing-og-title", "notice", "technical", "Missing og:title — social shares fall back to the raw page title");
  if (s.hasStructuredData && !s.structuredTypes.includes("BreadcrumbList"))
    add("no-breadcrumb-schema", "notice", "technical", "No BreadcrumbList structured data — misses breadcrumb rich results in Google");
  if (!s.hasTwitterCard) add("missing-twitter-card", "notice", "technical", "Missing Twitter Card tags for social sharing");
  if (s.hreflangCount > 0 && !s.hreflangHasXDefault) add("hreflang-no-xdefault", "notice", "technical", "hreflang tags present but no x-default fallback");

  // ---- Performance ----
  // NOTE: we deliberately do NOT flag "slow server response" from the crawler's
  // loadMs — under concurrent crawling (and headless-render fallback, which adds
  // seconds) that time reflects OUR fetch load, not the server's real TTFB. Real,
  // isolated TTFB comes from the PageSpeed/Lighthouse panel instead.
  if (s.pageBytes > 3_000_000) add("large-page", "notice", "performance", "Large HTML page (over 3 MB)");

  // DOM-derived analyzer findings (structured-data validity, E-E-A-T, JS diff).
  out.push(...s.extraIssues);

  return out;
}

// Renders a URL in a headless browser and returns hydrated HTML (for JS sites).
export type RenderFn = (url: string) => Promise<{ html: string; statusCode: number | null } | null>;

// Parse a block of HTML into page signals + on-domain links. Used for both the
// raw fetched HTML and (when needed) the JS-rendered HTML.
function parseHtml(
  url: string,
  html: string,
  statusCode: number | null,
  xRobots: string,
  depth: number,
  loadMs: number,
): { signals: PageSignals; links: string[] } {
  const $ = cheerio.load(html);
  const isHttps = url.startsWith("https://");

  const title = $("title").first().text().trim() || null;
  const metaDescription = ($('meta[name="description"]').attr("content") || "").trim() || null;
  const metaRobots = ($('meta[name="robots"]').attr("content") || "").toLowerCase();
  const headerRobots = (xRobots || "").toLowerCase();
  const robots = (metaRobots + " " + headerRobots);
  // Conflict = the two directives that are BOTH present disagree on noindex.
  // A common real-world bug: CMS drops noindex in the meta tag while the header
  // still says index (or vice-versa) — search engines obey the stricter one.
  const robotsConflict =
    metaRobots !== "" && headerRobots !== "" && /noindex/.test(metaRobots) !== /noindex/.test(headerRobots);
  const canonicalCount = $('link[rel="canonical"]').length;
  const canonical = ($('link[rel="canonical"]').first().attr("href") || "").trim() || null;
  const lang = ($("html").attr("lang") || "").trim() || null;
  const viewport = $('meta[name="viewport"]').length > 0;
  const hasOgTitle = $('meta[property="og:title"]').length > 0;
  const hasOgImage = $('meta[property="og:image"]').length > 0;
  const hasTwitterCard = $('meta[name="twitter:card"]').length > 0;
  const metaRefresh = $('meta[http-equiv="refresh"], meta[http-equiv="Refresh"]').length > 0;

  // Structured data: parse each JSON-LD block, collect @type(s), flag invalid JSON.
  const structuredTypes = new Set<string>();
  const jsonLdObjects: unknown[] = [];
  let invalidJsonLd = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      jsonLdObjects.push(data);
      const collect = (o: unknown) => {
        if (Array.isArray(o)) o.forEach(collect);
        else if (o && typeof o === "object") {
          const t = (o as Record<string, unknown>)["@type"];
          if (typeof t === "string") structuredTypes.add(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && structuredTypes.add(x));
          if ((o as Record<string, unknown>)["@graph"]) collect((o as Record<string, unknown>)["@graph"]);
        }
      };
      collect(data);
    } catch {
      invalidJsonLd = true;
    }
  });
  const hasStructuredData = structuredTypes.size > 0 || invalidJsonLd;

  // hreflang set for international SEO.
  const hreflangs = $('link[rel="alternate"][hreflang]');
  const hreflangCount = hreflangs.length;
  let hreflangHasXDefault = false;
  hreflangs.each((_, el) => {
    if (($(el).attr("hreflang") || "").toLowerCase() === "x-default") hreflangHasXDefault = true;
  });

  // Insecure form: a form that submits over plain HTTP from an HTTPS page.
  let insecureForm = false;
  if (isHttps) {
    $("form[action]").each((_, el) => {
      if (($(el).attr("action") || "").trim().toLowerCase().startsWith("http://")) insecureForm = true;
    });
  }

  const bodyText = $("body").clone().find("script,style,noscript").remove().end().text().replace(/\s+/g, " ").trim();

  // Main-content text (boilerplate removed) → SimHash fingerprint for the
  // near-duplicate-content check. Prefer <main>/<article>; strip nav/header/footer.
  const scope = $("main").first().length ? $("main").first() : $("article").first().length ? $("article").first() : $("body");
  const mainText = scope.clone().find("script,style,noscript,nav,header,footer,aside,form").remove().end().text().replace(/\s+/g, " ").trim();
  const contentShingles = mainText.split(" ").length >= 120 ? computeShingles(mainText) : [];
  const wordCount = bodyText ? bodyText.split(" ").length : 0;

  let imagesNoAlt = 0;
  const imageUrls: string[] = [];
  $("img").each((_, el) => {
    const alt = $(el).attr("alt");
    // alt="" is the correct WCAG pattern for a purely decorative image (it tells
    // screen readers to skip it) — only a MISSING alt attribute is the real bug.
    if (alt === undefined) imagesNoAlt++;
    // Collect real (non-data) image URLs so a post-crawl pass can find dead ones.
    const src = ($(el).attr("src") || "").trim();
    if (src && !src.startsWith("data:") && imageUrls.length < 100) {
      try {
        const abs = new URL(src, url);
        if (abs.protocol === "http:" || abs.protocol === "https:") imageUrls.push(abs.href);
      } catch { /* ignore */ }
    }
  });

  // Mixed content: an https page pulling http resources.
  let mixedContent = false;
  if (isHttps) {
    $("img[src],script[src],link[href]").each((_, el) => {
      const v = $(el).attr("src") || $(el).attr("href") || "";
      if (v.startsWith("http://")) mixedContent = true;
    });
  }

  const host = rootHost(new URL(url).hostname);
  // Normalized base for the current page — used to detect same-page anchor links.
  const urlBase = url.split("#")[0].replace(/\/$/, "") || url;
  const links: string[] = [];
  const externalUrls: string[] = [];
  let internalLinks = 0;
  let externalLinks = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, url);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
      if (rootHost(abs.hostname) === host) {
        internalLinks++;
        // Same-page anchors (e.g. #section) never produce a new crawlable page.
        // Count them toward internalLinks for reporting but don't add to the crawl queue.
        const absBase = abs.href.split("#")[0].replace(/\/$/, "") || abs.href;
        if (absBase !== urlBase) links.push(abs.href);
      } else {
        externalLinks++;
        // Cap per page so a link farm can't bloat memory; enough to cover real pages.
        if (externalUrls.length < 250) externalUrls.push(abs.href);
      }
    } catch {
      /* ignore */
    }
  });

  const h1Count = $("h1").length;
  const h1Empty = h1Count > 0 && $("h1").toArray().every((el) => !$(el).text().trim());
  const titleEmpty = $("title").length > 0 && !title;
  // AI answer-engine structure signals: lists/tables/subheadings make content
  // "chunkable" and quotable by ChatGPT / Perplexity / Google AI Overviews.
  const h3Count = $("h3").length;
  const hasList = $("ul li, ol li").length >= 3;
  const hasTable = $("table tr").length >= 2;

  // Structured-data validity + E-E-A-T + extra on-page checks (their own modules).
  const extraIssues: Issue[] = [
    ...validateStructuredData(jsonLdObjects),
    ...detectEeat($, { wordCount, structuredTypes: [...structuredTypes] }),
    ...detectOnPageIssues($, { url, canonical, depth }),
    ...detectContentQuality({ bodyText, lang, wordCount }),
  ];

  const signals: PageSignals = {
    url, statusCode, isHtml: true, title, metaDescription,
    h1Count, h2Count: $("h2").length, wordCount, imagesNoAlt,
    internalLinks, externalLinks, canonical, canonicalCount, viewport,
    noindex: /noindex/.test(robots), robotsConflict, lang, hasStructuredData, structuredTypes: [...structuredTypes], invalidJsonLd,
    hasOgTitle, hasOgImage, hasTwitterCard, mixedContent, insecureForm, metaRefresh,
    hreflangCount, hreflangHasXDefault, titleEmpty, h1Empty, h3Count, hasList, hasTable,
    externalUrls, imageUrls, contentShingles, extraIssues, redirectHops: 0, redirectLoop: false,
    pageBytes: Buffer.byteLength(html), depth, loadMs,
  };
  return { signals, links };
}

// Fetch with a per-attempt timeout and backoff on transient failures (429,
// 5xx, network/DNS errors, timeouts). If the site blocks our own IP (403/429 or a
// hard network failure) and a proxy is configured, we switch to the residential
// proxy for the remaining attempts — so bot walls no longer break the audit.
// Never throws — returns null on give-up. redirect:"manual" so the caller can trace
// the redirect chain (see fetchTraced); this single request is NOT auto-followed.
// True if an IP literal falls in a private / loopback / link-local / reserved
// range that must never be reachable from the crawler (SSRF protection — blocks
// localhost, RFC1918, CGNAT, and the 169.254.169.254 cloud-metadata endpoint).
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // malformed → block
    const [a, b] = p;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lc = ip.toLowerCase();
    if (lc === "::1" || lc === "::") return true;
    if (lc.startsWith("fc") || lc.startsWith("fd")) return true; // unique-local
    if (lc.startsWith("fe80")) return true; // link-local
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4.
    const m = lc.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateIp(m[1]);
    return false;
  }
  return true; // not a valid IP literal → block
}

// SSRF gate: only allow http(s) to a PUBLIC host. Hostnames are DNS-resolved and
// every resolved address is checked, so a public name that points at an internal
// IP (or a redirect to one) is still blocked. Fail closed on any resolution error.
export async function isPublicUrl(url: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || host.toLowerCase() === "localhost" || host.toLowerCase().endsWith(".localhost")) return false;
  if (isIP(host)) return !isPrivateIp(host);
  try {
    const addrs = await dnsLookup(host, { all: true });
    if (!addrs.length) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

async function fetchOnce(url: string, attempts = 3, timeoutMs = 20000): Promise<Response | null> {
  // Block SSRF targets (internal/loopback/link-local/metadata) before any request.
  // Every redirect hop re-enters fetchOnce, so redirects to internal hosts are
  // blocked too.
  if (!(await isPublicUrl(url))) return null;
  let useProxy = false;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const dispatcher = useProxy ? proxyDispatcher() : undefined;
    try {
      const res = (await uFetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        ...(dispatcher ? { dispatcher } : {}),
      })) as unknown as Response;
      clearTimeout(timer);
      // Blocked by the site (403/429): retry through the residential proxy once.
      if ((res.status === 403 || res.status === 429) && !useProxy && proxyDispatcher() && i < attempts - 1) {
        useProxy = true;
        continue;
      }
      // Retry transient server states; return everything else (incl. 3xx/4xx) as-is.
      if ((res.status === 429 || res.status >= 500) && i < attempts - 1) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 15000) : 1000 * (i + 1) ** 2;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return res;
    } catch {
      clearTimeout(timer);
      // A hard network failure from our own IP — try the proxy before giving up.
      if (!useProxy && proxyDispatcher()) {
        useProxy = true;
        continue;
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

export interface RedirectTrace {
  res: Response | null;
  chain: { url: string; status: number }[]; // each 3xx hop taken
  loop: boolean;
  tooMany: boolean;
}

// Follow redirects MANUALLY (up to 10 hops), recording each one, so the audit can
// flag redirect CHAINS (2+ hops = slow, wastes crawl budget, dilutes link equity)
// and LOOPS (page never resolves). Returns the final non-3xx response + the chain.
async function fetchTraced(url: string): Promise<RedirectTrace> {
  // A loop is the EXACT same URL revisited — keep trailing slash + protocol so a
  // legitimate "/page -> /page/" or "http -> https" 301 is NOT mistaken for a loop.
  // (normalize() strips those, which false-flagged trailing-slash redirects.)
  const visitKey = (u: string): string => {
    try {
      const x = new URL(u);
      x.hash = "";
      x.hostname = x.hostname.toLowerCase();
      return x.href;
    } catch {
      return u;
    }
  };
  const chain: { url: string; status: number }[] = [];
  const seen = new Set<string>([visitKey(url)]);
  let current = url;
  for (let hop = 0; hop <= 10; hop++) {
    const res = await fetchOnce(current);
    if (!res) return { res: null, chain, loop: false, tooMany: false };
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      // Drain the redirect body — we never read a 3xx body, and leaving it open
      // makes undici throw on the next request in the chain.
      await (res.body as { cancel?: () => Promise<void> } | null)?.cancel?.().catch(() => {});
      if (!loc) return { res, chain, loop: false, tooMany: false };
      let next: string;
      try {
        next = new URL(loc, current).href;
      } catch {
        return { res, chain, loop: false, tooMany: false };
      }
      chain.push({ url: current, status: res.status });
      const key = visitKey(next);
      if (seen.has(key)) return { res, chain, loop: true, tooMany: false }; // redirect loop
      seen.add(key);
      current = next;
      if (hop === 10) return { res, chain, loop: false, tooMany: true };
      continue;
    }
    return { res, chain, loop: false, tooMany: false }; // reached a real page
  }
  return { res: null, chain, loop: false, tooMany: true };
}

async function fetchPage(url: string, depth: number, render?: RenderFn): Promise<{ page: CrawledPage; links: string[] }> {
  const t0 = Date.now();
  const build = (s: PageSignals): CrawledPage => ({
    url: s.url,
    statusCode: s.statusCode,
    title: s.title,
    titleLength: s.title ? s.title.length : null,
    metaDescription: s.metaDescription,
    metaLength: s.metaDescription ? s.metaDescription.length : null,
    h1Count: s.h1Count,
    wordCount: s.wordCount,
    imagesNoAlt: s.imagesNoAlt,
    internalLinks: s.internalLinks,
    externalLinks: s.externalLinks,
    externalUrls: s.externalUrls,
    imageUrls: s.imageUrls,
    contentShingles: s.contentShingles,
    canonical: s.canonical,
    depth: s.depth,
    loadMs: s.loadMs,
    issues: computeIssues(s),
  });

  try {
    const trace = await fetchTraced(url);
    const res = trace.res;
    const redirectHops = trace.chain.length;
    const redirectLoop = trace.loop || trace.tooMany;
    const withRedirect = (s: PageSignals): PageSignals => ({ ...s, redirectHops, redirectLoop });
    const loadMs = Date.now() - t0;
    if (!res) {
      // Unreachable after retries (DNS, connection refused, timeout).
      return { page: build(withRedirect(blankSignals(url, depth, loadMs, null, false))), links: [] };
    }
    const statusCode = res.status;
    const contentType = res.headers.get("content-type") || "";
    const xRobots = (res.headers.get("x-robots-tag") || "").toLowerCase();

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      // Non-HTML (asset, feed, API). Record the status; nothing to parse.
      const s: PageSignals = blankSignals(url, depth, loadMs, statusCode, false);
      return { page: build(withRedirect(s)), links: [] };
    }
    if (statusCode >= 400 || (statusCode >= 300 && statusCode < 400)) {
      // Broken/blocked page, or a redirect we couldn't resolve to a final page.
      return { page: build(withRedirect(blankSignals(url, depth, loadMs, statusCode, true))), links: [] };
    }

    // Guard against pathologically large bodies (streaming bombs).
    const lenHeader = Number(res.headers.get("content-length"));
    if (Number.isFinite(lenHeader) && lenHeader > 8_000_000) {
      return { page: build(withRedirect(blankSignals(url, depth, loadMs, statusCode, true))), links: [] };
    }
    let html = await res.text();
    if (html.length > 8_000_000) html = html.slice(0, 8_000_000);

    let { signals, links } = parseHtml(url, html, statusCode, xRobots, depth, loadMs);
    signals = withRedirect(signals);

    // JS-render fallback. Trigger when the raw HTML looks JS-rendered:
    // - No distinct crawlable links found (classic SPA, or a site where every
    //   "link" is a same-page #anchor — hash-only anchors are excluded from
    //   `links` so they can't mask a JS-rendered navigation).
    // - OR the MAIN content is missing (no H1 + thin body), e.g. a blog page
    //   whose article is injected by JavaScript.
    const looksJsRendered = links.length === 0 || (signals.h1Count === 0 && signals.wordCount < 300);
    if (render && looksJsRendered) {
      const rawWords = signals.wordCount;
      const rawLinks = links.length; // crawlable (non-hash) link count before rendering
      const rawH1 = signals.h1Count;
      const rendered = await render(url);
      if (rendered?.html) {
        const reparsed = parseHtml(url, rendered.html, rendered.statusCode ?? statusCode, xRobots, depth, Date.now() - t0);
        if (reparsed.links.length > links.length || reparsed.signals.wordCount > signals.wordCount) {
          signals = withRedirect(reparsed.signals);
          links = reparsed.links;
          // JS-dependent content/navigation: the raw HTML (what non-rendering
          // crawlers and AI answer engines like GPTBot see) is materially thinner
          // than the rendered DOM. Googlebot renders, but the gap is still a risk.
          const contentGap = rawWords < 250 && signals.wordCount - rawWords >= 150;
          const navGap = rawLinks === 0 && links.length >= 5;
          const h1Gap = rawH1 === 0 && signals.h1Count > 0;
          if (contentGap || navGap || h1Gap) {
            signals = {
              ...signals,
              extraIssues: [
                ...signals.extraIssues,
                {
                  code: "js-dependent-content",
                  severity: "warning",
                  category: "technical",
                  message: `Content/links appear only after JavaScript runs (raw ${rawWords} words / ${rawLinks} links → rendered ${signals.wordCount} / ${links.length}) — non-rendering crawlers and AI answer engines may see little`,
                },
              ],
            };
          }
        }
      }
    }

    return { page: build(signals), links };
  } catch {
    const loadMs = Date.now() - t0;
    return { page: build(blankSignals(url, depth, loadMs, null, false)), links: [] };
  }
}

function blankSignals(url: string, depth: number, loadMs: number, statusCode: number | null, isHtml: boolean): PageSignals {
  return {
    url, statusCode, isHtml, title: null, metaDescription: null, h1Count: 0, h2Count: 0,
    wordCount: 0, imagesNoAlt: 0, internalLinks: 0, externalLinks: 0, canonical: null, canonicalCount: 0,
    viewport: false, noindex: false, robotsConflict: false, lang: null, hasStructuredData: false, structuredTypes: [], invalidJsonLd: false,
    hasOgTitle: false, hasOgImage: false, hasTwitterCard: false, mixedContent: false, insecureForm: false,
    metaRefresh: false, hreflangCount: 0, hreflangHasXDefault: false, titleEmpty: false, h1Empty: false,
    h3Count: 0, hasList: false, hasTable: false, externalUrls: [], imageUrls: [], contentShingles: [], extraIssues: [], redirectHops: 0, redirectLoop: false, pageBytes: 0, depth, loadMs,
  };
}

// Breadth-first crawl with a fixed concurrency pool. Streams each finished page.
export async function crawlSite(startUrl: string, opts: CrawlOptions = {}): Promise<void> {
  const maxPages = opts.maxPages ?? 1000;
  const concurrency = opts.concurrency ?? 14;
  const maxDepth = opts.maxDepth ?? 10;

  const startNorm = normalize(startUrl);
  const host = rootHost(new URL(startUrl).hostname);
  // Canonical host form for this crawl. Sites that serve BOTH www and non-www
  // (no redirect) would otherwise be crawled twice — every page duplicated. We
  // fold every on-site URL to the start URL's host so each page is crawled once.
  const startHost = new URL(startUrl).hostname;
  const seen = new Set<string>([startNorm]);
  const queue: { url: string; depth: number }[] = [{ url: startNorm, depth: 0 }];
  // Cap how many query-string variants of the same path we enqueue, so faceted
  // navigation / calendars / session-id URLs can't trap the crawl forever.
  const perPath = new Map<string, number>();
  const MAX_PER_PATH = 150;
  // Bound the dedupe set so a runaway site can't exhaust memory.
  const seenCap = Math.max(200_000, maxPages * 4);
  let crawled = 0;
  let active = 0;

  const enqueue = (link: string, depth: number) => {
    if (seen.size >= seenCap) return;
    if (!isCrawlableUrl(link)) return;
    let n: string;
    let hostname: string;
    try {
      const u = new URL(link);
      hostname = u.hostname;
      // Fold www/non-www to one canonical host so a page isn't crawled twice.
      if (rootHost(hostname) === host) u.hostname = startHost;
      n = normalize(u.href);
    } catch {
      return;
    }
    if (rootHost(hostname) !== host) return; // stay on the target site
    if (seen.has(n)) return;
    const pk = pathKey(n);
    const seenForPath = perPath.get(pk) ?? 0;
    if (seenForPath >= MAX_PER_PATH) return; // trap guard
    perPath.set(pk, seenForPath + 1);
    seen.add(n);
    queue.push({ url: n, depth });
  };

  // Seed the frontier with sitemap URLs so orphan pages (in the sitemap but not
  // internally linked) are still crawled. They enter at depth 1.
  for (const s of opts.seeds ?? []) enqueue(s, 1);

  return new Promise<void>((resolve) => {
    const pump = () => {
      // User cancelled — stop taking new work, resolve once in-flight pages drain.
      if (opts.signal?.aborted) {
        if (active === 0) resolve();
        return;
      }
      if (crawled >= maxPages || (queue.length === 0 && active === 0)) {
        if (active === 0) resolve();
        return;
      }
      while (active < concurrency && queue.length > 0 && crawled < maxPages) {
        const job = queue.shift()!;
        active++;
        void processPage(job).finally(() => {
          active--;
          pump();
        });
      }
    };

    const processPage = async (job: { url: string; depth: number }) => {
      if (crawled >= maxPages) return;
      // fetchPage never throws, but guard anyway so one bad page can't stop the crawl.
      let result: { page: CrawledPage; links: string[] };
      try {
        result = await fetchPage(job.url, job.depth, opts.render);
      } catch {
        return;
      }
      crawled++;
      // Normalized on-domain targets for the link graph (inlinks/orphans/broken).
      const targets = new Set<string>();
      for (const link of result.links) {
        if (!isCrawlableUrl(link)) continue;
        try {
          if (rootHost(new URL(link).hostname) === host) targets.add(normalize(link));
        } catch {
          /* ignore */
        }
      }
      result.page.outlinks = [...targets];
      try {
        opts.onPage?.(result.page);
      } catch {
        /* a consumer error must not abort crawling */
      }
      if (job.depth < maxDepth) {
        for (const link of result.links) enqueue(link, job.depth + 1);
      }
    };

    pump();
  });
}

// Does robots.txt block the WHOLE site for all bots? Conservative parser (only
// flags a genuine "User-agent: * / Disallow: /" with no re-allow) to avoid the kind
// of false positive we just fixed on the canonical check.
function robotsBlocksAll(txt: string): boolean {
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
  let inStar = false, sawStar = false, disallowRoot = false, allowRoot = false;
  for (const line of lines) {
    const m = /^(user-agent|disallow|allow):\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") { inStar = val === "*"; if (inStar) sawStar = true; }
    else if (inStar && key === "disallow" && val === "/") disallowRoot = true;
    else if (inStar && key === "allow" && val === "/") allowRoot = true;
  }
  return sawStar && disallowRoot && !allowRoot;
}

// Is a specific bot fully blocked (Disallow: /) in its own robots.txt group?
function robotsBlocksAgent(txt: string, agent: string): boolean {
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
  let inAgent = false, blocked = false;
  for (const line of lines) {
    const m = /^(user-agent|disallow|allow):\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") inAgent = val.toLowerCase() === agent.toLowerCase();
    else if (inAgent && key === "disallow" && val === "/") blocked = true;
    else if (inAgent && key === "allow" && val === "/") blocked = false;
  }
  return blocked;
}

// One-off site-level checks done once per crawl: HTTPS, security headers, robots.txt
// (presence + whole-site block + sitemap declaration), and sitemap presence.
export async function siteChecks(startUrl: string): Promise<Issue[]> {
  const out: Issue[] = [];
  const origin = new URL(startUrl).origin;
  const isHttps = startUrl.startsWith("https://");

  // Fetch the homepage once to read its response headers (security config).
  let headers: Headers | null = null;
  try {
    if (await isPublicUrl(origin + "/")) {
      const r = await fetch(origin + "/", { redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "User-Agent": UA } });
      headers = r.headers;
    }
  } catch {
    /* ignore — header checks just skip */
  }
  const getText = async (path: string): Promise<string | null> => {
    try {
      if (!(await isPublicUrl(origin + path))) return null; // SSRF guard
      const r = await fetch(origin + path, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": UA } });
      return r.ok ? await r.text() : null;
    } catch {
      return null;
    }
  };

  // ---- HTTPS + security headers ----
  if (!isHttps) out.push({ code: "site-no-https", severity: "error", category: "security", message: "Site is not served over HTTPS" });
  if (headers) {
    const h = (k: string) => (headers!.get(k) || "").toLowerCase();
    const csp = h("content-security-policy");
    if (isHttps && !h("strict-transport-security"))
      out.push({ code: "no-hsts", severity: "warning", category: "security", message: "Missing HSTS header (Strict-Transport-Security) — lets browsers force HTTPS" });
    if (!csp)
      out.push({ code: "no-csp", severity: "notice", category: "security", message: "No Content-Security-Policy header (XSS / injection hardening)" });
    if (!h("x-content-type-options"))
      out.push({ code: "no-xcto", severity: "notice", category: "security", message: "Missing X-Content-Type-Options: nosniff header" });
    if (!h("x-frame-options") && !csp.includes("frame-ancestors"))
      out.push({ code: "no-clickjack-protection", severity: "notice", category: "security", message: "No clickjacking protection (X-Frame-Options or CSP frame-ancestors)" });
    if (h("referrer-policy") === "")
      out.push({ code: "no-referrer-policy", severity: "notice", category: "security", message: "No Referrer-Policy header" });
  }

  // ---- robots.txt ----
  const robots = await getText("/robots.txt");
  if (robots == null) {
    out.push({ code: "no-robots", severity: "warning", category: "crawlability", message: "robots.txt not found" });
  } else {
    if (robotsBlocksAll(robots))
      out.push({ code: "robots-blocks-site", severity: "error", category: "crawlability", message: "robots.txt blocks the entire site (User-agent: * / Disallow: /)" });
    if (!/sitemap:\s*https?:\/\//i.test(robots))
      out.push({ code: "sitemap-not-in-robots", severity: "notice", category: "crawlability", message: "Sitemap is not declared in robots.txt" });
    // AI/GEO readiness: are AI answer-engine crawlers blocked?
    const aiBots = ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"];
    const blocked = aiBots.filter((b) => robotsBlocksAgent(robots, b));
    if (blocked.length)
      out.push({ code: "ai-crawlers-blocked", severity: "notice", category: "crawlability", message: `AI answer-engine crawlers blocked in robots.txt: ${blocked.join(", ")} — hurts visibility in ChatGPT / Perplexity / AI Overviews` });
  }

  // ---- sitemap ---- (also honour a sitemap declared at a custom path in robots.txt)
  const robotsDeclaresSitemap = !!robots && /sitemap:\s*https?:\/\//i.test(robots);
  const hasSitemap = robotsDeclaresSitemap || (await getText("/sitemap.xml")) || (await getText("/sitemap_index.xml"));
  if (!hasSitemap) out.push({ code: "no-sitemap", severity: "warning", category: "crawlability", message: "No XML sitemap found — search engines may not discover all your pages" });

  // ---- AI/GEO readiness: llms.txt (emerging standard that points AI models to key content) ----
  if ((await getText("/llms.txt")) == null)
    out.push({ code: "no-llms-txt", severity: "notice", category: "technical", message: "No llms.txt found — the emerging standard for guiding AI models to your key content" });

  return out;
}

// Detect the technology stack (CMS, frameworks, analytics, server, CDN) from the
// home page HTML + response headers - a lightweight Wappalyzer-style fingerprint.
export async function detectTechnologies(url: string): Promise<{ name: string; category: string }[]> {
  try {
    if (!(await isPublicUrl(url))) return []; // SSRF guard
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": UA } });
    const html = await res.text();
    const h = res.headers;
    const found = new Map<string, string>();
    const add = (name: string, cat: string) => {
      if (!found.has(name)) found.set(name, cat);
    };
    const has = (re: RegExp) => re.test(html);
    const server = (h.get("server") || "").toLowerCase();
    const xpb = (h.get("x-powered-by") || "").toLowerCase();
    const setCookie = (h.get("set-cookie") || "").toLowerCase();

    // Infrastructure
    if (h.get("cf-ray") || server.includes("cloudflare")) add("Cloudflare", "CDN");
    if (server.includes("nginx")) add("Nginx", "Web server");
    if (server.includes("apache")) add("Apache", "Web server");
    if (server.includes("vercel") || h.get("x-vercel-id")) add("Vercel", "Hosting");
    if (xpb.includes("php") || html.includes("PHPSESSID")) add("PHP", "Language");
    if (xpb.includes("express")) add("Express", "Web framework");
    if (xpb.includes("asp.net") || server.includes("asp.net")) add("ASP.NET", "Web framework");

    // Server frameworks — Laravel leaves a session/CSRF cookie + CSRF-token meta.
    // These are the reliable signals (a bare "PHP" says nothing about the framework).
    if (
      /laravel_session/.test(setCookie) ||
      has(/<meta[^>]+name=["']csrf-token["']/i) ||
      has(/\/vendor\/laravel\//i)
    )
      add("Laravel", "Web framework");
    // Laravel companions (imply a Laravel + JS SPA app)
    if (has(/wire:id|wire:model|wire:click|livewire/i)) add("Livewire", "Web framework");
    if (has(/data-page=["']\{|@inertiajs|inertia/i)) add("Inertia.js", "Web framework");
    if (has(/\bdjango\b|csrfmiddlewaretoken/i)) add("Django", "Web framework");
    if (has(/\brails\b|csrf-param|data-turbo/i) || xpb.includes("phusion")) add("Ruby on Rails", "Web framework");

    // Build tools — Vite/Webpack asset paths (common in Laravel + React/Vue apps)
    if (has(/\/build\/assets\/|\/@vite\/client|["']\/@vite|__vite__|data-vite/i)) add("Vite", "Build tool");

    // CMS / builders / ecommerce
    // Match real framework MARKERS (paths, cookies, JS globals) — NOT the plain
    // brand word, which appears in the text of any agency that sells these services.
    if (has(/\/wp-content\/|\/wp-includes\/|\/wp-json\//i)) add("WordPress", "CMS");
    if (has(/cdn\.shopify\.com|x-shopify/i) || h.get("x-shopify-stage")) add("Shopify", "Ecommerce");
    if (has(/static\.wixstatic\.com/i)) add("Wix", "Website builder");
    if (has(/static1?\.squarespace\.com|squarespace-cdn/i)) add("Squarespace", "Website builder");
    if (has(/Drupal\.settings|\/sites\/(all|default)\/(modules|themes|files)\/|\/core\/misc\/drupal/i)) add("Drupal", "CMS");
    if (has(/\/media\/jui\/|com_content|option=com_|joomla!/i)) add("Joomla", "CMS");
    if (has(/assets\.website-files\.com|\.webflow\.io/i)) add("Webflow", "Website builder");
    if (has(/\/wp-content\/plugins\/woocommerce|woocommerce-page|wc-block|x-wc-/i)) add("WooCommerce", "Ecommerce");
    if (has(/\/static\/frontend\/|Magento_[A-Z]|mage\/cookies|x-magento/i)) add("Magento", "Ecommerce");

    // JS frameworks / libraries. Modern React (esp. Vite/Inertia SPAs) no longer
    // emits data-reactroot, so also match the runtime chunk names + the common
    // "<div id="root|app">" + module-script combo, and treat Inertia as React-ish.
    if (has(/__NEXT_DATA__|\/_next\//)) add("Next.js", "JS framework");
    else if (
      has(/data-reactroot|react-dom|_reactListening|jsx-runtime|__reactContainer|react\.(production|development)|\/react@/i) ||
      (has(/id=["'](root|app)["']/i) && has(/<script[^>]+type=["']module["']/i))
    )
      add("React", "JS library");
    if (has(/__NUXT__|\/_nuxt\//)) add("Nuxt.js", "JS framework");
    else if (has(/data-v-[0-9a-f]{8}/i)) add("Vue.js", "JS library");
    if (has(/ng-version/i)) add("Angular", "JS framework");
    if (has(/gatsby/i)) add("Gatsby", "JS framework");
    if (has(/jquery/i)) add("jQuery", "JS library");
    if (has(/bootstrap(\.min)?\.(css|js)/i)) add("Bootstrap", "UI framework");
    if (has(/cdn\.tailwindcss|tailwind/i)) add("Tailwind CSS", "UI framework");
    if (has(/fonts\.googleapis\.com/i)) add("Google Fonts", "Fonts");
    if (has(/font-awesome|fontawesome/i)) add("Font Awesome", "Fonts");

    // Analytics / marketing
    if (has(/googletagmanager\.com\/gtm/i)) add("Google Tag Manager", "Tag manager");
    if (has(/google-analytics\.com|gtag\(|googletagmanager\.com\/gtag|ga\('create'/i)) add("Google Analytics", "Analytics");
    if (has(/connect\.facebook\.net|fbq\(/i)) add("Facebook Pixel", "Analytics");
    if (has(/static\.hotjar\.com|hotjar/i)) add("Hotjar", "Analytics");
    if (has(/clarity\.ms/i)) add("Microsoft Clarity", "Analytics");
    if (has(/hs-scripts\.com|js\.hsubspot|hubspot/i)) add("HubSpot", "Marketing");
    if (has(/cdn\.segment\.com/i)) add("Segment", "Analytics");

    return Array.from(found.entries()).map(([name, category]) => ({ name, category }));
  } catch {
    return [];
  }
}
