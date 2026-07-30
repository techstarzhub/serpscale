import { Controller, Get, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ProjectsService } from "../projects/projects.service";
import { CrawlService } from "../crawl/crawl.service";
import { GoogleService } from "../integrations/google.service";
import { DataForSeoService } from "../dataforseo/dataforseo.service";
import { RankTrackerService } from "../rank-tracker/rank-tracker.service";

// Accept only well-formed YYYY-MM-DD from/to (both required) — guards the
// Google APIs from bad input coming through the public link.
function validRange(from?: string, to?: string): { from: string; to: string } | undefined {
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  return ok(from) && ok(to) ? { from: from!, to: to! } : undefined;
}

/**
 * Public, read-only campaign view — reachable WITHOUT logging in via a unique
 * share key (/public/projects/:key/...). Anyone holding the link can view the
 * campaign's dashboards; nothing here mutates data.
 *
 * Safety rules for this controller:
 *  - No JwtAuthGuard: the share key IS the credential. It's resolved on every
 *    request, so revoking the key (clearing shareKey) instantly kills access.
 *  - Cache-only: public viewers never trigger a live/paid refetch (DataForSEO,
 *    PageSpeed). They see exactly the cached data the campaign owner already
 *    loaded — so a shared link can never run up API costs.
 *  - Still rate-limited by the global ThrottlerGuard.
 */
@Controller("public/projects")
export class PublicController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly crawls: CrawlService,
    private readonly google: GoogleService,
    private readonly dataforseo: DataForSeoService,
    private readonly rankTracker: RankTrackerService,
  ) {}

  // Basic campaign info for the public header + which dashboards to show.
  @Get(":key")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async info(@Param("key") key: string) {
    const p = await this.projects.getByShareKey(key);
    return { name: p.name, domain: p.domain, enabledTabs: p.enabledTabs, sharedAt: p.sharedAt };
  }

  // ---- Google Search Console (served from the owner's cache) ----
  @Get(":key/gsc")
  async gsc(@Param("key") key: string, @Query("days") days?: string, @Query("from") from?: string, @Query("to") to?: string) {
    const project = await this.projects.getByShareKey(key);
    const d = Math.min(90, Math.max(7, Number(days) || 28));
    const range = validRange(from, to);
    const ck = `gsc:${project.id}:${range ? `${range.from}_${range.to}` : d}`;
    const matched = (await this.google.peek<any>(ck))?.matched === true;
    return this.google.cached(ck, matched ? 3 * 3600_000 : 30 * 60_000, () => this.google.gscForProject(project, d, range), false, true);
  }

  // ---- Google Analytics 4 (served from the owner's cache) ----
  @Get(":key/ga")
  async ga(@Param("key") key: string, @Query("days") days?: string, @Query("from") from?: string, @Query("to") to?: string) {
    const project = await this.projects.getByShareKey(key);
    const d = Math.min(90, Math.max(7, Number(days) || 28));
    const range = validRange(from, to);
    const ck = `ga:${project.id}:${range ? `${range.from}_${range.to}` : d}`;
    const matched = (await this.google.peek<any>(ck))?.matched === true;
    return this.google.cached(ck, matched ? 3 * 3600_000 : 30 * 60_000, () => this.google.gaForProject(project, d, range), false, true);
  }

  // ---- DataForSEO backlinks (cache-only) ----
  @Get(":key/backlinks")
  async backlinks(@Param("key") key: string) {
    const project = await this.projects.getByShareKey(key);
    return this.dataforseo.backlinksForDomain(project.domain, false, true);
  }

  // ---- DataForSEO ranked keywords (cache-only) ----
  @Get(":key/ranked-keywords")
  async rankedKeywords(@Param("key") key: string, @Query("country") country?: string, @Query("language") language?: string) {
    const project = await this.projects.getByShareKey(key);
    return this.dataforseo.rankedKeywords(project.domain, country, language || "en", false, true);
  }

  // ---- DataForSEO competitors (cache-only) ----
  @Get(":key/competitors")
  async competitors(@Param("key") key: string, @Query("country") country?: string, @Query("language") language?: string) {
    const project = await this.projects.getByShareKey(key);
    return this.dataforseo.competitors(project.domain, country, language || "en", false, true);
  }

  // ---- Latest technical audit summary ----
  @Get(":key/crawl/latest")
  async latestCrawl(@Param("key") key: string) {
    const project = await this.projects.getByShareKey(key);
    return this.crawls.latestForProject(project.id);
  }

  // ---- Daily tracked keywords (live rank tracker) ----
  @Get(":key/rank-keywords")
  async rankKeywords(@Param("key") key: string) {
    const project = await this.projects.getByShareKey(key);
    return this.rankTracker.list(project.id);
  }

  // ---- Detected technology stack (cache-only) ----
  @Get(":key/technologies")
  async technologies(@Param("key") key: string) {
    const project = await this.projects.getByShareKey(key);
    return this.dataforseo.technologies(project.domain, false, true);
  }

  // ---- PageSpeed / Core Web Vitals (cache-only) ----
  @Get(":key/pagespeed")
  async pagespeed(@Param("key") key: string, @Query("url") url?: string) {
    const project = await this.projects.getByShareKey(key);
    if (!url) return { error: "url required" };
    let host: string;
    try {
      host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return { error: "invalid url" };
    }
    const domain = project.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
    if (host !== domain) return { error: "url must be on the project domain" };
    // Cache-only: only serve what the owner already generated; never spend on a
    // fresh PageSpeed run for an anonymous viewer.
    return (await this.google.peek(`pagespeed:${project.id}:${url}`)) ?? null;
  }
}
