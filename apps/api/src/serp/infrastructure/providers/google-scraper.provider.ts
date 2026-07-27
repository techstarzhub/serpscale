import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
// patchright = stealth-patched Playwright (hides headless/automation fingerprints).
import { rm } from "fs/promises";
import { chromium } from "patchright";
import { devices } from "playwright";
import type { ISerpProvider } from "../../domain/ports";
import { ProviderUnavailableError } from "../../domain/errors";
import type { RawProviderResult, SerpRequest } from "../../domain/serp.types";

/**
 * Self-hosted Google SERP scraper — the same building blocks a paid SERP API
 * uses internally (headless browser + realistic fingerprint + optional proxy +
 * CAPTCHA hook). Works from your own IP at low volume for free; set SERP_PROXY_URL
 * (and later a CAPTCHA solver) to scale reliably.
 */
@Injectable()
export class GoogleScraperProvider implements ISerpProvider, OnModuleDestroy {
  readonly name = "google-scraper";
  readonly costPerQuery = 0.0006; // notional cost so the selector can rank providers

  private readonly logger = new Logger(GoogleScraperProvider.name);
  private seq = 0;

  async isHealthy(): Promise<boolean> {
    // A real deployment would track a rolling CAPTCHA/error rate here.
    return true;
  }

  /**
   * Build the DataImpulse proxy config for a country. Rotation is handled by the
   * gateway (fresh residential IP per request); the `__cr.<cc>` username suffix
   * geo-targets the exit node to the SERP's country.
   */
  private proxyFor(country: string): { server: string; username: string; password: string } | undefined {
    if (process.env.SERP_PROXY_DISABLED === "true") return undefined; // use server's own IP
    const host = process.env.SERP_PROXY_HOST;
    const user = process.env.SERP_PROXY_USER;
    const pass = process.env.SERP_PROXY_PASS;
    if (!host || !user || !pass) return undefined;
    const port = process.env.SERP_PROXY_PORT || "823";
    return {
      server: `http://${host}:${port}`,
      username: `${user}__cr.${country.toLowerCase()}`,
      password: pass,
    };
  }

