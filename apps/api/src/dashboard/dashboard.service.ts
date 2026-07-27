import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../auth/permissions.service";
import { PERMISSIONS } from "../auth/permissions";
import type { AuthUser } from "../auth/decorators/current-user.decorator";
import { ProjectsService } from "../projects/projects.service";
import { CrawlService } from "../crawl/crawl.service";
import { GoogleService } from "../integrations/google.service";
import { DataForSeoService } from "../dataforseo/dataforseo.service";
import { RankTrackerService } from "../rank-tracker/rank-tracker.service";
import { CopilotService } from "../copilot/copilot.service";

// Used only if the LLM isn't configured or errors — never a hard failure.
const FALLBACK_QUOTES = [
  "Small daily improvements are the key to staggering long-term results.",
  "SEO is a marathon, not a sprint — consistency compounds.",
  "Rank for what people search, not for what you wish they'd search.",
  "Today's audit is tomorrow's advantage.",
  "Write for humans first, crawlers second.",
  "Fast sites win. Speed is a feature, not an afterthought.",
  "The riches are in the niches.",
];

// Compact metric blocks. `loaded: false` = data isn't cached yet, so the UI shows
// a "Load" chip instead of a value (paid DataForSEO data is never fetched here).
const round = (n: number) => Math.round(n * 10) / 10;

