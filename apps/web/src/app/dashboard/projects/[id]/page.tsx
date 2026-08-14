"use client";

import { useState, useEffect, useRef } from "react";
import type { ComponentType, CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { SiGoogleanalytics, SiGooglesearchconsole } from "react-icons/si";
import {
  Search,
  LineChart,
  Link2,
  FileSearch,
  LayoutGrid,
  Activity,
  Calendar,
  ChevronDown,
  Settings,
  Globe,
  Plus,
  RefreshCw,
  UserPlus,
  Swords,
  Server,
  Sparkles,
  Bot,
  PenLine,
  ExternalLink,
  FileText,
  Share2,
  Trash2,
  Pencil,
  Check,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { OverviewSkeleton } from "@/components/ui/panel-skeletons";
import { CampaignMembers } from "./campaign-members";
import { ContentPanel } from "./content-panel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useCurrentUser, useCan, useFeature } from "@/components/providers/user-provider";
import { LockedFeature, LockPip } from "@/components/ui/locked-feature";
import { useProjects, type Project } from "@/components/providers/projects-provider";
import {
  OverviewPanel,
  BacklinksPanel,
  SettingsPanel,
} from "./panels";
import { SiteAudit } from "./site-audit";
import { GscRankTracker } from "./gsc-panel";
import { GaTraffic } from "./ga-panel";
import { SerpExplorer } from "./serp-explorer";
import { RankedKeywords } from "./ranked-keywords";
import { CompetitorsPanel, DomainPanel, AiVisibilityPanel } from "./dataforseo-panels";
import { CopilotPanel, type CopilotAction } from "./copilot-panel";
import { TrackedKeywords } from "./tracked-keywords";
import { ProjectActionsMenu } from "./project-actions-menu";

type TabKey = "overview" | "copilot" | "keywords" | "content" | "ranks" | "competitors" | "traffic" | "backlinks" | "domain" | "ai" | "audit" | "settings";

// Icons come from lucide OR react-icons (brand logos), so accept any component
// that takes a className + optional inline style (for a fixed brand colour).
type TabIcon = ComponentType<{ className?: string; style?: CSSProperties }>;

// Each tab declares the permission needed to see it (undefined = always visible).
// `brand` sets a fixed logo colour (used for real product icons like GA / GSC).
const tabs: { key: TabKey; label: string; icon: TabIcon; perm?: string; brand?: string }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid, perm: "overview.view" },
  { key: "copilot", label: "AI Copilot", icon: Bot, perm: "copilot.view" },
  { key: "keywords", label: "Keywords", icon: Search, perm: "keywords.research" },
  { key: "content", label: "Content", icon: PenLine, perm: "keywords.research" },
  { key: "ranks", label: "Ranks", icon: SiGooglesearchconsole, perm: "ranks.view", brand: "#458CF5" },
  { key: "competitors", label: "Competitors", icon: Swords, perm: "competitors.view" },
  { key: "traffic", label: "Traffic", icon: SiGoogleanalytics, perm: "traffic.view", brand: "#E37400" },
  { key: "backlinks", label: "Backlinks", icon: Link2, perm: "backlinks.view" },
  { key: "domain", label: "Domain", icon: Server, perm: "domain.view" },
  { key: "ai", label: "AI Visibility", icon: Sparkles, perm: "ai.view" },
  { key: "audit", label: "Audit", icon: FileSearch, perm: "audit.view" },
  { key: "settings", label: "Settings", icon: Settings, perm: "settings.manage" },
];

type TabDef = { key: TabKey; label: string; icon: TabIcon; perm?: string; brand?: string };

// Minimal shape of the latest crawl, just enough to drive the header status pill.
// latestForProject() only ever returns COMPLETED/RUNNING/QUEUED crawls (never FAILED/CANCELLED).
type LatestCrawl = { status: "QUEUED" | "RUNNING" | "COMPLETED"; finishedAt: string | null; healthScore?: number | null; errors?: number; warnings?: number; notices?: number } | null;

