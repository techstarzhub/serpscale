"use client";

import { useEffect, useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import { useParams } from "next/navigation";
import { SiGoogleanalytics, SiGooglesearchconsole } from "react-icons/si";
import { Globe, Lock, ExternalLink, LayoutGrid, Link2, Swords, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { OverviewSkeleton } from "@/components/ui/panel-skeletons";
import type { Project } from "@/components/providers/projects-provider";
import { OverviewPanel, BacklinksPanel } from "@/app/dashboard/projects/[id]/panels";
import { GaTraffic } from "@/app/dashboard/projects/[id]/ga-panel";
import { GscRankTracker } from "@/app/dashboard/projects/[id]/gsc-panel";
import { RankedKeywords } from "@/app/dashboard/projects/[id]/ranked-keywords";
import { TrackedKeywords } from "@/app/dashboard/projects/[id]/tracked-keywords";
import { CompetitorsPanel } from "@/app/dashboard/projects/[id]/dataforseo-panels";

interface PublicInfo {
  name: string;
  domain: string;
  enabledTabs?: string[];
  sharedAt?: string | null;
}

type TabKey = "overview" | "ranks" | "traffic" | "backlinks" | "competitors";
type TabIcon = ComponentType<{ className?: string; style?: CSSProperties }>;

// The read-only client sections the public view supports (data-only, no owner tools).
const NAV: { key: TabKey; label: string; icon: TabIcon; brand?: string; desc: string }[] = [
  { key: "overview", label: "Dashboard", icon: LayoutGrid, desc: "At-a-glance SEO performance" },
  { key: "ranks", label: "Rankings", icon: SiGooglesearchconsole, brand: "#458CF5", desc: "Where you rank on Google" },
  { key: "traffic", label: "Traffic", icon: SiGoogleanalytics, brand: "#E37400", desc: "Website traffic & engagement" },
  { key: "backlinks", label: "Backlinks", icon: Link2, desc: "Your backlink profile & authority" },
  { key: "competitors", label: "Competitors", icon: Swords, desc: "Domains competing for your keywords" },
];

function Favicon({ domain, size = "lg" }: { domain: string; size?: "sm" | "lg" }) {
  const [err, setErr] = useState(false);
  const box = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const img = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  return (
    <span className={cn("grid shrink-0 place-items-center", box)}>
      {err ? (
        <Globe className={cn("text-muted-foreground", img)} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" className={img} onError={() => setErr(true)} />
      )}
    </span>
  );
}

export default function PublicCampaignView() {
  const params = useParams<{ key: string }>();
  const key = params.key;
  const base = `/public/projects/${key}`;
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [tab, setTab] = useState<TabKey>("overview");
  const [days, setDays] = useState(30);
  // Custom from/to range (YYYY-MM-DD). When set, it overrides the day presets.
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .get<PublicInfo>(base)
      .then((d) => alive && (setInfo(d), setStatus("ok")))
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [base]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background lg:flex">
        {/* sidebar shell — mirrors the real sidebar */}
        <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-gradient-to-b from-card to-secondary/25 shadow-[6px_0_32px_-18px_rgba(0,0,0,0.28)] lg:flex">
          <div className="flex items-center gap-3 border-b border-border/70 px-4 py-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28 rounded-full" />
              <Skeleton className="h-2.5 w-20 rounded-full" />
            </div>
          </div>
          <div className="p-3">
            <Skeleton className="mb-3 ml-3 h-2.5 w-10 rounded-full" />
            <div className="space-y-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-11 rounded-xl" style={{ opacity: 1 - i * 0.14 }} />
              ))}
            </div>
          </div>
        </aside>
        {/* main shell — matches the real spacing so nothing jumps on load */}
        <div className="min-w-0 flex-1 space-y-4 px-3 py-4 lg:px-4">
          {/* hero card */}
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-white p-5 shadow-soft sm:p-6">
            <Skeleton className="h-16 w-16 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-56 rounded-md" />
              <Skeleton className="h-3.5 w-32 rounded-full" />
            </div>
          </div>
          {/* section title */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-32 rounded-md" />
              <Skeleton className="h-3 w-44 rounded-full" />
            </div>
          </div>
          <OverviewSkeleton />
        </div>
      </div>
    );
  }

  if (status === "error" || !info) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
            <Lock className="h-7 w-7" />
          </span>
          <h1 className="mt-4 font-heading text-xl font-semibold">Link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">This share link is invalid or has been disabled by its owner.</p>
        </div>
      </div>
    );
  }

  // Only show sections the campaign actually enabled (Dashboard is always on).
  const enabled = info.enabledTabs ?? [];
  const nav = NAV.filter((t) => t.key === "overview" || enabled.length === 0 || enabled.includes(t.key));
  const activeTab = nav.some((t) => t.key === tab) ? tab : "overview";
  const activeLabel = nav.find((t) => t.key === activeTab)?.label ?? "Dashboard";

  const project = {
    id: key,
    name: info.name,
    domain: info.domain,
    enabledTabs: info.enabledTabs ?? [],
    slug: key,
    createdAt: "",
    orgId: null,
    createdById: null,
  } as Project;

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {nav.map((t) => {
        const Icon = t.icon;
        const active = t.key === activeTab;
        return (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              onNavigate?.();
            }}
            className={cn(
              "group relative flex w-full shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
              active
                ? "bg-gradient-to-r from-primary to-primary/85 font-semibold text-primary-foreground shadow-glow"
                : "font-medium text-muted-foreground hover:-translate-y-px hover:bg-secondary hover:text-foreground hover:shadow-soft",
            )}
          >
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors",
                active ? "bg-white/20" : "bg-secondary/70 group-hover:bg-background",
              )}
            >
              <Icon className="h-[17px] w-[17px]" style={!active && t.brand ? { color: t.brand } : undefined} />
            </span>
            {t.label}
          </button>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* ---- Desktop left sidebar (competitor-style) ---- */}
      <aside className="sticky top-0 z-30 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-gradient-to-b from-card to-secondary/25 shadow-[6px_0_32px_-18px_rgba(0,0,0,0.28)] lg:flex">
        <div className="flex items-center gap-3 border-b border-border/70 px-4 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-background shadow-sm">
            <Favicon domain={info.domain} size="sm" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-heading text-[15px] font-bold leading-tight">{info.name}</div>
            <a href={`https://${info.domain}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-xs text-primary hover:underline">
              <span className="truncate">{info.domain}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Menu</p>
          <div className="space-y-1.5">
            <NavList />
          </div>
        </nav>
      </aside>

      {/* ---- Main column ---- */}
      <div className="min-w-0 flex-1">
        {/* Mobile header + horizontal nav */}
        <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Favicon domain={info.domain} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{info.name}</div>
                <div className="truncate text-xs text-muted-foreground">{info.domain}</div>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground">
              <Lock className="h-3 w-3" /> View-only
            </span>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <NavList />
          </div>
        </header>

        <main className="space-y-4 px-3 py-4 lg:px-4">
          {/* Hero header card — big domain + campaign name + date-range filter */}
          <div className="rounded-2xl border border-border bg-white shadow-soft">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-center gap-4">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-border bg-background shadow-sm">
                  <Favicon domain={info.domain} />
                </span>
                <div className="min-w-0">
                  <a
                    href={`https://${info.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 items-center gap-1.5 font-heading text-xl font-bold tracking-tight text-foreground hover:text-primary sm:text-2xl"
                  >
                    <span className="truncate">{info.domain}</span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
                  </a>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{info.name}</p>
                </div>
              </div>
              {/* Global date filter — presets + a custom from/to range */}
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <div className="flex items-center gap-1 rounded-full border border-border bg-secondary/40 p-1">
                  <CalendarDays className="ml-2 h-4 w-4 text-muted-foreground" />
                  {[7, 30, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setRange(null);
                        setShowCustom(false);
                        setDays(d);
                      }}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                        !range && days === d ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {d} days
                    </button>
                  ))}
                  <button
                    onClick={() => setShowCustom((s) => !s)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                      range || showCustom ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Custom
                  </button>
                </div>
                {showCustom && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-soft">
                    <input
                      type="date"
                      value={from}
                      max={to || undefined}
                      onChange={(e) => setFrom(e.target.value)}
                      className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="date"
                      value={to}
                      min={from || undefined}
                      onChange={(e) => setTo(e.target.value)}
                      className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => from && to && setRange({ from, to })}
                      disabled={!from || !to}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section title */}
          {(() => {
            const A = nav.find((t) => t.key === activeTab)!;
            const Icon = A.icon;
            return (
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-soft">
                  <Icon className="h-5 w-5" style={A.brand ? { color: A.brand } : undefined} />
                </span>
                <div>
                  <h2 className="font-heading text-xl font-semibold leading-tight">{activeLabel}</h2>
                  <p className="text-sm text-muted-foreground">{A.desc}</p>
                </div>
              </div>
            );
          })()}

          {activeTab === "overview" && <OverviewPanel project={project} base={base} readOnly days={days} range={range ?? undefined} />}
          {activeTab === "traffic" && <GaTraffic project={project} base={base} readOnly days={days} range={range ?? undefined} />}
          {activeTab === "backlinks" && <BacklinksPanel project={project} base={base} />}
          {activeTab === "competitors" && <CompetitorsPanel project={project} base={base} readOnly />}
          {activeTab === "ranks" && (
            <div className="space-y-4">
              <div className="grid items-stretch gap-4 lg:grid-cols-2">
                <TrackedKeywords project={project} base={base} readOnly />
                <RankedKeywords project={project} base={base} />
              </div>
              <GscRankTracker project={project} base={base} readOnly days={days} range={range ?? undefined} />
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
