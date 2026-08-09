import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

/** A searchable location (country / state / city) from DataForSEO's database. */
type LocationRow = { code: number; name: string; type: string; iso: string | null };

// Tiny territories with a negligible search population. Google Trends reports
// RELATIVE interest (0–100), so a handful of searches in these places spikes them
// to 100 — pure noise, not real demand. We drop them from the world-level ranking.
const MICRO_TERRITORY_ISO = new Set([
  "SH", "FK", "GS", "BV", "HM", "TF", "IO", "PN", "NU", "TK", "WF", "NF", "CX", "CC",
  "VA", "PM", "MS", "AI", "VG", "BL", "MF", "SX", "TC", "CK", "NR", "TV", "FM", "MH",
  "PW", "KI", "AS", "MP", "GU", "VI", "AX", "GI", "FO", "GL", "AD", "LI", "MC", "SM",
  "KY", "BM", "AW", "CW", "BQ", "GP", "MQ", "YT", "NC", "PF", "GF", "EH", "SC", "VU",
  "SB", "TO", "WS",
]);

/** ISO-2 country → DataForSEO location_code (shared across Labs/Backlinks calls). */
const LOCATION_CODES: Record<string, number> = {
  US: 2840, GB: 2826, IN: 2356, CA: 2124, AU: 2036, DE: 2276, FR: 2250, ES: 2724,
  IT: 2380, NL: 2528, SG: 2702, AE: 2784, PK: 2586, BD: 2050, TH: 2764, MY: 2458,
  ID: 2360, JP: 2392, KR: 2410, BR: 2076, MX: 2484, SA: 2682, ZA: 2710, NG: 2566,
  IE: 2372, NZ: 2554, SE: 2752, NO: 2578, DK: 2208, FI: 2246, PL: 2616, PT: 2620,
  CH: 2756, AT: 2040, BE: 2056, TR: 2792, UA: 2804, GR: 2300, RO: 2642, CZ: 2203,
  HU: 2348, PH: 2608, VN: 2704, EG: 2818, IL: 2376, AR: 2032, CL: 2152, CO: 2170,
  PE: 2604, LK: 2144, NP: 2524, KE: 2404, QA: 2634, KW: 2414, HK: 2344, TW: 2158,
  RU: 2643,
};
/** "WW" / worldwide → undefined, so callers omit location_code (global database). */
const locationCode = (country?: string): number | undefined => {
  const c = (country ?? "US").toUpperCase();
  if (c === "WW" || c === "WORLDWIDE" || c === "GLOBAL") return undefined;
  return LOCATION_CODES[c] ?? 2840;
};
/** Drop undefined keys so a `location_code: undefined` never ships in the body. */
const compact = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/**
 * DataForSEO-backed data for the dashboard (backlinks, and room for keyword
 * volume/difficulty later). Heavily cached (stale-while-revalidate) since this
 * data changes slowly and each API call has a cost.
 */
@Injectable()
export class DataForSeoService {
  private readonly logger = new Logger(DataForSeoService.name);
  constructor(private readonly prisma: PrismaService) {}