// Compact number formatter for the header KPI strip (1.8K, 2.4M).
const kfmt = (n?: number | null) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};
// Period-over-period % change: second half of the trend vs the first half.
function trendDelta(trend: { [k: string]: number }[] | undefined, key: string): number | null {
  if (!trend || trend.length < 4) return null;
  const mid = Math.floor(trend.length / 2);
  const a = trend.slice(0, mid).reduce((s, r) => s + (r[key] ?? 0), 0);
  const b = trend.slice(mid).reduce((s, r) => s + (r[key] ?? 0), 0);
  return a === 0 ? null : ((b - a) / a) * 100;
}
type HeaderStats = {
  gscClicks?: number; gscImpr?: number; gscPos?: number | null;
  gaUsers?: number; keywords?: number; backlinks?: number;
  clicksTrend?: number | null; visitorsTrend?: number | null;
} | null;

// The at-a-glance strip under the project name. Plain-language labels + a short
// tooltip on each, so a non-technical user understands every number instantly.
// Site health leads, then audit issues & speed, then search/traffic metrics.
function HeaderKpiStrip({ stats, health, issues, speed, loading }: { stats: HeaderStats; health: number | null; issues: number | null; speed: { mobile: number | null; desktop: number | null } | null; loading: boolean }) {
  // 0–49 red · 50–89 amber · 90–100 green — matches Google's PageSpeed bands.
  const scoreClass = (v: number) => (v >= 90 ? "text-chart-2" : v >= 50 ? "text-chart-3" : "text-destructive");
  // `dynamic` items depend on the selected period; they show a skeleton while a
  // new range is loading. Health/issues/speed are period-independent, so stay put.
  const items: { label: string; value: string; trend?: number | null; valueClass?: string; hint: string; dynamic?: boolean }[] = [];

  // 1) Site health — first, as requested.
  if (health != null) {
    items.push({ label: "Site health", value: `${Math.round(health)}/100`, valueClass: health >= 80 ? "text-chart-2" : health >= 50 ? "text-chart-3" : "text-destructive", hint: "Overall technical health from the latest audit (0–100)" });
  }
  // 2) Audit issues & page speed.
  if (issues != null) {
    items.push({ label: "Issues", value: kfmt(issues), valueClass: issues === 0 ? "text-chart-2" : "text-chart-3", hint: "Technical issues found in the latest audit (errors + warnings + notices)" });
  }
  if (speed?.mobile != null) items.push({ label: "Mobile speed", value: `${Math.round(speed.mobile)}`, valueClass: scoreClass(speed.mobile), hint: "Google PageSpeed score on mobile (0–100)" });
  if (speed?.desktop != null) items.push({ label: "Desktop speed", value: `${Math.round(speed.desktop)}`, valueClass: scoreClass(speed.desktop), hint: "Google PageSpeed score on desktop (0–100)" });

  // 3) Search & traffic.
  if (stats) {
    if (stats.gscClicks != null) items.push({ label: "Clicks", value: kfmt(stats.gscClicks), trend: stats.clicksTrend, hint: "Visits from Google Search in the selected period", dynamic: true });
    if (stats.gscImpr != null) items.push({ label: "Impressions", value: kfmt(stats.gscImpr), hint: "Times you appeared in Google in the selected period", dynamic: true });
    if (stats.gscPos != null) items.push({ label: "Avg. Google rank", value: stats.gscPos.toFixed(1), hint: "Average position in Google — lower is better", dynamic: true });
    if (stats.gaUsers != null) items.push({ label: "Visitors", value: kfmt(stats.gaUsers), trend: stats.visitorsTrend, hint: "Website visitors (Analytics) in the selected period", dynamic: true });
    if (stats.keywords != null) items.push({ label: "Ranking keywords", value: kfmt(stats.keywords), hint: "Search terms your site shows up for", dynamic: true });
    if (stats.backlinks != null) items.push({ label: "Backlinks", value: kfmt(stats.backlinks), hint: "Links from other websites to yours" });
  }
  if (!items.length) return null;

  return (
    <div className="mt-4 flex items-center gap-6 overflow-x-auto border-t border-border pt-4 lg:mt-5 lg:gap-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((k) => (
        <div key={k.label} className="shrink-0" title={k.hint}>
          <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
          {loading && k.dynamic ? (
            <span className="mt-1.5 block h-5 w-14 animate-pulse rounded bg-secondary lg:h-6" />
          ) : (
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className={cn("text-xl font-bold leading-none lg:text-2xl", k.valueClass)}>{k.value}</span>
              {k.trend != null && (
                <span className={cn("text-xs font-semibold", k.trend >= 0 ? "text-chart-2" : "text-destructive")}>
                  {k.trend >= 0 ? "▲" : "▼"} {Math.abs(k.trend).toFixed(0)}%
                </span>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// The reporting window for the header/overview metrics: a preset day count OR an
// explicit custom date range. Every distinct window is cached (persisted) in the DB.
type Period = { days: number } | { from: string; to: string };
const periodLabel = (p: Period) =>
  "from" in p ? `${p.from} → ${p.to}` : p.days === 1 ? "Today" : p.days === 7 ? "Last 7 days" : p.days === 90 ? "Last 90 days" : `Last ${p.days} days`;
const periodQuery = (p: Period) => ("from" in p ? `from=${p.from}&to=${p.to}` : `days=${p.days}`);

// Period picker: preset ranges + a custom from/to. Dropdown, theme-styled.
function PeriodFilter({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const presets = [1, 7, 28, 90];
  const activePreset = (d: number) => !("from" in period) && period.days === d;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm font-medium transition-colors hover:bg-secondary lg:h-11"
      >
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="whitespace-nowrap">{periodLabel(period)}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-lg">
          {presets.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => { onChange({ days: d }); setOpen(false); }}
              className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-secondary", activePreset(d) && "bg-secondary font-semibold")}
            >
              {periodLabel({ days: d })}
              {activePreset(d) && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
          <div className="my-1.5 border-t border-border" />
          <div className="px-2 pb-1.5">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Custom range</p>
            <div className="flex items-center gap-1.5">
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs outline-none focus:border-primary" />
              <span className="shrink-0 text-muted-foreground">→</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs outline-none focus:border-primary" />
            </div>
            <button
              type="button"
              disabled={!from || !to || from > to}
              onClick={() => { onChange({ from, to }); setOpen(false); }}
              className="mt-2 w-full rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Apply custom range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Per-tab icon tint so inactive tabs read as colourful glyphs (like a channel
// bar) instead of a flat grey row. Active tabs go white on the gradient pill.
const TAB_ACCENT: Record<TabKey, string> = {
  overview: "text-chart-1",
  copilot: "text-chart-4",
  keywords: "text-chart-1",
  content: "text-chart-3",
  ranks: "text-chart-2",
  competitors: "text-chart-5",
  traffic: "text-chart-2",
  backlinks: "text-chart-4",
  domain: "text-chart-1",
  ai: "text-chart-4",
  audit: "text-chart-3",
  settings: "text-muted-foreground",
};

// Site logo from the domain's favicon, with a globe fallback.
function Favicon({ domain }: { domain: string }) {
  const [err, setErr] = useState(false);
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/40 via-primary/15 to-primary/5 p-[1.5px] shadow-soft lg:h-14 lg:w-14 lg:rounded-2xl">
      <span className="grid h-full w-full place-items-center overflow-hidden rounded-[10px] bg-card lg:rounded-[14px]">
        {err ? (
          <Globe className="h-5 w-5 text-muted-foreground lg:h-6 lg:w-6" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
            alt=""
            className="h-6 w-6 lg:h-7 lg:w-7"
            onError={() => setErr(true)}
          />
        )}
      </span>
    </span>
  );
}

// Loading placeholder that mirrors the real project layout.
function ProjectSkeleton() {
  // Tab-pill widths that mirror the real grouped tab bar (Overview → Audit).
  const tabW = [72, 92, 84, 66, 108, 82, 96, 78, 110, 70];
  return (
    // Match the real workspace scale (zoom 0.9) so swapping skeleton -> content
    // doesn't resize/shift the whole page.
    <div className="space-y-3" style={{ zoom: 0.9 }}>
      {/* header — mirrors the real campaign bar (favicon + title/badge + domain,
          member avatars + refresh + Run audit on the right) */}
      <Card className="bg-card shadow-soft">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
          <div className="flex items-center gap-3 lg:gap-4">
            <Skeleton className="h-11 w-11 rounded-xl lg:h-14 lg:w-14 lg:rounded-2xl" />
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-6 w-40 rounded-md lg:w-52" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-4 w-36 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* stacked member avatars */}
            <div className="flex -space-x-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 w-8 rounded-full ring-2 ring-card" />
              ))}
            </div>
            <Skeleton className="h-10 w-10 rounded-lg lg:h-11 lg:w-11" />
            <Skeleton className="h-10 w-28 rounded-lg lg:h-11" />
          </div>
        </CardContent>
      </Card>

      {/* tab bar — the rounded pill with tab-shaped chips + the two round accent
          buttons (settings gear + AI copilot) beside it */}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-full border border-border bg-card p-2 shadow-soft">
          {tabW.map((w, i) => (
            <Skeleton key={i} className="h-9 shrink-0 rounded-full" style={{ width: w }} />
          ))}
        </div>
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
      </div>

      {/* Reuse the EXACT Overview skeleton so there's no second jump when the
          project loads and the Overview tab swaps in its own skeleton. */}
      <OverviewSkeleton />
    </div>
  );
}

export default function ProjectWorkspace() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getProject, loading } = useProjects();
  const { user } = useCurrentUser();
  const can = useCan();
  const hasFeature = useFeature();
  // Start on the tab named in the URL (?tab=) so a reload restores it. Guarded
  // for SSR; during data-loading the skeleton renders, so no hydration mismatch.
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "overview";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t && tabs.some((x) => x.key === t) ? (t as TabKey) : "overview";
  });
  const [refreshNonce, setRefreshNonce] = useState(0);
  // Reporting window for the header KPIs + Overview (preset days or custom range).
  const [period, setPeriod] = useState<Period>({ days: 28 });
  // Always send fresh=1; the server enforces one paid refresh per project per day
  // across all users via an atomic DB claim — no client-side tracking needed.
  const refreshMode = "live" as const;
  // "Run audit" in the header should both open the Audit tab AND kick off a crawl.
  const [pendingAudit, setPendingAudit] = useState(false);
  // Super admins manage the platform, not campaigns — send them to the admin panel.
  useEffect(() => {
    if (user?.role === "SUPER_ADMIN") router.replace("/dashboard/admin");
  }, [user?.role, router]);
  const projectForTabs = getProject(params.id);
  // Dashboards active for THIS campaign (chosen in the wizard). Empty = all.
  // Overview & Settings always stay available regardless of the campaign's set.
  const enabledForCampaign = projectForTabs?.enabledTabs ?? [];
  // Client-portal users (read-only) must never see the agency's plan internals —
  // a feature the plan lacks is simply absent for them, not an upsell.
  const isClient = user?.role === "CLIENT";
  // Only a user who can change billing sees a real "Upgrade" button; others get
  // an "ask your admin" note instead.
  const canUpgrade = can("billing.manage");
  // A gateable feature tab whose plan doesn't include it — shown LOCKED (with an
  // upgrade-to-unlock panel) rather than hidden, so customers can see what more
  // they'd get. overview + settings are always on.
  const isTabLocked = (k: TabKey) => k !== "overview" && k !== "settings" && !hasFeature(k) && !isClient;
  const visibleTabs = tabs.filter((t) => {
    if (t.perm && !can(t.perm)) return false;
    if (t.key === "overview" || t.key === "settings") return true;
    const lockedByPlan = !hasFeature(t.key);
    if (lockedByPlan) return !isClient; // agency: show locked+upgrade; client: hide
    // Unlocked feature → respect the campaign's chosen dashboards (per-campaign).
    if (enabledForCampaign.length) return enabledForCampaign.includes(t.key);
    return true;
  });
  const tabAllowed = visibleTabs.some((t) => t.key === tab);
  // Only fall back to the first tab once the project + entitlements have loaded —
  // otherwise a restored tab (from ?tab=) gets clobbered before its feature is
  // known to be allowed.
  useEffect(() => {
    if (!loading && projectForTabs && visibleTabs.length && !tabAllowed) setTab(visibleTabs[0].key);
  }, [loading, projectForTabs, tabAllowed, visibleTabs]);

  const project = getProject(params.id);

  // Header status pill: reflects the project's actual latest crawl, not a guess.
  // Re-fetched on refresh and whenever a crawl finishes on the Audit tab.
  const [latestCrawl, setLatestCrawl] = useState<LatestCrawl>(null);
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    api
      .get<LatestCrawl>(`/projects/${project.id}/crawl/latest`)
      .then((c) => { if (!cancelled) setLatestCrawl(c); })
      .catch(() => { if (!cancelled) setLatestCrawl(null); });
    return () => { cancelled = true; };
  }, [project?.id, refreshNonce, tab]);

  // At-a-glance KPIs for the header strip — the numbers a user checks first, so
  // they see them up top without opening any tab. Free data (GSC/GA) loads live;
  // paid backlinks are read from cache only (never triggers a paid lookup here).
  const [stats, setStats] = useState<HeaderStats>(null);
  // While a new period's data is in flight, the period-dependent KPIs show a
  // skeleton instead of stale values — clearer feedback than numbers "jumping".
  const [statsLoading, setStatsLoading] = useState(true);
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    setStatsLoading(true);
    const pq = periodQuery(period);
    Promise.allSettled([
      api.get<any>(`/projects/${project.id}/gsc?${pq}`),
      api.get<any>(`/projects/${project.id}/ga?${pq}`),
      api.get<any>(`/projects/${project.id}/backlinks?cachedOnly=1`),
    ]).then((r) => {
      if (cancelled) return;
      const gsc = r[0].status === "fulfilled" ? r[0].value : null;
      const ga = r[1].status === "fulfilled" ? r[1].value : null;
      const bl = r[2].status === "fulfilled" ? r[2].value : null;
      const gscOk = gsc?.connected && gsc?.matched;
      const gaOk = ga?.connected && ga?.matched;
      setStats({
        gscClicks: gscOk ? gsc.totals?.clicks : undefined,
        gscImpr: gscOk ? gsc.totals?.impressions : undefined,
        gscPos: gscOk ? gsc.totals?.position ?? null : undefined,
        keywords: gscOk ? gsc.queries?.length : undefined,
        gaUsers: gaOk ? ga.totals?.users : undefined,
        backlinks: bl?.summary?.backlinks,
        clicksTrend: gscOk ? trendDelta(gsc.trend, "clicks") : null,
        visitorsTrend: gaOk ? trendDelta(ga.trend, "users") ?? trendDelta(ga.trend, "sessions") : null,
      });
      setStatsLoading(false);
    });
    return () => { cancelled = true; };
  }, [project?.id, refreshNonce, period]);

  // PageSpeed (mobile + desktop) for the header — slow uncached, cached 24h, so it
  // fills in asynchronously without ever blocking the page.
  const [speed, setSpeed] = useState<{ mobile: number | null; desktop: number | null } | null>(null);
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const root = project.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    api
      .get<any>(`/projects/${project.id}/pagespeed?url=${encodeURIComponent(`https://${root}`)}`)
      .then((d) => { if (!cancelled) setSpeed({ mobile: d?.mobile?.scores?.performance ?? null, desktop: d?.desktop?.scores?.performance ?? null }); })
      .catch(() => { if (!cancelled) setSpeed(null); });
    return () => { cancelled = true; };
  }, [project?.id, project?.domain, refreshNonce]);

  // Deep-link support: `?tab=audit` (e.g. from the Copilot widget) opens that tab.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && tabs.some((x) => x.key === t)) setTab(t as TabKey);
  }, []);

  // Keep the active tab in the URL so a reload (or a shared/bookmarked link)
  // reopens exactly where the user was — without adding history entries.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== tab) {
      url.searchParams.set("tab", tab);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, [tab]);

  // If the page was opened with the raw id (or an old link), swap the address
  // bar to the readable slug without a reload.
  useEffect(() => {
    if (project && params.id !== project.slug) {
      // Preserve the current query (e.g. ?tab=) through the id→slug address swap.
      router.replace(`/dashboard/projects/${project.slug}${window.location.search}`);
    }
  }, [project, params.id, router]);

  if (loading) {
    return <ProjectSkeleton />;
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="font-heading text-xl font-semibold">Project not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been removed, or the link is wrong.
        </p>
        <Link href="/dashboard/projects/new" className={cn(buttonVariants(), "mt-4")}>
          <Plus className="h-4 w-4" />
          Create a project
        </Link>
      </div>
    );
  }

  // Send fresh=1 to the server; the server's claimDailyRefresh decides whether
  // to make a real paid API call or serve the existing cache. Safe to call from
  // any user or browser — the one-per-day quota is enforced server-side in the DB.
  function onRefresh() {
    setRefreshNonce((n) => n + 1);
  }

  // Copilot action chips: jump to the right tab or open a page.
  function handleCopilotAction(a: CopilotAction) {
    if (a.type === "link" && a.url) {
      window.open(a.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (a.type === "track") {
      setTab("keywords");
      return;
    }
    if (a.type === "open" && a.tab && tabs.some((t) => t.key === a.tab)) {
      setTab(a.tab as TabKey);
    }
  }

  // One tab pill — shared by plain and grouped (segmented) renderings.
  function renderTab(t: TabDef) {
    const Icon = t.icon;
    const isActive = t.key === tab;
    const locked = isTabLocked(t.key);
    return (
      <button
        key={t.key}
        onClick={() => setTab(t.key)}
        title={locked ? `${t.label} — upgrade to unlock` : t.label}
        className={cn(
          "group relative flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-[13px] transition-colors duration-200 sm:px-3 lg:text-sm",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
            // Active → white on the filled pill. Inactive brand tabs use their real
            // logo colour (inline style); the rest use their accent tint.
            isActive ? "text-primary-foreground" : t.brand ? "" : TAB_ACCENT[t.key],
          )}
          style={!isActive && t.brand ? { color: t.brand } : undefined}
        />
        <span className={cn(isActive && "font-semibold", locked && "opacity-70")}>{t.label}</span>
        {locked && <LockPip className={isActive ? "text-primary-foreground" : undefined} />}
      </button>
    );
  }

  // Tabs shown in the main bar (Copilot + Settings are separate side actions).
  const barTabs = visibleTabs.filter((t) => t.key !== "copilot" && t.key !== "settings");

  return (
    <div className="space-y-3" style={{ zoom: 0.9 }}>
      {/* Project header */}
      <Card className="bg-card shadow-soft">
        <CardContent className="p-4 lg:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 lg:gap-4">
            <Favicon domain={project.domain} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 lg:gap-2.5">
                <h2 className="truncate font-heading text-lg font-semibold lg:text-2xl">{project.name}</h2>
                <Badge variant="primary">{latestCrawl?.status === "RUNNING" || latestCrawl?.status === "QUEUED" ? "Crawling…" : "Ready to crawl"}</Badge>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm lg:mt-1.5 lg:gap-2.5 lg:text-base">
                <a
                  href={`https://${project.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 font-medium text-primary hover:underline"
                >
                  <span className="truncate">{project.domain}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" />
                </a>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground lg:px-2.5 lg:py-1 lg:text-[13px]">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full lg:h-2 lg:w-2",
                      latestCrawl?.status === "COMPLETED" ? "bg-chart-2" : "bg-chart-3",
                    )}
                  />
                  {latestCrawl?.status === "COMPLETED" && latestCrawl.finishedAt
                    ? `Crawled ${new Date(latestCrawl.finishedAt).toLocaleDateString()}`
                    : latestCrawl?.status === "RUNNING" || latestCrawl?.status === "QUEUED"
                      ? "Crawl in progress"
                      : "Not crawled yet"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Campaign team + clients — assign / remove right here */}
            <CampaignMembers
              projectId={project.id}
              canManageMembers={can("team.manage")}
              canManageClients={can("clients.assign_campaigns")}
            />

            {/* Reporting window — presets + custom date range; drives the KPIs & Overview. */}
            <PeriodFilter period={period} onChange={setPeriod} />

            {/* Client-portal users (agency client + their team members) get a
                read-only view — no manual data refresh. */}
            {user?.role !== "CLIENT" && (
              <Button variant="outline" size="icon" title="Refresh data" onClick={onRefresh} className="h-10 w-10 lg:h-11 lg:w-11">
                <RefreshCw className="h-4 w-4 lg:h-[18px] lg:w-[18px]" />
              </Button>
            )}
            <Button className="h-10 gap-2 px-4 text-sm lg:h-11 lg:px-5 lg:text-[15px]" onClick={() => { setPendingAudit(true); setTab("audit"); }}>
              <FileSearch className="h-4 w-4 lg:h-[18px] lg:w-[18px]" />
              Run audit
            </Button>
          </div>
          </div>
          {/* At-a-glance KPI strip — the numbers users check first, clearly labelled. */}
          <HeaderKpiStrip
            stats={stats}
            health={latestCrawl?.healthScore ?? null}
            issues={latestCrawl?.healthScore != null ? (latestCrawl.errors ?? 0) + (latestCrawl.warnings ?? 0) + (latestCrawl.notices ?? 0) : null}
            speed={speed}
            loading={statsLoading}
          />
        </CardContent>
      </Card>

      {/* Tabs — a wrapping chip bar so EVERY section stays visible and tappable at
          any width (no hidden horizontal scroll). Copilot + campaign actions sit
          to the side (below the bar on small screens). */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-soft">
          {barTabs.map((t) => renderTab(t))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 self-end lg:self-auto">
          {/* Settings gear → campaign options dropdown (report / edit / share / delete) */}
          <ProjectActionsMenu
            project={project}
            canReport={can("reports.generate")}
            canEdit={visibleTabs.some((t) => t.key === "settings")}
            canDelete={can("projects.delete")}
            onEdit={() => setTab("settings")}
          />

          {/* Circular AI accent action */}
          {visibleTabs.some((t) => t.key === "copilot") && (
            <button
              onClick={() => setTab("copilot")}
              title="Ask AI Copilot"
              aria-label="Ask AI Copilot"
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-glow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow-lg",
                tab === "copilot" && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
              )}
            >
              <Sparkles className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </div>

      {/* Active panel — a plan-locked feature shows the upgrade wall instead. */}
      {isTabLocked(tab) && (
        <LockedFeature title={tabs.find((t) => t.key === tab)?.label ?? "This feature"} canUpgrade={canUpgrade} />
      )}
      {!isTabLocked(tab) && (
      <>
      {tab === "overview" && (
        <OverviewPanel
          project={project}
          refreshNonce={refreshNonce}
          days={"days" in period ? period.days : 28}
          range={"from" in period ? period : undefined}
        />
      )}
      {tab === "copilot" && <CopilotPanel project={project} onAction={handleCopilotAction} />}
      {tab === "keywords" && <SerpExplorer project={project} />}
      {tab === "content" && <ContentPanel project={project} />}
      {tab === "ranks" && (
        <div className="space-y-5">
          {/* Explainer: the Ranks tab shows three different ranking sources, so
              positions can differ (e.g. live Tracked vs the database snapshot).
              This strip makes each source — and why they differ — obvious. */}
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <LineChart className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-heading text-base font-semibold leading-tight">Rankings</h3>
                <p className="text-xs text-muted-foreground">Three views of where you rank on Google — each from a different source, so positions can differ.</p>
              </div>
            </div>
            <div className="mt-4 grid auto-rows-fr gap-2.5 sm:grid-cols-3">
              {[
                { icon: Activity, cls: "bg-chart-2/12 text-chart-2", title: "1 · Tracked", desc: "Your chosen keywords, checked live on Google every day. Most accurate — today's real position." },
                { icon: Globe, cls: "bg-chart-4/12 text-chart-4", title: "2 · All ranked", desc: "Every keyword the domain ranks for, from a database snapshot. Broad view, but can be weeks old." },
                { icon: SiGooglesearchconsole, cls: "bg-chart-1/12 text-chart-1", title: "3 · Search Console", desc: "Real positions from Google Search Console — where you actually earned clicks & impressions." },
              ].map((s) => (
                <div key={s.title} className="rounded-lg border border-border bg-background/50 p-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md", s.cls)}>
                      <s.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm font-semibold">{s.title}</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* The two keyword lists side by side so the same keyword's live vs
              database position can be compared at a glance; Search Console (a
              traffic chart, not a keyword list) sits full-width below. */}
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <TrackedKeywords project={project} />
            <RankedKeywords project={project} refreshNonce={refreshNonce} refreshMode={refreshMode} />
          </div>
          <GscRankTracker project={project} refreshNonce={refreshNonce} />
        </div>
      )}
      {tab === "competitors" && <CompetitorsPanel project={project} refreshNonce={refreshNonce} refreshMode={refreshMode} />}
      {tab === "traffic" && <GaTraffic project={project} refreshNonce={refreshNonce} />}
      {tab === "backlinks" && <BacklinksPanel project={project} refreshNonce={refreshNonce} refreshMode={refreshMode} />}
      {tab === "domain" && <DomainPanel project={project} refreshNonce={refreshNonce} refreshMode={refreshMode} />}
      {tab === "ai" && <AiVisibilityPanel project={project} />}
      {tab === "audit" && <SiteAudit project={project} autoStart={pendingAudit} onAutoStarted={() => setPendingAudit(false)} />}
      {tab === "settings" && <SettingsPanel project={project} />}
      </>
      )}
    </div>
  );
}
