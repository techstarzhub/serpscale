import { chromium, type Browser } from "playwright";

/**
 * Headless-browser rendering for JavaScript-heavy sites.
 *
 * The default crawler uses plain fetch + cheerio (fast, no JS). Some sites
 * (SPAs, JS page-builders) ship an almost-empty HTML shell and inject their
 * content and navigation with JavaScript, so fetch sees zero links. For those,
 * we render the page in a real Chromium instance and return the hydrated HTML.
 *
 * One browser is shared across a whole crawl (launch is expensive); heavy
 * resources (images/fonts/media) are blocked so rendering stays fast.
 */

export interface Renderer {
  render(url: string): Promise<{ html: string; statusCode: number | null } | null>;
  close(): Promise<void>;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SEOPlatformBot/1.0";

export async function createRenderer(): Promise<Renderer | null> {
  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  } catch {
    // Chromium missing or failed to start — caller falls back to fetch-only.
    return null;
  }

  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
  // Skip pixels we never parse — big speed win on media-heavy pages.
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "font" || type === "media") return route.abort();
    return route.continue();
  });

  // Bound concurrent tabs so a large JS site can't spawn 14 renders at once and
  // exhaust memory. Renders beyond the limit queue and run as slots free up.
  const MAX_CONCURRENT = 4;
  let active = 0;
  const waiters: (() => void)[] = [];
  const acquire = () =>
    new Promise<void>((res) => {
      if (active < MAX_CONCURRENT) { active++; res(); }
      else waiters.push(() => { active++; res(); });
    });
  const release = () => {
    active--;
    waiters.shift()?.();
  };

  return {
    async render(url: string) {
      await acquire();
      let page;
      try {
        page = await context.newPage();
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        // Give client-side routers/frameworks a moment to hydrate and paint links.
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        const html = await page.content();
        return { html, statusCode: resp?.status() ?? null };
      } catch {
        return null;
      } finally {
        await page?.close().catch(() => {});
        release();
      }
    },
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}