  private auth(): string | null {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) return null;
    return Buffer.from(`${login}:${password}`).toString("base64");
  }

  // Hard daily spend cap so paid DataForSEO calls can never run away. We track
  // the REAL cost DataForSEO returns per response; once the day's total crosses
  // DATAFORSEO_DAILY_BUDGET (default $5) we stop making live calls and serve
  // cached/empty data instead. Resets at UTC midnight. The counter lives in the
  // DB (not process memory) so a restart or a second worker can't reset/duplicate
  // the budget — the cap is enforced across the whole deployment.
  private static readonly BUDGET_KEY = "__dataforseo_daily_budget__";
  private budgetCap(): number { return Number(process.env.DATAFORSEO_DAILY_BUDGET || 5); }

  private async spentToday(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const row = await this.prisma.dataCache.findUnique({ where: { key: DataForSeoService.BUDGET_KEY } }).catch(() => null);
    const p: any = row?.payload ?? null;
    return p && p.date === today && typeof p.spent === "number" ? p.spent : 0;
  }

  private async addSpend(cost: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    // Serialize concurrent increments with an advisory lock so no spend is lost.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${DataForSeoService.BUDGET_KEY}))`;
      const row = await tx.dataCache.findUnique({ where: { key: DataForSeoService.BUDGET_KEY } });
      const p: any = row?.payload ?? null;
      const base = p && p.date === today && typeof p.spent === "number" ? p.spent : 0;
      const payload = { date: today, spent: base + cost };
      await tx.dataCache.upsert({ where: { key: DataForSeoService.BUDGET_KEY }, create: { key: DataForSeoService.BUDGET_KEY, payload }, update: { payload } });
    }).catch(() => { /* budget bookkeeping must never break the actual call */ });
  }

  private async post(path: string, body: unknown): Promise<any> {
    const auth = this.auth();
    if (!auth) return null;
    const spent = await this.spentToday();
    if (spent >= this.budgetCap()) {
      this.logger.warn(`dataforseo: daily budget ($${this.budgetCap()}) reached — skipping ${path} (spent ~$${spent.toFixed(3)})`);
      return null;
    }
    try {
      const res = await fetch(`https://api.dataforseo.com${path}`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });
      const data: any = await res.json();
      // DataForSEO returns the real $ cost of the call — accumulate it for the cap.
      if (typeof data?.cost === "number" && data.cost > 0) {
        await this.addSpend(data.cost);
        this.logger.log(`dataforseo ${path}: cost $${data.cost.toFixed(4)}`);
      }
      if (data?.status_code !== 20000) {
        this.logger.warn(`dataforseo ${path}: ${data?.status_code} ${data?.status_message}`);
        return null;
      }
      return data.tasks?.[0]?.result?.[0] ?? null;
    } catch (e) {
      this.logger.warn(`dataforseo ${path} failed: ${String(e).slice(0, 80)}`);
      return null;
    }
  }

  /** Like post(), but returns the WHOLE `result` array (not just result[0]).
   *  Needed for endpoints whose result is a flat list of rows — e.g. Google Ads
   *  keywords_for_keywords returns result = [{keyword,...}, ...], not {items}. */
  private async postAll(path: string, body: unknown): Promise<any[] | null> {
    const auth = this.auth();
    if (!auth) return null;
    const spent = await this.spentToday();
    if (spent >= this.budgetCap()) {
      this.logger.warn(`dataforseo: daily budget ($${this.budgetCap()}) reached — skipping ${path} (spent ~$${spent.toFixed(3)})`);
      return null;
    }
    try {
      const res = await fetch(`https://api.dataforseo.com${path}`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });
      const data: any = await res.json();
      if (typeof data?.cost === "number" && data.cost > 0) {
        await this.addSpend(data.cost);
        this.logger.log(`dataforseo ${path}: cost $${data.cost.toFixed(4)}`);
      }
      if (data?.status_code !== 20000) {
        this.logger.warn(`dataforseo ${path}: ${data?.status_code} ${data?.status_message}`);
        return null;
      }
      return data.tasks?.[0]?.result ?? null;
    } catch (e) {
      this.logger.warn(`dataforseo ${path} failed: ${String(e).slice(0, 80)}`);
      return null;
    }
  }

  /** Stale-while-revalidate cache over the shared DataCache table.
   *  `fresh`      = user hit Refresh → bypass the cache and re-fetch live.
   *  `cachedOnly` = only serve what's already cached; NEVER make a paid call.
   *                 On a cache miss it returns `{ loaded: false }` so the UI can
   *                 show a "Load data" button instead of silently spending money. */
  private async cached<T>(key: string, ttlMs: number, producer: () => Promise<T>, fresh = false, cachedOnly = false): Promise<T> {
    const hit = fresh ? null : await this.prisma.dataCache.findUnique({ where: { key } }).catch(() => null);
    const store = async () => {
      try {
        const v = await producer();
        // Only cache SUCCESSFUL results — a transient outage ({connected:false})
        // must NOT poison the cache for the full TTL.
        const ok = !!v && (v as any).connected !== false && (v as any).matched !== false;
        if (ok) await this.prisma.dataCache.upsert({ where: { key }, create: { key, payload: v as any }, update: { payload: v as any } });
        return v;
      } catch {
        return null as unknown as T;
      }
    };
    if (hit) {
      // In cachedOnly mode never revalidate — serving stale is free, a re-fetch costs.
      if (!cachedOnly && Date.now() - new Date(hit.updatedAt).getTime() >= ttlMs) void store();
      return hit.payload as T;
    }
    if (cachedOnly) return { loaded: false } as unknown as T; // no cache → no paid call
    // Single fetch — never call the paid producer twice on the error path.
    return await store();
  }

  /** Read the cache only — never triggers a paid call. Returns null on a miss. */
  private async peek<T>(key: string): Promise<T | null> {
    const hit = await this.prisma.dataCache.findUnique({ where: { key } }).catch(() => null);
    return hit ? (hit.payload as T) : null;
  }

  async backlinksForDomain(domain: string, fresh = false, cachedOnly = false) {
    const target = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
    const key = `backlinks:${target}`;
    if (fresh) await this.prisma.dataCache.deleteMany({ where: { key } }).catch(() => {});
    if (cachedOnly) return (await this.peek(key)) ?? { loaded: false };
    return this.cached(key, 30 * 24 * 3600_000, async () => {
      if (!this.auth()) return { connected: false };

      const [summary, refDomains, backlinks] = await Promise.all([
        this.post("/v3/backlinks/summary/live", [{ target, internal_list_limit: 10, backlinks_status_type: "live" }]),
        this.post("/v3/backlinks/referring_domains/live", [{ target, limit: 25, order_by: ["rank,desc"], backlinks_status_type: "live" }]),
        this.post("/v3/backlinks/backlinks/live", [{ target, limit: 25, mode: "as_is", order_by: ["rank,desc"], backlinks_status_type: "live" }]),
      ]);

      if (!summary) return { connected: false };

      return {
        connected: true,
        target,
        summary: {
          backlinks: summary.backlinks ?? 0,
          referringDomains: summary.referring_domains ?? 0,
          referringMainDomains: summary.referring_main_domains ?? 0,
          dofollow: (summary.backlinks ?? 0) - (summary.referring_pages_nofollow ?? 0),
          nofollow: summary.referring_pages_nofollow ?? 0,
          brokenBacklinks: summary.broken_backlinks ?? 0,
          referringIps: summary.referring_ips ?? 0,
          spamScore: summary.backlinks_spam_score ?? 0,
          rank: summary.rank ?? 0,
          referringPages: summary.referring_pages ?? 0,
        },
        tld: summary.referring_links_tld ?? {},
        platformTypes: summary.referring_links_platform_types ?? {},
        referringDomains: (refDomains?.items ?? []).map((d: any) => ({
          domain: d.domain,
          backlinks: d.backlinks ?? 0,
          rank: d.rank ?? 0,
          firstSeen: d.first_seen ?? null,
          dofollow: (d.backlinks ?? 0) - (d.backlinks_nofollow ?? 0),
        })),
        backlinks: (backlinks?.items ?? []).map((b: any) => ({
          urlFrom: b.url_from,
          urlTo: b.url_to,
          domainFrom: b.domain_from,
          anchor: b.anchor ?? "",
          dofollow: b.dofollow ?? false,
          rank: b.rank ?? 0,
          firstSeen: b.first_seen ?? null,
        })),
      };
    });
  }

  /**
   * Keyword ideas for a seed term — Google Ads Keyword Planner
   * (`keywords_for_keywords`). This is the same source the big keyword tools use:
   * it returns real search volume, a 0–100 competition index and a 12-month trend,
   * and CRITICALLY it works at every geo level — country, state AND city — unlike
   * DataForSEO Labs `keyword_suggestions`, which only accepts country codes (a
   * city/state code there returns "Invalid location_code" and zero ideas). So when
   * a user picks "Punjab, India" or "Chandigarh" we now get that location's real
   * volumes instead of nothing. Database-backed; volumes update ~monthly (7-day+ cache).
   */
  async keywordIdeas(seed: string, country?: string, language = "en", fresh = false, locationCodeOverride?: number) {
    // An explicit location_code (a city/state picked in the UI) wins; otherwise
    // fall back to the country's code. Keyed by the resolved code so a city's
    // results never collide with its country's. (v2 = Google Ads source; bumped
    // so old country-only Labs entries don't shadow the richer data.)
    const loc = locationCodeOverride ?? locationCode(country);
    const key = `kwsug:v2:${loc ?? "WW"}:${language}:${seed.toLowerCase().trim()}`;
    if (fresh) await this.prisma.dataCache.deleteMany({ where: { key } }).catch(() => {});
    return this.cached(key, 30 * 24 * 3600_000, async () => {
      if (!this.auth()) return { connected: false, keywords: [] };
      const result = await this.postAll("/v3/keywords_data/google_ads/keywords_for_keywords/live", [
        compact({ keywords: [seed], location_code: loc, language_code: language, sort_by: "search_volume" }),
      ]);
      if (!result) return { connected: false, keywords: [] };
      const seen = new Set<string>();
      const keywords = result
        .map((it: any) => ({
          keyword: it.keyword ?? "",
          volume: it.search_volume ?? 0,
          cpc: it.cpc ?? null,
          // competition_index is Google's 0–100 competitiveness (the "CI" column
          // competitors show). Expose it as both the 0–1 competition and difficulty.
          competition: typeof it.competition_index === "number" ? it.competition_index / 100 : null,
          competitionLevel: it.competition ?? null, // "LOW" | "MEDIUM" | "HIGH"
          difficulty: it.competition_index ?? null,
          trend: (it.monthly_searches ?? []).slice(0, 12).map((m: any) => m.search_volume ?? 0).reverse(),
        }))
        .filter((k: any) => k.keyword && !seen.has(k.keyword) && seen.add(k.keyword))
        .sort((a: any, b: any) => (b.volume ?? 0) - (a.volume ?? 0));
      return { connected: true, seed, keywords };
    });
  }

  // ---- Locations (country / state / city) for keyword research --------------
  // DataForSEO's Google-Ads locations list (~260k entries) is fetched ONCE (free),
  // filtered to the useful admin levels, cached in-process + in the DB, then
  // searched locally so the picker is instant and never re-hits the API.
  private static LOCATIONS: LocationRow[] | null = null;
  private static LOCATIONS_PROMISE: Promise<LocationRow[]> | null = null;
  // O(1) lookup indexes so geo resolution never scans the whole 90k list.
  private static BY_ISO = new Map<string, LocationRow>();  // ISO2 → its Country row
  private static BY_CODE = new Map<number, LocationRow>();  // location_code → row
  private static BY_NAME = new Map<string, LocationRow[]>(); // lowercased first name-part → rows
  private static readonly LOCATIONS_KEY = "__dataforseo_locations_v1__";
  private static readonly LOCATION_TYPES = new Set([
    "Country", "State", "Region", "Province", "Territory", "Autonomous Community",
    "Union Territory", "County", "City", "Municipality", "Governorate", "Prefecture",
    "Department", "Canton", "Borough",
  ]);

  // Store the list AND build the lookup indexes in one pass.
  private setLocations(rows: LocationRow[]): LocationRow[] {
    DataForSeoService.LOCATIONS = rows;
    const byIso = new Map<string, LocationRow>();
    const byCode = new Map<number, LocationRow>();
    const byName = new Map<string, LocationRow[]>();
    for (const r of rows) {
      byCode.set(r.code, r);
      if (r.type === "Country" && r.iso) byIso.set(r.iso.toUpperCase(), r);
      const nm = r.name.split(",")[0].trim().toLowerCase();
      const arr = byName.get(nm);
      if (arr) arr.push(r); else byName.set(nm, [r]);
    }
    DataForSeoService.BY_ISO = byIso;
    DataForSeoService.BY_CODE = byCode;
    DataForSeoService.BY_NAME = byName;
    return rows;
  }

  private async loadLocations(): Promise<LocationRow[]> {
    if (DataForSeoService.LOCATIONS) return DataForSeoService.LOCATIONS;
    if (DataForSeoService.LOCATIONS_PROMISE) return DataForSeoService.LOCATIONS_PROMISE;
    DataForSeoService.LOCATIONS_PROMISE = (async () => {
      try {
        // Warm start from the DB cache first (persists across restarts).
        try {
          const row = await this.prisma.dataCache.findUnique({ where: { key: DataForSeoService.LOCATIONS_KEY } });
          const p = row?.payload as unknown as LocationRow[] | undefined;
          if (Array.isArray(p) && p.length) return this.setLocations(p);
        } catch { /* fall through to live fetch */ }
        const auth = this.auth();
        if (!auth) return this.setLocations([]);
        try {
          const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/locations", {
            headers: { Authorization: `Basic ${auth}` },
            signal: AbortSignal.timeout(60_000),
          });
          const data: any = await res.json();
          const rows: any[] = data?.tasks?.[0]?.result ?? [];
          const filtered: LocationRow[] = rows
            .filter((r) => DataForSeoService.LOCATION_TYPES.has(r.location_type))
            .map((r) => ({ code: r.location_code, name: r.location_name, type: r.location_type, iso: r.country_iso_code ?? null }));
          await this.prisma.dataCache.upsert({
            where: { key: DataForSeoService.LOCATIONS_KEY },
            create: { key: DataForSeoService.LOCATIONS_KEY, payload: filtered as any },
            update: { payload: filtered as any },
          }).catch(() => {});
          this.logger.log(`dataforseo locations cached: ${filtered.length}`);
          return this.setLocations(filtered);
        } catch (e) {
          this.logger.warn(`dataforseo locations fetch failed: ${String(e).slice(0, 80)}`);
          return this.setLocations([]);
        }
      } finally {
        DataForSeoService.LOCATIONS_PROMISE = null;
      }
    })();
    return DataForSeoService.LOCATIONS_PROMISE;
  }

  /** Search countries/states/cities by name. Empty query → the country list. */
  async searchLocations(q: string, limit = 40): Promise<LocationRow[]> {
    const all = await this.loadLocations();
    const needle = (q || "").trim().toLowerCase();
    const rank = (t: string) => (t === "Country" ? 0 : t === "State" || t === "Region" || t === "Province" ? 1 : 2);
    if (!needle) {
      return all.filter((r) => r.type === "Country").sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
    }
    const scored: { r: LocationRow; s: number; len: number }[] = [];
    for (const r of all) {
      const name = r.name.toLowerCase();
      if (!name.includes(needle)) continue;
      scored.push({ r, s: (name.startsWith(needle) ? 0 : 10) + rank(r.type), len: r.name.length });
      if (scored.length >= 4000) break; // cap the scan on very broad queries
    }
    scored.sort((a, b) => a.s - b.s || a.len - b.len);
    return scored.slice(0, limit).map((x) => x.r);
  }

  // Resolve a Google-Trends geo entry to a DataForSEO location_code so the UI can
  // drill deeper. World entries carry an ISO-2 geo_id → the Country row; deeper
  // entries are matched by name within the parent country.
  private resolveGeoCode(name: string, geoId: string, parentCode?: number): number | null {
    // World level: geo_id is an ISO-2 country code → the Country row (O(1)).
    if (!parentCode) return DataForSeoService.BY_ISO.get((geoId || "").toUpperCase())?.code ?? null;
    // Deeper: match by name within the parent country (indexed by name → O(1)).
    const iso = DataForSeoService.BY_CODE.get(parentCode)?.iso ?? null;
    const rows = DataForSeoService.BY_NAME.get(name.trim().toLowerCase());
    if (!rows) return null;
    const order = (t: string) => (t === "State" || t === "Region" || t === "Province" || t === "Union Territory" ? 0 : t === "City" || t === "Municipality" ? 1 : 2);
    const matches = rows.filter((r) => (iso ? r.iso === iso : true) && r.code !== parentCode).sort((a, b) => order(a.type) - order(b.type));
    return matches[0]?.code ?? null;
  }

  /**
   * Where a keyword is in demand — Google Trends "interest by region" (0–100).
   * No location_code → by COUNTRY (world); a country code → its states/regions; a
   * state code → its cities. Each item carries a drill-down code when resolvable.
   */
  async keywordGeo(keyword: string, locationCode?: number, language = "en") {
    const kw = (keyword || "").trim();
    if (!kw) return { items: [] as { name: string; value: number; code: number | null }[] };
    const key = `kwgeo:${locationCode ?? "WW"}:${language}:${kw.toLowerCase()}`;
    return this.cached(key, 7 * 24 * 3600_000, async () => {
      if (!this.auth()) return { items: [] };
      const res = await this.post("/v3/keywords_data/google_trends/explore/live", [
        compact({ keywords: [kw], type: "web", location_code: locationCode, language_code: language, item_types: ["google_trends_map"] }),
      ]);
      const map = (res?.items ?? []).find((it: any) => it.type === "google_trends_map");
      await this.loadLocations(); // ensures the O(1) lookup indexes are built
      const isWorld = !locationCode;
      const raw = (map?.data ?? [])
        .filter((g: any) => Array.isArray(g.values) && typeof g.values[0] === "number" && g.values[0] > 0)
        // Drop tiny-population territories at world level — they spike to a fake 100.
        .filter((g: any) => !(isWorld && MICRO_TERRITORY_ISO.has(String(g.geo_id ?? "").toUpperCase())))
        .map((g: any) => ({ name: g.geo_name as string, value: g.values[0] as number, code: this.resolveGeoCode(g.geo_name, g.geo_id ?? "", locationCode) }))
        .sort((a: any, b: any) => b.value - a.value);
      // Re-normalise to the top REAL market = 100 (the raw 100 was the noise we
      // removed), so the scores read as an intuitive 0–100 relative to #1.
      const top = raw[0]?.value ?? 0;
      const items = top > 0 ? raw.map((it: any) => ({ ...it, value: Math.max(1, Math.round((it.value / top) * 100)) })) : raw;
      return { items };
    });
  }

  /**
   * Every keyword a domain already ranks for on Google (DataForSEO Labs). Gives
   * position, volume, CPC, URL — a far broader view than GSC's sampled set.
   */
  async rankedKeywords(domain: string, country?: string, language = "en", fresh = false, cachedOnly = false) {
    const target = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
    const key = `rankedkw:${country ?? "US"}:${language}:${target}`;
    if (fresh) await this.prisma.dataCache.deleteMany({ where: { key } }).catch(() => {});
    if (cachedOnly) return (await this.peek(key)) ?? { loaded: false };
    return this.cached(key, 30 * 24 * 3600_000, async () => {
      if (!this.auth()) return { connected: false, keywords: [] };
      const res = await this.post("/v3/dataforseo_labs/google/ranked_keywords/live", [
        compact({ target, location_code: locationCode(country), language_code: language, limit: 100, order_by: ["ranked_serp_element.serp_item.rank_absolute,asc"] }),
      ]);
      if (!res) return { connected: false, keywords: [] };
      const metrics = res.metrics?.organic ?? {};
      return {
        connected: true,
        target,
        totals: {
          count: res.total_count ?? (res.items ?? []).length,
          etv: Math.round(metrics.etv ?? 0),
          pos_1: metrics.pos_1 ?? 0,
          pos_2_3: metrics.pos_2_3 ?? 0,
          pos_4_10: metrics.pos_4_10 ?? 0,
        },
        keywords: (res.items ?? []).map((it: any) => {
          const el = it.ranked_serp_element?.serp_item ?? {};
          return {
            ...normalizeKeyword(it.keyword_data?.keyword, it.keyword_data?.keyword_info, it.keyword_data?.keyword_properties),
            position: el.rank_absolute ?? el.rank_group ?? null,
            url: el.url ?? null,
            title: el.title ?? null,
          };
        }),
      };
    });
  }

  /**
   * Live Google organic position of a domain for a single keyword (top 100).
   * Used by the scheduled rank tracker. Returns { position, url } (null if unranked).
   */
  async serpRank(keyword: string, domain: string, country?: string, language = "en", device = "desktop", fresh = false) {
    const target = cleanDomain(domain);
    const key = `serprank:${country ?? "US"}:${language}:${device}:${target}:${keyword.toLowerCase()}`;
    return this.cached(
      key,
      24 * 3600_000,
      async () => {
        if (!this.auth()) return { connected: false, position: null as number | null, url: null as string | null };
        const res = await this.post("/v3/serp/google/organic/live/advanced", [
          compact({ keyword, location_code: locationCode(country), language_code: language, device, depth: 100 }),
        ]);
        if (!res) return { connected: false, position: null as number | null, url: null as string | null };
        let position: number | null = null;
        let url: string | null = null;
        for (const it of res.items ?? []) {
          if (it.type !== "organic") continue;
          const d = cleanDomain(String(it.domain ?? it.url ?? ""));
          if (d === target || d.endsWith(`.${target}`) || target.endsWith(`.${d}`)) {
            position = it.rank_absolute ?? it.rank_group ?? null;
            url = it.url ?? null;
            break;
          }
        }
        return { connected: true, position, url };
      },
      fresh,
    );
  }

  // ==========================================================================
  // Competitor Analysis (DataForSEO Labs) — cached 7 days
  // ==========================================================================

  /** Organic competitors of a domain + this domain's own rank overview. */
  async competitors(domain: string, country?: string, language = "en", fresh = false, cachedOnly = false) {
    const target = cleanDomain(domain);
    const key = `competitors:${country ?? "US"}:${language}:${target}`;
    if (fresh) await this.prisma.dataCache.deleteMany({ where: { key } }).catch(() => {});
    const result: any = cachedOnly ? await this.peek(key) : await this.cached(key, 30 * 24 * 3600_000, async () => {
      if (!this.auth()) return { connected: false, competitors: [] };
      const [comp, overview] = await Promise.all([
        this.post("/v3/dataforseo_labs/google/competitors_domain/live", [
          compact({ target, location_code: locationCode(country), language_code: language, limit: 60, order_by: ["intersections,desc"] }),
        ]),
        this.post("/v3/dataforseo_labs/google/domain_rank_overview/live", [
          compact({ target, location_code: locationCode(country), language_code: language }),
        ]),
      ]);
      const m = overview?.items?.[0]?.metrics?.organic ?? {};
      const myKeywords = m.count ?? 0;
      const pool = (comp?.items ?? [])
        .map((it: any) => {
          const om = it.full_domain_metrics?.organic ?? it.metrics?.organic ?? {};
          return {
            domain: cleanDomain(it.domain),
            avgPosition: it.avg_position != null ? Math.round(it.avg_position * 10) / 10 : null,
            commonKeywords: it.intersections ?? 0,
            keywords: om.count ?? 0,
            etv: Math.round(om.etv ?? 0),
            top10: (om.pos_1 ?? 0) + (om.pos_2_3 ?? 0) + (om.pos_4_10 ?? 0),
          };
        })
        // Drop self + non-business domains (docs sites, dev tools, code hosts,
        // platforms, forums, social, marketplaces) — these share keywords but are
        // NOT competing agencies/businesses.
        .filter((c: any) => c.domain && c.domain !== target && !isNonCompetitor(c.domain));
      // Then a dynamic size filter: mega-sites that ranked for a stray shared
      // keyword are extreme outliers vs this niche's median footprint.
      const sizes = pool.map((c: any) => c.keywords).filter((n: number) => n > 0).sort((a: number, b: number) => a - b);
      const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
      const cap = median > 0 ? median * 20 : Infinity;
      const competitors = pool.filter((c: any) => c.keywords <= cap).slice(0, 25);
      return {
        connected: true,
        target,
        overview: {
          keywords: myKeywords,
          etv: Math.round(m.etv ?? 0),
          pos_1: m.pos_1 ?? 0,
          pos_2_3: m.pos_2_3 ?? 0,
          pos_4_10: m.pos_4_10 ?? 0,
        },
        competitors,
      };
    });
    // cachedOnly + no cache → tell the UI to show a "Load data" button.
    if (cachedOnly && !result) return { connected: true, loaded: false, competitors: [] };
    // Re-apply the non-competitor filter on the way OUT too, so already-cached
    // lists (built before this filter existed) are cleaned on every read without a
    // paid refetch. Idempotent — fresh fetches are already filtered.
    if (result && Array.isArray((result as any).competitors)) {
      (result as any).competitors = (result as any).competitors.filter((c: any) => !isNonCompetitor(c.domain));
    }
    return result;
  }

  /** Keyword gap — keywords a competitor ranks for, compared with your domain. */
  async keywordGap(domain: string, competitor: string, country?: string, language = "en") {
    const t1 = cleanDomain(domain);
    const t2 = cleanDomain(competitor);
    const key = `kwgap:${country ?? "US"}:${language}:${t1}:${t2}`;
    return this.cached(key, 30 * 24 * 3600_000, async () => {
      if (!this.auth()) return { connected: false, keywords: [] };
      const res = await this.post("/v3/dataforseo_labs/google/domain_intersection/live", [
        compact({ target1: t1, target2: t2, location_code: locationCode(country), language_code: language, limit: 100, intersections: true, order_by: ["keyword_data.keyword_info.search_volume,desc"] }),
      ]);
      if (!res) return { connected: false, keywords: [] };
      return {
        connected: true,
        target: t1,
        competitor: t2,
        keywords: (res.items ?? []).map((it: any) => {
          const yourEl = it.first_domain_serp_element?.serp_item ?? it.first_domain_serp_element ?? {};
          const compEl = it.second_domain_serp_element?.serp_item ?? it.second_domain_serp_element ?? {};
          return {
            ...normalizeKeyword(it.keyword_data?.keyword, it.keyword_data?.keyword_info, it.keyword_data?.keyword_properties),
            yourPosition: yourEl.rank_absolute ?? yourEl.rank_group ?? null,
            competitorPosition: compEl.rank_absolute ?? compEl.rank_group ?? null,
          };
        }),
      };
    });
  }

  // ==========================================================================
  // Domain Analytics (technologies + contacts) — cached 30 days
  // ==========================================================================

  async technologies(domain: string, fresh = false, cachedOnly = false) {
    const target = cleanDomain(domain);
    const key = `tech:${target}`;
    if (fresh) await this.prisma.dataCache.deleteMany({ where: { key } }).catch(() => {});
    if (cachedOnly) return (await this.peek(key)) ?? { loaded: false };
    return this.cached(key, 30 * 24 * 3600_000, async () => {
      if (!this.auth()) return { connected: false };
      const res = await this.post("/v3/domain_analytics/technologies/domain_technologies/live", [{ target }]);
      if (!res) return { connected: false };
      // technologies is a nested group→category→[names] map; flatten to groups.
      const groups: { group: string; items: string[] }[] = [];
      const tech = res.technologies ?? {};
      for (const [group, cats] of Object.entries<any>(tech)) {
        const names = new Set<string>();
        for (const list of Object.values<any>(cats ?? {})) (Array.isArray(list) ? list : []).forEach((n: string) => names.add(n));
        if (names.size) groups.push({ group, items: [...names] });
      }
      return {
        connected: true,
        target,
        title: res.title ?? null,
        description: res.description ?? null,
        domainRank: res.domain_rank ?? null,
        country: res.country_iso_code ?? null,
        language: res.language_code ?? null,
        lastVisited: res.last_visited ?? null,
        emails: res.emails ?? [],
        phones: res.phone_numbers ?? [],
        social: res.social_graph_urls ?? [],
        groups,
      };
    });
  }

  // ==========================================================================
  // Keyword Data (Google Ads exact search volume) — cached 30 days, pricey ($0.09)
  // ==========================================================================

  /**
   * Exact Google Ads search volume for a GIVEN list of keywords (bulk analysis /
   * file import). Works at country, state AND city level via locationCodeOverride.
   * Returns the same rich shape as keywordIdeas (volume, competition index 0–100,
   * 12-month trend) so imported keywords render in the same table.
   */
  async searchVolume(keywords: string[], country?: string, language = "en", locationCodeOverride?: number) {
    const list = [...new Set(keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))].slice(0, 700);
    if (list.length === 0) return { connected: true, keywords: [] };
    const loc = locationCodeOverride ?? locationCode(country);
    const key = `adsvol:v2:${loc ?? "WW"}:${language}:${sha(list.join("|"))}`;
    return this.cached(key, 30 * 24 * 3600_000, async () => {
      if (!this.auth()) return { connected: false, keywords: [] };
      const res = await this.postTasks("/v3/keywords_data/google_ads/search_volume/live", [
        compact({ keywords: list, location_code: loc, language_code: language }),
      ]);
      if (!res) return { connected: false, keywords: [] };
      const seen = new Set<string>();
      const out = res
        .map((it: any) => ({
          keyword: it.keyword ?? "",
          volume: it.search_volume ?? 0,
          cpc: it.cpc ?? null,
          competition: typeof it.competition_index === "number" ? it.competition_index / 100 : null,
          competitionLevel: it.competition ?? null, // "LOW" | "MEDIUM" | "HIGH"
          difficulty: it.competition_index ?? null,
          trend: (it.monthly_searches ?? []).slice(0, 12).map((m: any) => m.search_volume ?? 0).reverse(),
        }))
        .filter((k: any) => k.keyword && !seen.has(k.keyword) && seen.add(k.keyword))
        .sort((a: any, b: any) => (b.volume ?? 0) - (a.volume ?? 0));
      return { connected: true, keywords: out };
    });
  }

  // ==========================================================================
  // Business Data (local listings) — cached 7 days
  // ==========================================================================

  async localBusinesses(category: string, coordinate: string, keyword?: string) {
    const key = `local:${category}:${coordinate}:${keyword ?? ""}`;
    return this.cached(key, 30 * 24 * 3600_000, async () => {
      if (!this.auth()) return { connected: false, businesses: [] };
      const res = await this.post("/v3/business_data/business_listings/search/live", [
        compact({ categories: category ? [category] : undefined, title: keyword || undefined, location_coordinate: coordinate, limit: 30, order_by: ["rating.value,desc"] }),
      ]);
      if (!res) return { connected: false, businesses: [] };
      return {
        connected: true,
        businesses: (res.items ?? []).map((b: any) => ({
          name: b.title,
          category: b.category ?? null,
          rating: b.rating?.value ?? null,
          reviews: b.rating?.votes_count ?? 0,
          address: b.address ?? null,
          phone: b.phone ?? null,
          domain: b.domain ?? null,
          url: b.url ?? null,
        })),
      };
    });
  }

  // ==========================================================================
  // AI Optimization (LLM visibility) — cached 7 days, cheap (~$0.0008)
  // ==========================================================================

  /** Ask an LLM a prompt and detect whether the brand/domain is mentioned. */
  // The AI assistants we check a brand's visibility across. Cheap default models;
  // Perplexity always web-searches (that's its whole point).
  private static readonly AI_MODELS: { engine: string; model: string; label: string; webSearch: boolean }[] = [
    { engine: "chat_gpt", model: "gpt-4o-mini", label: "ChatGPT", webSearch: false },
    { engine: "gemini", model: "gemini-3.5-flash", label: "Gemini", webSearch: false },
    { engine: "claude", model: "claude-haiku-4-5", label: "Claude", webSearch: false },
    { engine: "perplexity", model: "sonar", label: "Perplexity", webSearch: true },
  ];

  // Ask ONE assistant a prompt (cached 30d per engine+model+prompt+web_search).
  private async askAiModel(engine: string, model: string, prompt: string, webSearch: boolean) {
    const key = `aivis:${engine}:${model}:${webSearch ? "w" : "n"}:${sha(prompt.toLowerCase().trim())}`;
    return this.cached(key, 30 * 24 * 3600_000, async () => {
      if (!this.auth()) return { connected: false };
      const res = await this.post(`/v3/ai_optimization/${engine}/llm_responses/live`, [
        { user_prompt: prompt, model_name: model, max_output_tokens: 700, web_search: webSearch },
      ]);
      if (!res) return { connected: false };
      const text = (res.items ?? [])
        .flatMap((it: any) => it.sections ?? [])
        .map((s: any) => s.text ?? "")
        .filter(Boolean)
        .join("\n\n");
      return { connected: true, model, text, tokens: res.output_tokens ?? 0 };
    });
  }

  private detectBrand(text: string | undefined, brand: string) {
    const brandRoot = cleanDomain(brand).split(".")[0];
    const hay = (text ?? "").toLowerCase();
    return { brandRoot, mentioned: brandRoot.length > 2 && (hay.includes(brandRoot) || hay.includes(cleanDomain(brand))) };
  }

  // Single-model check (kept for backwards compatibility / the copilot).
  async aiVisibility(prompt: string, brand: string, model = "gpt-4o-mini") {
    const result: any = await this.askAiModel("chat_gpt", model, prompt, true);
    if (!result?.connected) return result;
    const { brandRoot, mentioned } = this.detectBrand(result.text, brand);
    return { ...result, brand: brandRoot, mentioned };
  }

  // The assistant list (public shape) — used by the streaming endpoint to render
  // placeholder cards immediately, before any answer arrives.
  get aiModelList() {
    return DataForSeoService.AI_MODELS.map((m) => ({ engine: m.engine, label: m.label, model: m.model }));
  }

  // Check ONE assistant and return its brand-visibility result (used per-model by the
  // streaming endpoint so each card can update as soon as that AI responds).
  async checkAiModel(engine: string, prompt: string, brand: string) {
    const m = DataForSeoService.AI_MODELS.find((x) => x.engine === engine);
    if (!m) return { engine, label: engine, model: "", connected: false, mentioned: false, text: "" };
    const r: any = await this.askAiModel(m.engine, m.model, prompt, m.webSearch).catch(() => ({ connected: false }));
    const connected = r?.connected === true && !!(r?.text || "").trim();
    const { mentioned } = this.detectBrand(r?.text, brand);
    return { engine: m.engine, label: m.label, model: m.model, connected, mentioned: connected ? mentioned : false, text: r?.text ?? "" };
  }

  // Multi-assistant brand visibility: asks every configured AI in parallel and reports
  // which ones mention the brand. Numbers/answers are real; each model is cached 30d.
  async aiVisibilityAll(prompt: string, brand: string) {
    const brandRoot = cleanDomain(brand).split(".")[0];
    const results = await Promise.all(
      DataForSeoService.AI_MODELS.map(async (m) => {
        const r: any = await this.askAiModel(m.engine, m.model, prompt, m.webSearch).catch(() => ({ connected: false }));
        const { mentioned } = this.detectBrand(r?.text, brand);
        return {
          engine: m.engine,
          label: m.label,
          model: m.model,
          connected: r?.connected === true && !!(r?.text || "").trim(),
          mentioned: r?.connected === true ? mentioned : false,
          text: r?.text ?? "",
        };
      }),
    );
    const available = results.filter((r) => r.connected);
    return {
      brand: brandRoot,
      prompt,
      results,
      mentionedCount: available.filter((r) => r.mentioned).length,
      answered: available.length,
      total: results.length,
    };
  }

  /** Some Keywords Data endpoints return the array directly on result (not result[0]). */
  private async postTasks(path: string, body: unknown): Promise<any[] | null> {
    const auth = this.auth();
    if (!auth) return null;
    try {
      const res = await fetch(`https://api.dataforseo.com${path}`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      const data: any = await res.json();
      if (data?.status_code !== 20000) {
        this.logger.warn(`dataforseo ${path}: ${data?.status_code} ${data?.status_message}`);
        return null;
      }
      return data.tasks?.[0]?.result ?? null;
    } catch (e) {
      this.logger.warn(`dataforseo ${path} failed: ${String(e).slice(0, 80)}`);
      return null;
    }
  }

  // ==========================================================================
  // SERP — Standard (queue) mode. ~3x cheaper than live/advanced, but ASYNC:
  // post tasks now, results are ready minutes later. Used for the BULK daily
  // rank refresh; live mode stays for instant single checks (add / manual).
  // ==========================================================================

  /** Low-level JSON call that still tracks $ cost + budget, for GET/POST alike. */
  private async rawJson(method: "GET" | "POST", path: string, body?: unknown): Promise<any | null> {
    const auth = this.auth();
    if (!auth) return null;
    try {
      const res = await fetch(`https://api.dataforseo.com${path}`, {
        method,
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(60000),
      });
      const data: any = await res.json();
      if (typeof data?.cost === "number" && data.cost > 0) {
        await this.addSpend(data.cost);
        this.logger.log(`dataforseo ${path}: cost $${data.cost.toFixed(4)}`);
      }
      if (data?.status_code !== 20000) {
        this.logger.warn(`dataforseo ${path}: ${data?.status_code} ${data?.status_message}`);
        return null;
      }
      return data;
    } catch (e) {
      this.logger.warn(`dataforseo ${path} failed: ${String(e).slice(0, 80)}`);
      return null;
    }
  }

  /** Post a batch of Standard SERP tasks (tag carries our keyword id so results
   *  can be mapped back). Returns how many DataForSEO accepted. Cost charged here. */
  async serpTaskPostBatch(items: { keyword: string; country?: string; language?: string; device?: string; tag: string }[]): Promise<number> {
    if (!this.auth() || items.length === 0) return 0;
    if ((await this.spentToday()) >= this.budgetCap()) {
      this.logger.warn(`dataforseo: daily budget reached — skipping serp task_post (${items.length} tasks)`);
      return 0;
    }
    const body = items.map((t) =>
      compact({
        keyword: t.keyword,
        location_code: locationCode(t.country),
        language_code: t.language ?? "en",
        device: t.device === "mobile" ? "mobile" : "desktop",
        depth: 100,
        tag: t.tag,
      }),
    );
    const data = await this.rawJson("POST", "/v3/serp/google/organic/task_post", body);
    const tasks: any[] = Array.isArray(data?.tasks) ? data.tasks : [];
    return tasks.filter((t) => t?.status_code === 20100 || t?.id).length;
  }

  /** IDs of Standard SERP tasks that are finished and ready to fetch. */
  async serpTasksReady(): Promise<string[]> {
    const data = await this.rawJson("GET", "/v3/serp/google/organic/tasks_ready");
    const ids: string[] = [];
    for (const t of data?.tasks ?? []) {
      for (const r of t?.result ?? []) if (r?.id) ids.push(String(r.id));
    }
    return ids;
  }

  /** Fetch one finished Standard SERP task → its organic items + our tag. */
  async serpTaskResult(id: string): Promise<{ items: any[]; tag: string | null } | null> {
    const data = await this.rawJson("GET", `/v3/serp/google/organic/task_get/advanced/${id}`);
    const task = data?.tasks?.[0];
    if (!task) return null;
    const result = task.result?.[0];
    return { items: result?.items ?? [], tag: task.data?.tag ?? result?.tag ?? null };
  }

  /** Find a domain's organic position within a SERP items array (top 100). */
  positionInSerp(items: any[], domain: string): { position: number | null; url: string | null } {
    const target = cleanDomain(domain);
    for (const it of items ?? []) {
      if (it.type !== "organic") continue;
      const d = cleanDomain(String(it.domain ?? it.url ?? ""));
      if (d === target || d.endsWith(`.${target}`) || target.endsWith(`.${d}`)) {
        return { position: it.rank_absolute ?? it.rank_group ?? null, url: it.url ?? null };
      }
    }
    return { position: null, url: null };
  }
}

