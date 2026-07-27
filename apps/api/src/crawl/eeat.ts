// E-E-A-T (Experience, Expertise, Authoritativeness, Trust) signal detection.
//
// Google's helpful-content + quality systems reward pages that show who wrote
// them, who stands behind them, and how to reach the business. We can't measure
// "trust" directly, but we CAN detect whether the on-page markers exist. Runs on
// the cheerio DOM the crawler already built, so it adds no fetch cost.
import type { CheerioAPI } from "cheerio";
import type { Issue } from "./crawler";

export interface EeatSignals {
  hasAuthor: boolean;
  hasContact: boolean;
  hasTestimonial: boolean;
  hasTrustBadge: boolean;
}

const AUTHOR_SEL =
  '[rel~="author"], [itemprop="author"], a[href*="/author/"], .author, .byline, .post-author, .entry-author, .author-name';
const TESTIMONIAL_SEL =
  '[class*="testimonial" i], [id*="testimonial" i], [class*="review" i], [itemtype*="Review"]';
const TRUST_RE = /\b(secure|ssl|verified|certified|guarantee|trusted|accredited|official partner|money[- ]back)\b/i;

// Extract the raw E-E-A-T markers present on the page.
export function eeatSignals($: CheerioAPI): EeatSignals {
  const hasAuthor =
    $(AUTHOR_SEL).length > 0 || $('meta[name="author"]').attr("content")?.trim() ? true : false;

  const hasContact =
    $('a[href^="tel:"]').length > 0 ||
    $('a[href^="mailto:"]').length > 0 ||
    $('a[href*="/contact" i]').length > 0 ||
    $('[itemtype*="PostalAddress"], address').length > 0;

  const hasTestimonial = $(TESTIMONIAL_SEL).length > 0;

  // Trust badges: images whose alt/src hint at a security/quality seal.
  let hasTrustBadge = false;
  $("img").each((_, el) => {
    const hay = `${$(el).attr("alt") || ""} ${$(el).attr("src") || ""}`;
    if (TRUST_RE.test(hay)) { hasTrustBadge = true; return false; }
  });

  return { hasAuthor, hasContact, hasTestimonial, hasTrustBadge };
}

// Turn the signals into audit issues. Kept high-precision: we only flag the
// author gap on genuine content pages (where authorship is a real ranking
// factor), and a broad trust gap only when the page shows NONE of the markers.
export function detectEeat(
  $: CheerioAPI,
  ctx: { wordCount: number; structuredTypes: string[] },
): Issue[] {
  const s = eeatSignals($);
  const issues: Issue[] = [];

  const isArticle = ctx.structuredTypes.some((t) => /Article|BlogPosting|NewsArticle/.test(t));
  const isContentPage = isArticle || ctx.wordCount >= 600;

  if (isContentPage && !s.hasAuthor) {
    issues.push({
      code: "no-author",
      severity: "notice",
      category: "content",
      message: "Content page has no visible author/byline — weakens E-E-A-T and helpful-content signals",
    });
  }

  // A substantial page showing no author, no contact path AND no trust markers
  // reads as low-trust to both users and Google.
  if (ctx.wordCount >= 300 && !s.hasAuthor && !s.hasContact && !s.hasTestimonial && !s.hasTrustBadge) {
    issues.push({
      code: "weak-eeat",
      severity: "notice",
      category: "content",
      message: "No trust signals found (author, contact, testimonials or trust badges) — low E-E-A-T",
    });
  }

  return issues;
}
