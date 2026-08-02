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
type LatestCrawl = { status: "QUEUED" | "RUNNING" | "COMPLETED"; finishedAt: string | null } | null;

// Tabs are clustered into channel-style groups (like the competitor's grouped
// Google/AI/Bing toggle). Multi-item groups render as a nested segmented pill;
// single-item groups render as a plain pill. Copilot + Settings are pulled out
// as their own round accent buttons beside the bar.
const TAB_GROUPS: { id: string; keys: TabKey[] }[] = [
  { id: "start", keys: ["overview"] },
  { id: "research", keys: ["keywords", "content", "ranks", "competitors"] },
  { id: "insights", keys: ["traffic", "backlinks", "domain", "ai"] },
  { id: "tech", keys: ["audit"] },
];

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
  const [tab, setTab] = useState<TabKey>("overview");
  const [refreshNonce, setRefreshNonce] = useState(0);
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
  useEffect(() => {
    if (visibleTabs.length && !tabAllowed) setTab(visibleTabs[0].key);
  }, [tabAllowed, visibleTabs]);

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

  // Deep-link support: `?tab=audit` (e.g. from the Copilot widget) opens that tab.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && tabs.some((x) => x.key === t)) setTab(t as TabKey);
  }, []);

  // If the page was opened with the raw id (or an old link), swap the address
  // bar to the readable slug without a reload.
  useEffect(() => {
    if (project && params.id !== project.slug) {
      router.replace(`/dashboard/projects/${project.slug}`);
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

  // Force a live re-fetch of the active tab (bypasses the server cache via ?fresh=1).
  // No spinner — panels swap to structured skeletons while the fresh data loads.
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
          "group relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-[13px] transition-all duration-200 lg:px-3.5 lg:py-2.5 lg:text-[14px] xl:px-4 xl:py-3 xl:text-[15px]",
          isActive
            ? "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-glow"
            : "font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-all duration-200 group-hover:scale-110 xl:h-[18px] xl:w-[18px]",
            // Active → white on the gradient pill. Inactive brand tabs use their
            // real logo colour (inline style); the rest use their accent tint.
            isActive ? "text-primary-foreground" : t.brand ? "opacity-95 group-hover:opacity-100" : cn(TAB_ACCENT[t.key], "opacity-90 group-hover:opacity-100"),
          )}
          style={!isActive && t.brand ? { color: t.brand } : undefined}
        />
        <span className={cn(isActive && "font-semibold", locked && "opacity-70")}>{t.label}</span>
        {locked && <LockPip className={isActive ? "text-primary-foreground" : undefined} />}
      </button>
    );
  }

  // Resolve the group clusters to only the tabs actually visible right now.
  const renderedGroups = TAB_GROUPS.map((g) => ({
    id: g.id,
    seg: g.keys.length > 1,
    tabs: g.keys.map((k) => visibleTabs.find((t) => t.key === k)).filter(Boolean) as TabDef[],
  })).filter((g) => g.tabs.length > 0);

  return (
    <div className="space-y-3" style={{ zoom: 0.9 }}>
      {/* Project header */}
      <Card className="bg-card shadow-soft">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
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

            {/* Client-portal users (agency client + their team members) get a
                read-only view — no manual data refresh. */}
            {user?.role !== "CLIENT" && (
              <Button variant="outline" size="icon" title="Refresh data" onClick={onRefresh} className="h-10 w-10 lg:h-11 lg:w-11">
                <RefreshCw className="h-4 w-4 lg:h-[18px] lg:w-[18px]" />
              </Button>
            )}
            <Button className="h-10 gap-2 px-4 text-sm lg:h-11 lg:px-5 lg:text-[15px]" onClick={() => setTab("audit")}>
              <FileSearch className="h-4 w-4 lg:h-[18px] lg:w-[18px]" />
              Run audit
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs — premium channel-style bar with grouped segments (scrolls if narrow) */}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto rounded-full border border-border bg-card p-1.5 shadow-soft [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:p-2 xl:justify-between">
          {renderedGroups.map((g, gi) => (
            <div key={g.id} className="flex shrink-0 items-center gap-1">
              {gi > 0 && <span aria-hidden className="h-5 w-px shrink-0 bg-border" />}
              {g.seg ? (
                <div className="flex shrink-0 items-center gap-0.5 rounded-full p-0.5 ring-1 ring-inset ring-border">
                  {g.tabs.map((t) => renderTab(t))}
                </div>
              ) : (
                g.tabs.map((t) => renderTab(t))
              )}
            </div>
          ))}
        </div>

        {/* Settings gear → campaign options dropdown (report / edit / share / delete) */}
        <ProjectActionsMenu
          project={project}
          canReport={can("reports.generate")}
          canEdit={visibleTabs.some((t) => t.key === "settings")}
          canDelete={can("projects.delete")}
          onEdit={() => setTab("settings")}
        />

        {/* Circular AI accent action — mirrors the competitor's standout round button */}
        {visibleTabs.some((t) => t.key === "copilot") && (
          <button
            onClick={() => setTab("copilot")}
            title="Ask AI Copilot"
            aria-label="Ask AI Copilot"
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-glow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow-lg",
              tab === "copilot" && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
            )}
          >
            <Sparkles className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      {/* Active panel — a plan-locked feature shows the upgrade wall instead. */}
      {isTabLocked(tab) && (
        <LockedFeature title={tabs.find((t) => t.key === tab)?.label ?? "This feature"} canUpgrade={canUpgrade} />
      )}
      {!isTabLocked(tab) && (
      <>
      {tab === "overview" && <OverviewPanel project={project} refreshNonce={refreshNonce} />}
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
            <RankedKeywords project={project} refreshNonce={refreshNonce} />
          </div>
          <GscRankTracker project={project} refreshNonce={refreshNonce} />
        </div>
      )}
      {tab === "competitors" && <CompetitorsPanel project={project} refreshNonce={refreshNonce} />}
      {tab === "traffic" && <GaTraffic project={project} refreshNonce={refreshNonce} />}
      {tab === "backlinks" && <BacklinksPanel project={project} refreshNonce={refreshNonce} />}
      {tab === "domain" && <DomainPanel project={project} refreshNonce={refreshNonce} />}
      {tab === "ai" && <AiVisibilityPanel project={project} />}
      {tab === "audit" && <SiteAudit project={project} />}
      {tab === "settings" && <SettingsPanel project={project} />}
      </>
      )}
    </div>
  );
}