function cleanDomain(d: string): string {
  return d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
}

// Domains that rank for the same keywords but are NEVER a business competitor:
// official docs / framework / language sites, dev tools & SaaS platforms, code
// hosts, education, encyclopedias, forums, social, marketplaces, review/job sites.
// DataForSEO's "competitors" are pure keyword-overlap, so these leak in — this
// filter is what makes the list actual competing businesses.
const NON_COMPETITOR_DOMAINS = new Set([
  // code hosts / package registries / dev infra
  "github.com", "gitlab.com", "bitbucket.org", "sourceforge.net", "npmjs.com", "pypi.org",
  "packagist.org", "rubygems.org", "nuget.org", "docker.com", "hub.docker.com", "kubernetes.io", "readthedocs.io",
  // docs / education / references
  "developer.mozilla.org", "w3schools.com", "geeksforgeeks.org", "tutorialspoint.com", "freecodecamp.org",
  "stackoverflow.com", "stackexchange.com", "wikipedia.org", "wikimedia.org", "baeldung.com", "javatpoint.com",
  // languages / frameworks / big-vendor dev sites
  "kotlinlang.org", "reactnative.dev", "reactjs.org", "react.dev", "angular.io", "angular.dev", "vuejs.org",
  "nodejs.org", "python.org", "java.com", "flutter.dev", "dart.dev", "web.dev", "developer.android.com",
  "developer.apple.com", "developers.google.com", "docs.microsoft.com", "learn.microsoft.com", "spring.io",
  "swift.org", "golang.org", "go.dev", "rust-lang.org", "php.net", "typescriptlang.org",
  // SaaS / dev tools / cloud platforms
  "appwrite.io", "supabase.com", "firebase.google.com", "vercel.com", "netlify.com", "heroku.com",
  "digitalocean.com", "aws.amazon.com", "azure.microsoft.com", "cloud.google.com", "atlassian.com",
  "jira.com", "notion.so", "figma.com", "postman.com", "mongodb.com", "twilio.com", "stripe.com",
  // content / blogs / social / video
  "medium.com", "dev.to", "hashnode.com", "hashnode.dev", "substack.com", "wordpress.com", "blogspot.com",
  "youtube.com", "reddit.com", "quora.com", "facebook.com", "linkedin.com", "twitter.com", "x.com",
  "pinterest.com", "instagram.com", "slideshare.net", "issuu.com",
  // marketplaces / reviews / jobs / directories
  "producthunt.com", "g2.com", "capterra.com", "trustpilot.com", "clutch.co", "goodfirms.co",
  "designrush.com", "upwork.com", "fiverr.com", "freelancer.com", "toptal.com", "indeed.com",
  "glassdoor.com", "crunchbase.com", "amazon.com", "ebay.com", "play.google.com", "apps.apple.com", "apkpure.com",
]);
// Structural patterns for docs/framework/vendor sites regardless of exact domain.
const NON_COMPETITOR_PATTERNS = [
  /^docs\./, /^developer\./, /^developers\./, /\.readthedocs\.io$/, /\.github\.io$/, /\.gitlab\.io$/,
  /(^|\.)wiki\./, /lang\.org$/, /js\.org$/,
];
function isNonCompetitor(domain: string): boolean {
  const d = cleanDomain(domain);
  if (NON_COMPETITOR_DOMAINS.has(d)) return true;
  return NON_COMPETITOR_PATTERNS.some((re) => re.test(d));
}
function sha(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

/** Shape a Labs keyword_info block into the compact metrics the UI renders. */
function normalizeKeyword(keyword: string, info: any = {}, props: any = {}) {
  return {
    keyword: keyword ?? "",
    volume: info?.search_volume ?? 0,
    cpc: info?.cpc ?? null,
    competition: info?.competition ?? null,
    competitionLevel: info?.competition_level ?? null,
    difficulty: props?.keyword_difficulty ?? null,
    trend: (info?.monthly_searches ?? []).slice(0, 12).map((m: any) => m.search_volume ?? 0).reverse(),
  };
}
