"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { OverviewSkeleton } from "@/components/ui/panel-skeletons";
import { CampaignMembers } from "./campaign-members";
import { ContentPanel } from "./content-panel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useCurrentUser, useCan } from "@/components/providers/user-provider";
import { useProjects } from "@/components/providers/projects-provider";
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

type TabKey = "overview" | "copilot" | "keywords" | "content" | "ranks" | "competitors" | "traffic" | "backlinks" | "domain" | "ai" | "audit" | "settings";

// Each tab declares the permission needed to see it (undefined = always visible).
const tabs: { key: TabKey; label: string; icon: LucideIcon; perm?: string }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid, perm: "overview.view" },
  { key: "copilot", label: "AI Copilot", icon: Bot, perm: "copilot.view" },
  { key: "keywords", label: "Keywords", icon: Search, perm: "keywords.research" },
  { key: "content", label: "Content", icon: PenLine, perm: "keywords.research" },
  { key: "ranks", label: "Ranks", icon: LineChart, perm: "ranks.view" },
  { key: "competitors", label: "Competitors", icon: Swords, perm: "competitors.view" },
  { key: "traffic", label: "Traffic", icon: Activity, perm: "traffic.view" },
  { key: "backlinks", label: "Backlinks", icon: Link2, perm: "backlinks.view" },
  { key: "domain", label: "Domain", icon: Server, perm: "domain.view" },
  { key: "ai", label: "AI Visibility", icon: Sparkles, perm: "ai.view" },
  { key: "audit", label: "Audit", icon: FileSearch, perm: "audit.view" },
  { key: "settings", label: "Settings", icon: Settings, perm: "settings.manage" },
];

// Site logo from the domain's favicon, with a globe fallback.
function Favicon({ domain }: { domain: string }) {
  const [err, setErr] = useState(false);
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card">
      {err ? (
        <Globe className="h-5 w-5 text-muted-foreground" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          className="h-6 w-6"
          onError={() => setErr(true)}
        />
      )}
    </span>
  );
}

// Loading placeholder that mirrors the real project layout.
function ProjectSkeleton() {
  return (
    // Match the real workspace scale (zoom 0.9) so swapping skeleton -> content
    // doesn't resize/shift the whole page.
    <div className="space-y-3" style={{ zoom: 0.9 }}>
      {/* header */}
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </CardContent>
      </Card>

      {/* tabs */}
      <Skeleton className="h-11 w-full rounded-xl" />

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
  const [tab, setTab] = useState<TabKey>("overview");
  const [refreshNonce, setRefreshNonce] = useState(0);
  // Super admins manage the platform, not campaigns — send them to the admin panel.
  useEffect(() => {
    if (user?.role === "SUPER_ADMIN") router.replace("/dashboard/admin");
  }, [user?.role, router]);
  const visibleTabs = tabs.filter((t) => !t.perm || can(t.perm));
  const tabAllowed = visibleTabs.some((t) => t.key === tab);
  useEffect(() => {
    if (visibleTabs.length && !tabAllowed) setTab(visibleTabs[0].key);
  }, [tabAllowed, visibleTabs]);

  const project = getProject(params.id);

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

  return (
    <div className="space-y-3" style={{ zoom: 0.9 }}>
      {/* Project header */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Favicon domain={project.domain} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate font-heading text-lg font-semibold">{project.name}</h2>
                <Badge variant="primary">Ready to crawl</Badge>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <a
                  href={`https://${project.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate hover:text-foreground"
                >
                  {project.domain}
                </a>
                <span aria-hidden>·</span>
                <span className="whitespace-nowrap">Not crawled yet</span>
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

            <Button variant="outline" size="icon" title="Refresh data" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button className="gap-2" onClick={() => setTab("audit")}>
              <FileSearch className="h-4 w-4" />
              Run audit
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs — premium navigation, single row (scrolls only if the viewport is too narrow) */}
      <div>
        <div className="flex flex-nowrap items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            const isActive = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "group relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span className={cn(isActive && "font-semibold")}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active panel */}
      {tab === "overview" && <OverviewPanel project={project} refreshNonce={refreshNonce} />}
      {tab === "copilot" && <CopilotPanel project={project} onAction={handleCopilotAction} />}
      {tab === "keywords" && <SerpExplorer project={project} />}
      {tab === "content" && <ContentPanel project={project} />}
      {tab === "ranks" && (
        <div className="space-y-4">
          <TrackedKeywords project={project} />
          <GscRankTracker project={project} refreshNonce={refreshNonce} />
          <RankedKeywords project={project} refreshNonce={refreshNonce} />
        </div>
      )}
      {tab === "competitors" && <CompetitorsPanel project={project} refreshNonce={refreshNonce} />}
      {tab === "traffic" && <GaTraffic project={project} refreshNonce={refreshNonce} />}
      {tab === "backlinks" && <BacklinksPanel project={project} refreshNonce={refreshNonce} />}
      {tab === "domain" && <DomainPanel project={project} refreshNonce={refreshNonce} />}
      {tab === "ai" && <AiVisibilityPanel project={project} />}
      {tab === "audit" && <SiteAudit project={project} />}
      {tab === "settings" && <SettingsPanel project={project} />}
    </div>
  );
}
