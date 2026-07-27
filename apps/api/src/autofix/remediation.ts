// Audit → remediation plan.
//
// Turns audit issue codes into concrete changes. The honest split: some fixes
// are whole-file SITE ARTIFACTS that live at a known path (llms.txt, robots.txt,
// security headers) — those we can generate byte-for-byte and ship in a PR. The
// rest need edits inside the client's page templates (per-page meta, schema,
// alt text) — those we surface as "manual" with guidance rather than guessing
// which file to touch. This module is pure so it is fully unit-testable.

export type FileAction = "create" | "append";

export interface FileChange {
  path: string; // repo-relative path
  action: FileAction;
  content: string; // full file (create) or the block to append
  reason: string; // the issue code this addresses
}

export interface ManualItem {
  code: string;
  note: string;
}

export interface RemediationPlan {
  files: FileChange[];
  manual: ManualItem[];
}

export interface RemediationContext {
  domain: string; // bare host, e.g. "acme.com"
  brand?: string; // display name for templates
}

function origin(domain: string): string {
  return `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}

function llmsTxt(ctx: RemediationContext): string {
  const site = origin(ctx.domain);
  const name = ctx.brand || ctx.domain;
  return [
    `# ${name}`,
    "",
    `> ${name} — see the sitemap for the full list of indexable pages.`,
    "",
    "## Key pages",
    `- [Home](${site}/)`,
    `- [Sitemap](${site}/sitemap.xml)`,
    "",
    "## Notes",
    "- This file follows the emerging llms.txt convention to guide AI models to primary content.",
    "",
  ].join("\n");
}

function robotsTxt(domain: string): string {
  return ["User-agent: *", "Allow: /", "", `Sitemap: ${origin(domain)}/sitemap.xml`, ""].join("\n");
}

// Netlify / Cloudflare Pages `_headers` block for the security headers the audit
// found missing. Only the missing ones are emitted.
function securityHeaders(missing: Set<string>): string | null {
  const lines: string[] = [];
  if (missing.has("no-hsts")) lines.push("  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload");
  if (missing.has("no-csp")) lines.push("  Content-Security-Policy: default-src 'self'; object-src 'none'; frame-ancestors 'self'");
  if (missing.has("no-xcto")) lines.push("  X-Content-Type-Options: nosniff");
  if (missing.has("no-clickjack-protection")) lines.push("  X-Frame-Options: SAMEORIGIN");
  if (missing.has("no-referrer-policy")) lines.push("  Referrer-Policy: strict-origin-when-cross-origin");
  if (!lines.length) return null;
  return ["/*", ...lines, ""].join("\n");
}

// Per-page issues that need template edits, not a whole-file artifact.
const MANUAL_NOTES: Record<string, string> = {
  "missing-title": "Add a unique <title> to the affected page templates.",
  "missing-meta": "Add a <meta name=\"description\"> to the affected pages.",
  "missing-h1": "Ensure each affected page renders exactly one <h1>.",
  "missing-og": "Add Open Graph tags (og:title, og:image, og:description) to the page <head>.",
  "missing-og-image": "Add an <meta property=\"og:image\"> to the affected pages.",
  "no-structured-data": "Add JSON-LD structured data appropriate to each page type.",
  "incomplete-structured-data": "Fill in the missing required fields on existing JSON-LD blocks.",
  "no-breadcrumb-schema": "Add BreadcrumbList JSON-LD to templates with breadcrumb navigation.",
  "img-no-alt": "Add descriptive alt text to the flagged images.",
  "no-author": "Add a visible author/byline to content pages.",
  "ai-crawlers-blocked": "Review robots.txt — AI-crawler blocks are intentional-looking, so confirm before allowing.",
  "js-dependent-content": "Server-render or pre-render key content so non-JS crawlers can read it.",
  "poor-answer-structure": "Break long pages into subheadings, lists and tables so AI engines can quote them.",
};

export function buildRemediationPlan(codes: string[], ctx: RemediationContext): RemediationPlan {
  const set = new Set(codes);
  const files: FileChange[] = [];
  const manual: ManualItem[] = [];

  if (set.has("no-llms-txt")) {
    files.push({ path: "public/llms.txt", action: "create", content: llmsTxt(ctx), reason: "no-llms-txt" });
  }
  if (set.has("no-robots")) {
    files.push({ path: "public/robots.txt", action: "create", content: robotsTxt(ctx.domain), reason: "no-robots" });
  } else if (set.has("sitemap-not-in-robots")) {
    // robots.txt exists — just append the missing Sitemap declaration.
    files.push({
      path: "public/robots.txt",
      action: "append",
      content: `\nSitemap: ${origin(ctx.domain)}/sitemap.xml\n`,
      reason: "sitemap-not-in-robots",
    });
  }

  const headerCodes = new Set(["no-hsts", "no-csp", "no-xcto", "no-clickjack-protection", "no-referrer-policy"]);
  const missingHeaders = new Set([...set].filter((c) => headerCodes.has(c)));
  const headerBlock = securityHeaders(missingHeaders);
  if (headerBlock) {
    files.push({ path: "public/_headers", action: "create", content: headerBlock, reason: [...missingHeaders].join(",") });
  }

  // Everything else that has a known manual note, and isn't auto-handled above.
  const autoHandled = new Set(["no-llms-txt", "no-robots", "sitemap-not-in-robots", ...headerCodes]);
  for (const code of set) {
    if (autoHandled.has(code)) continue;
    if (MANUAL_NOTES[code]) manual.push({ code, note: MANUAL_NOTES[code] });
  }

  return { files, manual };
}
