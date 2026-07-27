// Full-site accessibility audit (axe-core in a real browser).
//
// Lighthouse only scores the homepage. This runs axe-core (WCAG 2.0/2.1 A + AA)
// against a SAMPLE of the crawled pages in headless Chromium, so contrast,
// heading order, alt text, form labels, touch targets etc. are checked across
// the site — not just the front door. Self-contained: owns its own browser
// lifecycle and is bounded (sample size + per-page timeout) so it can't stall
// the audit. Degrades gracefully to an empty result if Chromium is unavailable.
import { chromium, type Browser } from "playwright";
import type { Issue } from "./crawler";

// Compiled to CommonJS (NestJS), so `require.resolve` is ambient — resolve the
// axe-core bundle we inject into each page.
const AXE_PATH = require.resolve("axe-core/axe.min.js");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SEOPlatformBot/1.0";

export type Impact = "critical" | "serious" | "moderate" | "minor";

export interface RuleFinding {
  id: string;
  impact: Impact;
  help: string;
  helpUrl: string;
  nodes: number; // total offending elements across sampled pages
  pages: string[]; // sample of pages where the rule failed
}

export interface AccessibilityResult {
  pagesAudited: number;
  totals: Record<Impact, number>; // total violation NODES by impact
  byRule: RuleFinding[];
  perPage: { url: string; critical: number; serious: number; moderate: number; minor: number }[];
  issues: Issue[]; // aggregate site-level findings for the summary
}

interface AxeViolation {
  id: string;
  impact: Impact | null;
  help: string;
  helpUrl: string;
  nodes: unknown[];
}

const EMPTY = (): AccessibilityResult => ({
  pagesAudited: 0,
  totals: { critical: 0, serious: 0, moderate: 0, minor: 0 },
  byRule: [],
  perPage: [],
  issues: [],
});

// axe returns null impact occasionally; normalize to the weakest bucket.
function impactOf(v: AxeViolation): Impact {
  return v.impact ?? "minor";
}

export async function runAccessibilityAudit(
  urls: string[],
  opts: { sample?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<AccessibilityResult> {
  const sample = Math.min(opts.sample ?? 10, urls.length);
  const timeoutMs = opts.timeoutMs ?? 20000;
  const targets = urls.slice(0, sample);
  if (!targets.length) return EMPTY();

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  } catch {
    return EMPTY(); // no Chromium — skip rather than fail the whole audit
  }

  const result = EMPTY();
  const rules = new Map<string, RuleFinding>();
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
    for (const url of targets) {
      if (opts.signal?.aborted) break;
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
        await page.addScriptTag({ path: AXE_PATH });
        // WCAG 2.0/2.1 level A + AA — the tags Google & most audits care about.
        const violations = (await page.evaluate(async () => {
          // @ts-expect-error axe is injected into the page scope above.
          const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] });
          return r.violations;
        })) as AxeViolation[];

        const per = { url, critical: 0, serious: 0, moderate: 0, minor: 0 };
        for (const v of violations) {
          const impact = impactOf(v);
          const n = v.nodes.length;
          per[impact] += n;
          result.totals[impact] += n;
          let rf = rules.get(v.id);
          if (!rf) {
            rf = { id: v.id, impact, help: v.help, helpUrl: v.helpUrl, nodes: 0, pages: [] };
            rules.set(v.id, rf);
          }
          rf.nodes += n;
          if (rf.pages.length < 10) rf.pages.push(url);
          // Keep the most severe impact seen for the rule.
          const order: Impact[] = ["minor", "moderate", "serious", "critical"];
          if (order.indexOf(impact) > order.indexOf(rf.impact)) rf.impact = impact;
        }
        result.perPage.push(per);
        result.pagesAudited++;
      } catch {
        /* one page failing to load must not sink the whole audit */
      } finally {
        await page.close().catch(() => {});
      }
    }
    await context.close().catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }

  result.byRule = [...rules.values()].sort((a, b) => {
    const order: Impact[] = ["minor", "moderate", "serious", "critical"];
    return order.indexOf(b.impact) - order.indexOf(a.impact) || b.nodes - a.nodes;
  });

  // Aggregate site-level issues for the summary. Critical/serious are real
  // blockers (→ warning); moderate/minor are advisory (→ notice).
  const blockers = result.totals.critical + result.totals.serious;
  const advisories = result.totals.moderate + result.totals.minor;
  if (blockers > 0)
    result.issues.push({
      code: "a11y-serious",
      severity: "warning",
      category: "technical",
      message: `${blockers} serious/critical accessibility violation(s) across ${result.pagesAudited} sampled page(s) (WCAG A/AA)`,
    });
  if (advisories > 0)
    result.issues.push({
      code: "a11y-moderate",
      severity: "notice",
      category: "technical",
      message: `${advisories} moderate/minor accessibility issue(s) across ${result.pagesAudited} sampled page(s)`,
    });

  return result;
}
