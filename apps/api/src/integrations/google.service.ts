import { Injectable, Logger } from "@nestjs/common";
import type { Integration } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
  accountEmail: string | null;
  integrationId: string;
}

export interface GaProperty {
  propertyId: string; // numeric id, e.g. "456"
  displayName: string;
  accountEmail: string | null;
  integrationId: string;
  streamUris: string[]; // web stream defaultUri values
}

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  constructor(private readonly prisma: PrismaService) {}

  ownerKeyForProject(project: { orgId: string | null; createdById: string | null }): string {
    if (project.orgId) return project.orgId;
    return `user:${project.createdById ?? "unknown"}`;
  }

  // Stale-while-revalidate cache for slow external APIs (GA4/GSC). Fresh cache is
  // returned instantly; stale cache is returned instantly AND refreshed in the
  // background; a cold miss fetches synchronously. Errors never overwrite good data.
  async cached<T>(key: string, ttlMs: number, producer: () => Promise<T>, force = false, cacheEmpty = false): Promise<T> {
    const hit = force ? null : await this.prisma.dataCache.findUnique({ where: { key } }).catch(() => null);
    const store = async () => {
      try {
        const p = await producer();
        // Never cache a failed/unconnected result — avoids poisoning the cache.
        // cacheEmpty=true overrides this (e.g. GMB "not connected / quota pending":
        // we DO want to cache that so we don't hammer the API on every refresh).
        const ok = cacheEmpty ? p != null : !!p && (p as any).connected !== false && (p as any).matched !== false;
        if (ok) await this.prisma.dataCache.upsert({ where: { key }, create: { key, payload: p as any }, update: { payload: p as any } });
        return p;
      } catch {
        return null as unknown as T;
      }
    };
    if (hit) {
      const fresh = Date.now() - new Date(hit.updatedAt).getTime() < ttlMs;
      if (!fresh) void store(); // refresh in the background
      return hit.payload as T;
    }
    return await store();
  }

  // Read the cache only — never triggers a live fetch. Returns null on a miss.
  // Used by the dashboard summary so listing many campaigns costs nothing.
  async peek<T>(key: string): Promise<T | null> {
    const hit = await this.prisma.dataCache.findUnique({ where: { key } }).catch(() => null);
    return hit ? (hit.payload as T) : null;
  }

  // Returns a valid access token, refreshing it if it has (nearly) expired.
  private async getToken(integ: Integration): Promise<string | null> {
    const soon = Date.now() + 60_000;
    if (integ.accessToken && integ.expiresAt && new Date(integ.expiresAt).getTime() > soon) {
      return integ.accessToken;
    }
    if (!integ.refreshToken) return integ.accessToken;
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          refresh_token: integ.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (!res.ok) return integ.accessToken;
      const d: any = await res.json();
      const expiresAt = new Date(Date.now() + (d.expires_in || 3600) * 1000);
      await this.prisma.integration.update({
        where: { id: integ.id },
        data: { accessToken: d.access_token, expiresAt },
      });
      return d.access_token;
    } catch {
      return integ.accessToken;
    }
  }

  // All GSC sites across every connected Google account for this owner.
  async listSites(ownerKey: string): Promise<GscSite[]> {
    const integs = await this.prisma.integration.findMany({ where: { ownerKey, provider: "google" } });
    const out: GscSite[] = [];
    for (const integ of integs) {
      const token = await this.getToken(integ);
      if (!token) continue;
      try {
        const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) continue;
        const d: any = await res.json();
        for (const s of d.siteEntry || []) {
          out.push({
            siteUrl: s.siteUrl,
            permissionLevel: s.permissionLevel,
            accountEmail: integ.accountEmail,
            integrationId: integ.id,
          });
        }
      } catch {
        /* ignore this account */
      }
    }
    return out;
  }

  private async searchAnalytics(integrationId: string, siteUrl: string, body: object) {
    const integ = await this.prisma.integration.findUnique({ where: { id: integrationId } });
    if (!integ) return null;
    const token = await this.getToken(integ);
    if (!token) return null;
    try {
      const res = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) return null;
      return (await res.json()) as any;
    } catch {
      return null;
    }
  }

  private matchSite(sites: GscSite[], domain: string): GscSite | null {
    const d = domain.replace(/^www\./, "").toLowerCase();
    const norm = (s: string) =>
      s.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();

    const exact = sites.filter((s) => norm(s.siteUrl) === d);
    // "Partial" = the site's host is `d` itself or a genuine subdomain of it
    // (blog.d). A plain substring match wrongly caught `myd.com` / `d.com.evil.net`.
    const partial = sites.filter((s) => {
      const h = norm(s.siteUrl);
      return h === d || h.endsWith(`.${d}`);
    });
    // Prefer a domain property (sc-domain:) — it aggregates http/https/www and
    // every subdomain, so it always holds the fullest data set. This also makes
    // the match deterministic when both a domain and URL-prefix property exist.
    const pick = (list: GscSite[]) =>
      list.find((s) => s.siteUrl.startsWith("sc-domain:")) || list[0] || null;

    return pick(exact) || pick(partial) || null;
  }

  private ymd(daysAgo: number): string {
    return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  }

  // Search Console overview for a project (auto-matched by domain).
  async gscForProject(project: { orgId: string | null; createdById: string | null; domain: string }, days = 28, range?: { from?: string; to?: string }) {
    const ownerKey = this.ownerKeyForProject(project);
    const sites = await this.listSites(ownerKey);
    if (sites.length === 0) return { connected: false, matched: false, sites: [] as string[] };
    const match = this.matchSite(sites, project.domain);
    if (!match) return { connected: true, matched: false, sites: sites.map((s) => s.siteUrl) };

    // Explicit from/to range wins; otherwise the last `days` (GSC lags ~2 days).
    const startDate = range?.from || this.ymd(days + 2);
    const endDate = range?.to || this.ymd(2);

    const [totalsRes, queriesRes, pagesRes, countriesRes, devicesRes, trendRes] = await Promise.all([
      this.searchAnalytics(match.integrationId, match.siteUrl, { startDate, endDate, dimensions: [] }),
      this.searchAnalytics(match.integrationId, match.siteUrl, { startDate, endDate, dimensions: ["query"], rowLimit: 500 }),
      this.searchAnalytics(match.integrationId, match.siteUrl, { startDate, endDate, dimensions: ["page"], rowLimit: 500 }),
      this.searchAnalytics(match.integrationId, match.siteUrl, { startDate, endDate, dimensions: ["country"], rowLimit: 250 }),
      this.searchAnalytics(match.integrationId, match.siteUrl, { startDate, endDate, dimensions: ["device"], rowLimit: 10 }),
      this.searchAnalytics(match.integrationId, match.siteUrl, { startDate, endDate, dimensions: ["date"], rowLimit: 500 }),
    ]);

    const t = totalsRes?.rows?.[0];
    const totals = t
      ? { clicks: t.clicks, impressions: t.impressions, ctr: t.ctr, position: t.position }
      : { clicks: 0, impressions: 0, ctr: 0, position: 0 };

    // Each dimension row shares the same metric shape (clicks/impressions/ctr/position).
    const rowsFor = (res: any) =>
      (res?.rows || []).map((r: any) => ({
        key: (r.keys?.[0] ?? ""),
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));

    const queries = rowsFor(queriesRes);
    const pages = rowsFor(pagesRes);
    const countries = rowsFor(countriesRes);
    const devices = rowsFor(devicesRes);
    const trend = (trendRes?.rows || []).map((r: any) => ({ date: (r.keys?.[0] ?? ""), clicks: r.clicks, impressions: r.impressions }));

    return {
      connected: true,
      matched: true,
      siteUrl: match.siteUrl,
      accountEmail: match.accountEmail,
      days,
      totals,
      queries,
      pages,
      countries,
      devices,
      trend,
    };
  }

  // ---------------------------------------------------------------------------
  // Google Analytics 4 (Admin API + Data API)
  // ---------------------------------------------------------------------------

  // All GA4 properties across every connected Google account, with their web
  // stream URIs (used to auto-match a property to a project's domain).
  async listGaProperties(ownerKey: string): Promise<GaProperty[]> {
    const integs = await this.prisma.integration.findMany({ where: { ownerKey, provider: "google" } });
    const out: GaProperty[] = [];
    for (const integ of integs) {
      const token = await this.getToken(integ);
      if (!token) continue;
      try {
        const res = await fetch(
          "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) continue;
        const d: any = await res.json();
        const props: { propertyId: string; displayName: string }[] = [];
        for (const acc of d.accountSummaries || []) {
          for (const p of acc.propertySummaries || []) {
            const propertyId = String(p.property || "").replace("properties/", "");
            if (propertyId) props.push({ propertyId, displayName: p.displayName || propertyId });
          }
        }
        // Fetch web stream URIs (cap to keep this bounded for big accounts).
        for (const p of props.slice(0, 50)) {
          const streamUris = await this.gaStreamUris(token, p.propertyId);
          out.push({ ...p, accountEmail: integ.accountEmail, integrationId: integ.id, streamUris });
        }
      } catch {
        /* ignore this account */
      }
    }
    return out;
  }

  private async gaStreamUris(token: string, propertyId: string): Promise<string[]> {
    try {
      const res = await fetch(
        `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/dataStreams?pageSize=50`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return [];
      const d: any = await res.json();
      return (d.dataStreams || [])
        .map((s: any) => s?.webStreamData?.defaultUri)
        .filter(Boolean) as string[];
    } catch {
      return [];
    }
  }

  private matchProperty(props: GaProperty[], domain: string): GaProperty | null {
    const d = domain.replace(/^www\./, "").toLowerCase();
    const host = (u: string) => u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/\/$/, "").toLowerCase();
    // A stream host that IS `d` or a genuine subdomain of it — not any URL that
    // merely contains the string `d` (which matched `myd.com` / `d.com.evil`).
    const hostMatches = (u: string) => {
      const h = host(u);
      return h === d || h.endsWith(`.${d}`);
    };
    return (
      props.find((p) => p.streamUris.some(hostMatches)) ||
      props.find((p) => p.displayName.toLowerCase().includes(d)) || // last-resort: freeform label
      null
    );
  }

  private async gaRunReport(integrationId: string, propertyId: string, body: object) {
    const integ = await this.prisma.integration.findUnique({ where: { id: integrationId } });
    if (!integ) return null;
    const token = await this.getToken(integ);
    if (!token) return null;
    try {
      const res = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) return null;
      return (await res.json()) as any;
    } catch {
      return null;
    }
  }

  // GA4 traffic overview for a project (auto-matched by domain).
  async gaForProject(project: { orgId: string | null; createdById: string | null; domain: string }, days = 28, range?: { from?: string; to?: string }) {
    const ownerKey = this.ownerKeyForProject(project);
    const props = await this.listGaProperties(ownerKey);
    if (props.length === 0) return { connected: false, matched: false, properties: [] as string[] };
    const match = this.matchProperty(props, project.domain);
    if (!match) return { connected: true, matched: false, properties: props.map((p) => p.displayName) };

    // Explicit from/to range wins; otherwise the last `days` up to today.
    const dateRanges = [range?.from && range?.to ? { startDate: range.from, endDate: range.to } : { startDate: `${days}daysAgo`, endDate: "today" }];
    const id = match.propertyId;

    // One GA4 property can collect data from several hostnames (e.g. the same
    // measurement ID is installed on both the marketing site AND a client app on
    // a different subdomain). Restrict every report to the project's own domain
    // so we never mix in another site's traffic.
    const rootDomain = project.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
    const hostFilter = {
      filter: { fieldName: "hostName", stringFilter: { matchType: "ENDS_WITH", value: rootDomain, caseSensitive: false } },
    };
    const withHost = (body: Record<string, unknown>) => ({ ...body, dimensionFilter: hostFilter });

    const [totalsRes, trendRes, channelRes, pagesRes, countryRes, deviceRes, sourceRes, landingRes, cityRes, browserRes, newRetRes] = await Promise.all([
      this.gaRunReport(match.integrationId, id, withHost({
        dateRanges,
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
          { name: "engagementRate" },
        ],
      })),
      this.gaRunReport(match.integrationId, id, withHost({
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: 500,
      })),
      this.gaRunReport(match.integrationId, id, withHost({
        dateRanges,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 12,
      })),
      this.gaRunReport(match.integrationId, id, withHost({
        dateRanges,
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 200,
      })),
      this.gaRunReport(match.integrationId, id, withHost({
        dateRanges,
        dimensions: [{ name: "country" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 100,
      })),
      this.gaRunReport(match.integrationId, id, withHost({
        dateRanges,
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 5,
      })),
      this.gaRunReport(match.integrationId, id, withHost({
        dateRanges,
        dimensions: [{ name: "sessionSourceMedium" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 25,
      })),
      this.gaRunReport(match.integrationId, id, withHost({
        dateRanges,
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      })),
      this.gaRunReport(match.integrationId, id, withHost({
        dateRanges,
        dimensions: [{ name: "city" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      })),
      this.gaRunReport(match.integrationId, id, withHost({
        dateRanges,
        dimensions: [{ name: "browser" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      })),
      this.gaRunReport(match.integrationId, id, withHost({
        dateRanges,
        dimensions: [{ name: "newVsReturning" }],
        metrics: [{ name: "sessions" }],
        limit: 5,
      })),
    ]);

    const m = (res: any, i: number) => Number(res?.rows?.[0]?.metricValues?.[i]?.value ?? 0);
    const totals = {
      sessions: m(totalsRes, 0),
      users: m(totalsRes, 1),
      newUsers: m(totalsRes, 2),
      pageviews: m(totalsRes, 3),
      avgDuration: m(totalsRes, 4),
      bounceRate: m(totalsRes, 5),
      engagementRate: m(totalsRes, 6),
    };

    const rowsOf = (res: any) => (res?.rows || []) as any[];
    const trend = rowsOf(trendRes).map((r) => ({
      date: (r.dimensionValues?.[0]?.value ?? ""), // YYYYMMDD
      sessions: Number((r.metricValues?.[0]?.value ?? 0)),
      users: Number((r.metricValues?.[1]?.value ?? 0)),
    }));
    const channels = rowsOf(channelRes).map((r) => ({
      channel: (r.dimensionValues?.[0]?.value ?? ""),
      sessions: Number((r.metricValues?.[0]?.value ?? 0)),
      users: Number((r.metricValues?.[1]?.value ?? 0)),
    }));
    const topPages = rowsOf(pagesRes).map((r) => ({
      path: (r.dimensionValues?.[0]?.value ?? ""),
      pageviews: Number((r.metricValues?.[0]?.value ?? 0)),
      sessions: Number((r.metricValues?.[1]?.value ?? 0)),
    }));
    const countries = rowsOf(countryRes).map((r) => ({
      country: (r.dimensionValues?.[0]?.value ?? ""),
      sessions: Number((r.metricValues?.[0]?.value ?? 0)),
    }));
    const devices = rowsOf(deviceRes).map((r) => ({
      device: (r.dimensionValues?.[0]?.value ?? ""),
      sessions: Number((r.metricValues?.[0]?.value ?? 0)),
    }));
    const sources = rowsOf(sourceRes).map((r) => ({
      source: (r.dimensionValues?.[0]?.value ?? ""),
      sessions: Number((r.metricValues?.[0]?.value ?? 0)),
      users: Number((r.metricValues?.[1]?.value ?? 0)),
    }));
    const landingPages = rowsOf(landingRes).map((r) => ({
      path: (r.dimensionValues?.[0]?.value ?? ""),
      sessions: Number((r.metricValues?.[0]?.value ?? 0)),
    }));
    const cities = rowsOf(cityRes).map((r) => ({
      city: (r.dimensionValues?.[0]?.value ?? ""),
      sessions: Number((r.metricValues?.[0]?.value ?? 0)),
    }));
    const browsers = rowsOf(browserRes).map((r) => ({
      browser: (r.dimensionValues?.[0]?.value ?? ""),
      sessions: Number((r.metricValues?.[0]?.value ?? 0)),
    }));
    const newReturning = rowsOf(newRetRes).map((r) => ({
      type: (r.dimensionValues?.[0]?.value ?? "") || "unknown",
      sessions: Number((r.metricValues?.[0]?.value ?? 0)),
    }));

    return {
      connected: true,
      matched: true,
      propertyId: id,
      propertyName: match.displayName,
      accountEmail: match.accountEmail,
      days,
      totals,
      trend,
      channels,
      topPages,
      countries,
      devices,
      sources,
      landingPages,
      cities,
      browsers,
      newReturning,
    };
  }

  // Google Business Profile (GMB): finds the location whose website matches the
  // project's domain, then returns its rating + reviews + profile. Activates once
  // Google approves the project's Business Profile API access (until then the
  // accounts call returns 403 and we degrade to { connected:true, matched:false }).
  async gmbForProject(project: { orgId: string | null; createdById: string | null; domain: string }) {
    const ownerKey = this.ownerKeyForProject(project);
    const integs = await this.prisma.integration.findMany({ where: { ownerKey, provider: "google" } });
    if (integs.length === 0) return { connected: false, matched: false };
    const domain = project.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
    const sameHost = (uri?: string) => {
      if (!uri) return false;
      try { return new URL(uri).hostname.replace(/^www\./, "").toLowerCase() === domain; } catch { return false; }
    };

    for (const integ of integs) {
      const token = await this.getToken(integ);
      if (!token) continue;
      const auth = { Authorization: `Bearer ${token}` };
      try {
        const accRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: auth });
        // 429 = Business Profile API quota is 0 until Google approves the access
        // request; 403 = API not enabled. Either way, degrade quietly.
        if (!accRes.ok) { this.logger.warn(`GMB unavailable (${accRes.status}) — Business Profile API access likely pending approval`); continue; }
        const accounts: any[] = (await accRes.json()).accounts || [];
        for (const acc of accounts) {
          const readMask = "name,title,websiteUri,storefrontAddress,phoneNumbers,metadata";
          const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=${readMask}&pageSize=100`, { headers: auth });
          if (!locRes.ok) continue;
          const locations: any[] = (await locRes.json()).locations || [];
          const match = locations.find((l) => sameHost(l.websiteUri)) || (accounts.length === 1 && locations.length === 1 ? locations[0] : null);
          if (!match) continue;

          let rating: number | null = null;
          let totalReviews = 0;
          let reviews: { author: string; rating: number | null; text: string; at: string | null }[] = [];
          try {
            const revRes = await fetch(`https://mybusiness.googleapis.com/v4/${acc.name}/${match.name}/reviews?pageSize=20&orderBy=updateTime desc`, { headers: auth });
            if (revRes.ok) {
              const rd: any = await revRes.json();
              const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
              rating = typeof rd.averageRating === "number" ? Math.round(rd.averageRating * 10) / 10 : null;
              totalReviews = rd.totalReviewCount ?? (rd.reviews?.length ?? 0);
              reviews = (rd.reviews || []).slice(0, 10).map((r: any) => ({
                author: r.reviewer?.displayName ?? "Anonymous",
                rating: STAR[r.starRating] ?? null,
                text: (r.comment ?? "").slice(0, 400),
                at: r.updateTime ?? r.createTime ?? null,
              }));
            }
          } catch { /* reviews API may need extra approval */ }

          const addr = match.storefrontAddress;
          return {
            connected: true,
            matched: true,
            accountEmail: integ.accountEmail,
            title: match.title ?? null,
            websiteUri: match.websiteUri ?? null,
            phone: match.phoneNumbers?.primaryPhone ?? null,
            address: addr ? [...(addr.addressLines || []), addr.locality, addr.administrativeArea, addr.postalCode].filter(Boolean).join(", ") : null,
            mapsUri: match.metadata?.mapsUri ?? null,
            rating,
            totalReviews,
            reviews,
          };
        }
      } catch { /* try the next account */ }
    }
    return { connected: true, matched: false };
  }
}
