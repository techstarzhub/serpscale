import { Injectable, Logger } from "@nestjs/common";
import type { ISerpProvider } from "../../domain/ports";
import { ProviderUnavailableError } from "../../domain/errors";
import type { RawProviderResult, SerpRequest } from "../../domain/serp.types";

/** Country (ISO-2) → DataForSEO location_code. Falls back to US. */
const LOCATION_CODES: Record<string, number> = {
  US: 2840, IN: 2356, GB: 2826, CA: 2124, AU: 2036, DE: 2276, FR: 2250, ES: 2724,
  IT: 2380, NL: 2528, SG: 2702, AE: 2784, PK: 2586, BD: 2050, TH: 2764, MY: 2458,
  ID: 2360, JP: 2392, KR: 2410, BR: 2076, MX: 2484, SA: 2682, ZA: 2710, NG: 2566,
};

/**
 * DataForSEO Google Organic SERP provider (Live Advanced). Real Google results
 * with full features (AI overview, PAA, related, videos) — no proxy, no CAPTCHA,
 * no bans. The reliable, scalable data source for production.
 */
@Injectable()
export class DataForSeoProvider implements ISerpProvider {
  readonly name = "dataforseo";
  readonly costPerQuery = 0.002;
  private readonly logger = new Logger(DataForSeoProvider.name);

  private auth(): string | null {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) return null;
    return Buffer.from(`${login}:${password}`).toString("base64");
  }

  async isHealthy(): Promise<boolean> {
    return this.auth() !== null;
  }

  async fetch(req: SerpRequest): Promise<RawProviderResult> {
    const auth = this.auth();
    if (!auth) throw new ProviderUnavailableError(this.name);
    const t0 = Date.now();

    const body = [
      {
        keyword: req.query,
        location_code: LOCATION_CODES[req.locale.country.toUpperCase()] ?? 2840,
        language_code: req.locale.language,
        device: req.device === "tablet" ? "desktop" : req.device,
      },
    ];

    let res: Response;
    try {
      res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });
    } catch (e) {
      this.logger.warn(`dataforseo request failed: ${String(e).slice(0, 80)}`);
      throw new ProviderUnavailableError(this.name);
    }

    const data: any = await res.json().catch(() => null);
    if (!data || data.status_code !== 20000) {
      this.logger.warn(`dataforseo error: ${data?.status_code} ${data?.status_message}`);
      throw new ProviderUnavailableError(this.name);
    }
    const result = data.tasks?.[0]?.result?.[0];
    if (!result) throw new ProviderUnavailableError(this.name);

    return { provider: this.name, latencyMs: Date.now() - t0, request: req, payload: result };
  }
}