  async fetch(req: SerpRequest): Promise<RawProviderResult> {
    const t0 = Date.now();
    const proxy = this.proxyFor(req.locale.country);
    const deviceProfile = req.device === "mobile" ? devices["Pixel 7"] : req.device === "tablet" ? devices["iPad Pro 11"] : undefined;
    const headful = process.env.SERP_HEADFUL !== "false";
    // patchright's stealth is strongest with a persistent context + real Chrome.
    // Unique profile dir per fetch so concurrent workers don't clash. On a headless
    // server, run this behind xvfb (a virtual display) with SERP_HEADFUL=true.
    const profileDir = `/tmp/pw-serp-${process.pid}-${++this.seq}`;

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: !headful,
      channel: "chrome",
      locale: `${req.locale.language}-${req.locale.country}`,
      viewport: deviceProfile?.viewport ?? { width: 1366, height: 900 },
      userAgent: deviceProfile?.userAgent,
      proxy,
      // NOTE: patchright handles automation-flag stealth internally. Passing
      // --disable-blink-features=AutomationControlled ourselves is detectable, so
      // we only keep the sandbox/shm flags needed for server environments.
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    // Only block heavy media when explicitly enabled — request interception can
    // itself be a bot signal, so it's off by default (bandwidth cost is small).
    if (process.env.SERP_BLOCK_RESOURCES === "true") {
      await context.route("**/*", (route) => {
        const t = route.request().resourceType();
        return t === "image" || t === "font" || t === "media" ? route.abort() : route.continue();
      });
    }

    let page;
    try {
      page = context.pages()[0] ?? (await context.newPage());

      // Warm up like a human: land on the homepage, accept consent, THEN search.
      // This is what gets us past Google's bot wall reliably.
      await page.goto("https://www.google.com/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await page.click('button:has-text("Accept all"), button#L2AGLb, form[action*="consent"] button', { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(800);

      const url =
        `https://www.google.com/search?q=${encodeURIComponent(req.query)}` +
        `&gl=${encodeURIComponent(req.locale.country)}&hl=${encodeURIComponent(req.locale.language)}`;
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      if (page.url().includes("consent.google.com")) {
        await page.click('button:has-text("Accept all"), button#L2AGLb, form[action*="consent"] button', { timeout: 4000 }).catch(() => {});
        await page.waitForLoadState("domcontentloaded").catch(() => {});
      }

      const html = await page.content();
      const blocked = (resp && (resp.status() === 429 || page.url().includes("/sorry/"))) ||
        (/unusual traffic|not a robot|recaptcha|id="captcha"/i.test(html) && !/id="search"/.test(html));
      if (blocked) {
        // TODO: plug a CAPTCHA solver (CapSolver/2Captcha) here when configured.
        this.logger.warn(`blocked: status=${resp?.status()} url=${page.url().slice(0, 60)} htmlLen=${html.length}`);
        throw new ProviderUnavailableError(this.name);
      }

      const payload = await page.evaluate(extractSerp);
      return { provider: this.name, latencyMs: Date.now() - t0, request: req, payload };
    } finally {
      await context.close().catch(() => {});
      await rm(profileDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Contexts are launched + closed per fetch, so nothing persistent to tear down.
  }
}

/**
 * Runs INSIDE the page DOM. Best-effort, resilient selectors — organic results
 * are solid; PAA / related / featured / AI-overview degrade gracefully to empty
 * when Google shuffles its markup (which it does constantly).
 */
function extractSerp() {
  const clean = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();

  const organic: { title: string; url: string; snippet: string }[] = [];
  const seen = new Set<string>();
  document.querySelectorAll<HTMLHeadingElement>("#search a h3, #rso a h3").forEach((h3) => {
    const a = h3.closest("a") as HTMLAnchorElement | null;
    if (!a?.href || !a.href.startsWith("http") || a.href.includes("google.com")) return;
    if (seen.has(a.href)) return;
    seen.add(a.href);
    const box = h3.closest("div[data-hveid], .g, .MjjYud") as HTMLElement | null;
    const sn = box?.querySelector<HTMLElement>("div[data-sncf], .VwiC3b, .yXK7lf, span.aCOpRe, .lEBKkf");
    organic.push({ title: clean(h3.innerText), url: a.href, snippet: clean(sn?.innerText) });
  });

  const paa: { question: string }[] = [];
  document.querySelectorAll<HTMLElement>('[jsname="yEVEwb"], .related-question-pair, div[data-q]').forEach((el) => {
    const q = clean(el.getAttribute("data-q") || el.innerText).split("\n")[0];
    if (q && q.length < 200 && !paa.some((p) => p.question === q)) paa.push({ question: q });
  });

  const related: { query: string }[] = [];
  document.querySelectorAll<HTMLAnchorElement>('#botstuff a[href^="/search"], #bres a[href^="/search"]').forEach((a) => {
    const q = clean(a.innerText);
    if (q && !related.some((r) => r.query === q)) related.push({ query: q });
  });

  const featuredEl = document.querySelector<HTMLElement>(".xpdopen .LGOjhe, .V3FYCf, [data-attrid='wa:/description']");
  const featured = featuredEl ? { text: clean(featuredEl.innerText) } : null;

  const aiEl = document.querySelector<HTMLElement>("[data-subtree], [aria-label*='AI Overview'], .YzCcne");
  const hasAi = !!(aiEl && /AI Overview|Generative/i.test(document.body.innerText));

  const statsEl = document.querySelector<HTMLElement>("#result-stats");
  const totalResults = statsEl ? Number((clean(statsEl.innerText).match(/[\d,]+/)?.[0] || "").replace(/,/g, "")) || undefined : undefined;

  return { organic, paa, related, featured, hasAi, totalResults };
}