function mapGsc(g: any) {
  if (g?.totals) return { loaded: true, clicks: g.totals.clicks ?? 0, impressions: g.totals.impressions ?? 0, ctr: g.totals.ctr ?? 0, position: g.totals.position ?? null };
  return { loaded: false };
}
function mapGa(g: any) {
  if (g?.totals) return { loaded: true, sessions: g.totals.sessions ?? 0, users: g.totals.users ?? 0, bounceRate: g.totals.bounceRate ?? null };
  return { loaded: false };
}
function mapRank(list: any[]) {
  const positions = (list ?? []).map((k) => k.position).filter((p): p is number => p != null);
  const deltas = (list ?? []).map((k) => k.delta).filter((d): d is number => d != null);
  return {
    trackedCount: (list ?? []).length,
    avgPosition: positions.length ? round(positions.reduce((a, b) => a + b, 0) / positions.length) : null,
    // Net movement across tracked keywords: positive = moved up (improved).
    trend: deltas.length ? round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null,
  };
}
function mapBacklinks(r: any) {
  if (r?.summary) return { loaded: true, backlinks: r.summary.backlinks ?? 0, referringDomains: r.summary.referringDomains ?? 0, spamScore: r.summary.spamScore ?? 0 };
  return { loaded: false };
}
function mapRanked(r: any) {
  if (r?.totals) return { loaded: true, count: r.totals.count ?? 0, etv: r.totals.etv ?? 0, pos_1: r.totals.pos_1 ?? 0, pos_2_3: r.totals.pos_2_3 ?? 0, pos_4_10: r.totals.pos_4_10 ?? 0 };
  return { loaded: false };
}
function mapCompetitors(r: any) {
  if (r?.overview) return { loaded: true, count: Array.isArray(r.competitors) ? r.competitors.length : 0 };
  return { loaded: false };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly crawls: CrawlService,
    private readonly google: GoogleService,
    private readonly dataforseo: DataForSeoService,
    private readonly rankTracker: RankTrackerService,
    private readonly perms: PermissionsService,
    private readonly prisma: PrismaService,
    private readonly llm: CopilotService,
  ) {}

  // A fresh motivational one-liner each day. Generated once by the LLM and cached
  // for the whole day (so it costs at most one tiny call per day, shared by everyone).
  async dailyQuote(): Promise<{ quote: string; ai: boolean }> {
    const today = new Date().toISOString().slice(0, 10);
    const key = `dailyquote:${today}`;
    const hit = await this.prisma.dataCache.findUnique({ where: { key } }).catch(() => null);
    if (hit) return hit.payload as any;

    const dayIdx = Math.abs([...today].reduce((a, c) => a + c.charCodeAt(0), 0));
    let quote = FALLBACK_QUOTES[dayIdx % FALLBACK_QUOTES.length];
    let ai = false;
    if (this.llm.configured) {
      try {
        const system = "You write ONE short, punchy motivational line for an SEO/marketing dashboard's welcome banner. Rules: a single sentence, under 16 words, no surrounding quotes, no attribution, no emojis. Make it about SEO, content, growth, focus or momentum. Vary the theme daily.";
        const out = (await this.llm.once(system, `Write today's line for ${today}.`, [])).trim().replace(/^["']|["']$/g, "").split("\n")[0].slice(0, 160);
        if (out) { quote = out; ai = true; }
      } catch { /* keep fallback */ }
    }
    const payload = { quote, ai };
    await this.prisma.dataCache.upsert({ where: { key }, create: { key, payload }, update: { payload } }).catch(() => {});
    return payload;
  }

  // One payload powering the whole dashboard: role-scoped campaigns, each with
  // its cached/DB-only metrics, plus the clients they belong to (for grouping).
  // NEVER makes a live paid DataForSEO call — missing data comes back loaded:false.
  async summary(user: AuthUser, days = 28) {
    const d = [7, 28, 60, 90].includes(days) ? days : 28;
    const projects = await this.projects.list(user);
    if (projects.length === 0) return { role: user.role, isAgency: false, projects: [], clients: [] };

    const perms = await this.perms.resolve(user);
    const can = (p: string) => perms.has(p as any);

    // Clients (in the user's org) that own any of the visible campaigns → grouped view.
    const projectIds = projects.map((p) => p.id);
    const clientRows = user.orgId
      ? await this.prisma.client.findMany({
          where: { orgId: user.orgId, projects: { some: { id: { in: projectIds } } } },
          select: { id: true, name: true, type: true, branding: true, projects: { where: { id: { in: projectIds } }, select: { id: true } } },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const isAgency = clientRows.some((c) => c.type === "AGENCY");
    const clientsOf = new Map<string, string[]>();
    for (const c of clientRows) for (const p of c.projects) clientsOf.set(p.id, [...(clientsOf.get(p.id) ?? []), c.id]);

    // Assigned team members per campaign (internal users only — not shown to clients).
    const canSeeTeam = user.role !== "CLIENT";
    const membersOf = new Map<string, { id: string; name: string | null; email: string }[]>();
    if (canSeeTeam) {
      const memberRows = await this.prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, members: { select: { id: true, name: true, email: true } } },
      });
      for (const m of memberRows) membersOf.set(m.id, m.members);
    }

    // Org-level counts for the admin's workspace overview (clients + team size).
    let org: { clients: number; agencyClients: number; teamMembers: number } | null = null;
    if (user.orgId && (user.role === "ADMIN" || can(PERMISSIONS.CLIENTS_VIEW_ALL) || can(PERMISSIONS.TEAM_VIEW))) {
      const [clients, agencyClients, teamMembers] = await Promise.all([
        this.prisma.client.count({ where: { orgId: user.orgId } }),
        this.prisma.client.count({ where: { orgId: user.orgId, type: "AGENCY" } }),
        this.prisma.user.count({ where: { orgId: user.orgId, role: { not: "CLIENT" } } }),
      ]);
      org = { clients, agencyClients, teamMembers };
    }

    // Aggregate daily trend across campaigns (from cached GSC + GA) for a
    // portfolio performance chart. Free — reads cache only.
    const trendMap = new Map<string, { date: string; clicks: number; impressions: number; sessions: number }>();
    const normDate = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d);
    const bump = (d: string) => { let e = trendMap.get(d); if (!e) { e = { date: d, clicks: 0, impressions: 0, sessions: 0 }; trendMap.set(d, e); } return e; };

    const rows = await Promise.all(
      projects.map(async (p) => {
        const [audit, gsc, ga, gmb, rank, backlinks, ranked, competitors] = await Promise.all([
          can(PERMISSIONS.AUDIT_VIEW) ? this.crawls.latestForProject(p.id).catch(() => null) : Promise.resolve(null),
          can(PERMISSIONS.OVERVIEW_VIEW) ? this.google.peek<any>(`gsc:${p.id}:${d}`).catch(() => null) : Promise.resolve(null),
          can(PERMISSIONS.TRAFFIC_VIEW) ? this.google.peek<any>(`ga:${p.id}:${d}`).catch(() => null) : Promise.resolve(null),
          can(PERMISSIONS.OVERVIEW_VIEW) ? this.google.peek<any>(`gmb:${p.id}`).catch(() => null) : Promise.resolve(null),
          can(PERMISSIONS.RANKS_VIEW) ? this.rankTracker.list(p.id).catch(() => []) : Promise.resolve([]),
          can(PERMISSIONS.BACKLINKS_VIEW) ? this.dataforseo.backlinksForDomain(p.domain, false, true).catch(() => null) : Promise.resolve(null),
          can(PERMISSIONS.RANKS_VIEW) ? this.dataforseo.rankedKeywords(p.domain, undefined, "en", false, true).catch(() => null) : Promise.resolve(null),
          can(PERMISSIONS.COMPETITORS_VIEW) ? this.dataforseo.competitors(p.domain, undefined, "en", false, true).catch(() => null) : Promise.resolve(null),
        ]);
        if (Array.isArray(gsc?.trend)) for (const r of gsc.trend) { const e = bump(normDate(String(r.date ?? ""))); e.clicks += r.clicks ?? 0; e.impressions += r.impressions ?? 0; }
        if (Array.isArray(ga?.trend)) for (const r of ga.trend) { const e = bump(normDate(String(r.date ?? ""))); e.sessions += r.sessions ?? 0; }

        // Per-campaign setup status (which integrations / signals are in place).
        const techArr = Array.isArray((audit as any)?.technologies) ? (audit as any).technologies : [];
        const issues = Array.isArray((audit as any)?.issuesSummary) ? (audit as any).issuesSummary : [];
        const setup = can(PERMISSIONS.AUDIT_VIEW)
          ? { tech: techArr.length > 0, sitemap: !!audit && !issues.some((i: any) => i?.code === "no-sitemap"), gsc: gsc?.matched === true, ga: ga?.matched === true, gmb: gmb?.matched === true }
          : undefined;
        // Detected technology names (deduped), for the row's tech-stack popover.
        const techStack = can(PERMISSIONS.AUDIT_VIEW) ? [...new Set(techArr.map((t: any) => t?.name).filter(Boolean))].slice(0, 16) : undefined;
        // PageSpeed performance scores (0–100) for mobile + desktop.
        const ps = (audit as any)?.pagespeed;
        const speed = can(PERMISSIONS.AUDIT_VIEW) ? { mobile: ps?.mobile?.scores?.performance ?? null, desktop: ps?.desktop?.scores?.performance ?? null } : undefined;

        return {
          id: p.id,
          name: p.name,
          domain: p.domain,
          clientIds: clientsOf.get(p.id) ?? [],
          members: membersOf.get(p.id) ?? [],
          setup,
          techStack,
          speed,
          metrics: {
            audit: can(PERMISSIONS.AUDIT_VIEW)
              ? audit
                ? { status: audit.status, healthScore: audit.healthScore, errors: audit.errors, warnings: audit.warnings, notices: audit.notices, pagesCrawled: audit.pagesCrawled, finishedAt: audit.finishedAt, lcpMs: audit.lcpMs, clsScore: audit.clsScore }
                : null
              : undefined,
            gsc: can(PERMISSIONS.OVERVIEW_VIEW) ? mapGsc(gsc) : undefined,
            ga: can(PERMISSIONS.TRAFFIC_VIEW) ? mapGa(ga) : undefined,
            gmb: can(PERMISSIONS.OVERVIEW_VIEW) ? (gmb?.matched ? { loaded: true, rating: gmb.rating ?? null, reviews: gmb.totalReviews ?? 0 } : { loaded: false }) : undefined,
            rankTracker: can(PERMISSIONS.RANKS_VIEW) ? mapRank(rank as any[]) : undefined,
            backlinks: can(PERMISSIONS.BACKLINKS_VIEW) ? mapBacklinks(backlinks) : undefined,
            rankedKeywords: can(PERMISSIONS.RANKS_VIEW) ? mapRanked(ranked) : undefined,
            competitors: can(PERMISSIONS.COMPETITORS_VIEW) ? mapCompetitors(competitors) : undefined,
          },
        };
      }),
    );

    const trend = [...trendMap.values()].filter((e) => e.date).sort((a, b) => (a.date < b.date ? -1 : 1));

    return {
      role: user.role,
      isAgency,
      org,
      projects: rows,
      trend,
      clients: clientRows.map((c) => ({ id: c.id, name: c.name, type: c.type, branding: c.branding, projectIds: c.projects.map((x) => x.id) })),
    };
  }
}
