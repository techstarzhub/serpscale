// Additional on-page checks that run on the cheerio DOM (no extra network).
// These fill the gaps a complete SEO audit is expected to catch beyond the core
// title/meta/heading checks. Pure function → unit-tested; results are merged
// into the page's issue list via `extraIssues`.
import type { CheerioAPI } from "cheerio";
import type { Issue } from "./crawler";
import { sameSite } from "./domain";

// Anchor text that tells search engines (and users) nothing about the target.
const GENERIC_ANCHORS = new Set([
  "click here", "here", "read more", "more", "learn more", "link", "this",
  "click", "details", "view", "continue", "go", "read", "see more",
]);

const DEPRECATED_TAGS = ["center", "font", "marquee", "blink", "big", "strike", "tt", "frame", "frameset"];

export function detectOnPageIssues(
  $: CheerioAPI,
  ctx: { url: string; canonical: string | null; depth: number },
): Issue[] {
  const out: Issue[] = [];
  const add = (code: string, severity: Issue["severity"], category: Issue["category"], message: string) =>
    out.push({ code, severity, category, message });

  // ---- Head / document ----
  if ($("title").length > 1) add("multiple-title", "warning", "onpage", "More than one <title> tag (search engines may use the wrong one)");
  if ($("meta[charset], meta[http-equiv='Content-Type' i]").length === 0)
    add("missing-charset", "notice", "technical", "No character-encoding meta tag (<meta charset>)");
  if ($("link[rel~='icon'], link[rel='shortcut icon' i]").length === 0)
    add("missing-favicon", "notice", "technical", "No favicon declared");

  // Viewport that blocks pinch-zoom locks out low-vision users (accessibility).
  const vp = ($("meta[name='viewport' i]").attr("content") || "").toLowerCase();
  if (/user-scalable\s*=\s*(no|0)/.test(vp) || /maximum-scale\s*=\s*(1|1\.0|0)/.test(vp))
    add("viewport-blocks-zoom", "warning", "technical", "Viewport disables zoom (user-scalable=no / maximum-scale=1) — blocks accessibility");

  // ---- Images without dimensions (cause layout shift / CLS) ----
  let imgNoDim = 0;
  $("img[src]").each((_, el) => {
    if (!$(el).attr("width") || !$(el).attr("height")) imgNoDim++;
  });
  if (imgNoDim > 0) add("img-no-dimensions", "notice", "performance", `${imgNoDim} image(s) missing width/height — causes layout shift (CLS)`);

  // ---- Headings: empty heading tags ----
  let emptyHeadings = 0;
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    if (!$(el).text().trim() && $(el).find("img[alt]").length === 0) emptyHeadings++;
  });
  if (emptyHeadings > 0) add("empty-heading", "notice", "onpage", `${emptyHeadings} empty heading tag(s) — confuses document structure`);

  // ---- Links: nofollow-internal, generic anchor text, empty links ----
  let nofollowInternal = 0;
  let genericAnchors = 0;
  let emptyLinks = 0;
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href || href.startsWith("#")) return;
    const rel = ($(el).attr("rel") || "").toLowerCase();
    try {
      const abs = new URL(href, ctx.url);
      if ((abs.protocol === "http:" || abs.protocol === "https:") && sameSite(ctx.url, abs.href) && /\bnofollow\b/.test(rel)) {
        nofollowInternal++;
      }
    } catch { /* ignore */ }
    const text = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
    if (text && GENERIC_ANCHORS.has(text)) genericAnchors++;
    // A link with no text, no aria-label/title and no image alt is unreadable.
    if (!text && !$(el).attr("aria-label") && !$(el).attr("title") && $(el).find("img[alt]").filter((_, i) => !!$(i).attr("alt")?.trim()).length === 0) {
      emptyLinks++;
    }
  });
  if (nofollowInternal > 0) add("nofollow-internal", "notice", "links", `${nofollowInternal} internal link(s) are nofollow — wastes internal link equity`);
  if (genericAnchors >= 3) add("generic-anchor", "notice", "onpage", `${genericAnchors} link(s) use generic anchor text (e.g. “click here”, “read more”)`);
  if (emptyLinks > 0) add("empty-link", "warning", "onpage", `${emptyLinks} link(s) have no readable text (bad for SEO and screen readers)`);

  // ---- Canonical: cross-domain or relative ----
  if (ctx.canonical) {
    const raw = ctx.canonical.trim();
    if (!/^https?:\/\//i.test(raw)) add("canonical-relative", "notice", "indexability", "Canonical URL is relative — use an absolute https:// URL");
    try {
      if (!sameSite(ctx.url, new URL(raw, ctx.url).href)) add("canonical-to-external", "warning", "indexability", "Canonical points to a different domain");
    } catch { /* ignore */ }
  }

  // ---- Deprecated / obsolete HTML elements ----
  if (DEPRECATED_TAGS.some((t) => $(t).length > 0)) add("deprecated-html", "notice", "technical", "Page uses obsolete HTML tags (e.g. <font>, <center>, <marquee>)");

  // ---- Duplicate id attributes (invalid HTML, breaks anchors / JS / a11y) ----
  const ids = new Map<string, number>();
  $("[id]").each((_, el) => {
    const id = ($(el).attr("id") || "").trim();
    if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
  });
  const dupIds = [...ids.values()].filter((n) => n > 1).length;
  if (dupIds > 0) add("duplicate-id", "notice", "technical", `${dupIds} duplicated id attribute(s) — invalid HTML, can break in-page anchors and scripts`);

  // ---- Excessive DOM size (slows rendering, a Lighthouse signal) ----
  const domNodes = $("*").length;
  if (domNodes > 1500) add("excessive-dom", "notice", "performance", `Very large DOM (${domNodes} elements) — slows rendering and interactivity`);

  // ---- Buried deep in the site (hard for crawlers to reach) ----
  if (ctx.depth > 3) add("deep-page", "notice", "crawlability", `Page is ${ctx.depth} clicks from the homepage — deep pages get crawled less`);

  return out;
}
