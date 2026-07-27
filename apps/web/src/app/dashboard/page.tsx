"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FolderPlus, ArrowUpRight, Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteFavicon } from "@/components/ui/site-favicon";
import { UserAvatar } from "@/components/ui/user-avatar";
import { TrendChart, Sparkline } from "@/components/ui/charts";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useCurrentUser, displayName, useCan } from "@/components/providers/user-provider";
import { useProjects } from "@/components/providers/projects-provider";
import { CampaignsTable, type CampaignRow } from "./campaigns-table";
import { GroupedCampaigns, type GroupBy } from "./grouped-campaigns";

interface ClientInfo { id: string; name: string; type: string; branding?: any; projectIds: string[] }
interface TrendPoint { date: string; clicks: number; impressions: number; sessions: number }
interface OrgStats { clients: number; agencyClients: number; teamMembers: number }
interface Summary { role: string; isAgency: boolean; org?: OrgStats | null; projects: Omit<CampaignRow, "slug">[]; trend?: TrendPoint[]; clients: ClientInfo[] }

const fmtDay = (d: string) => { const [, m, day] = d.split("-"); const mo = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m)] ?? ""; return `${mo} ${Number(day)}`; };

function greetingFor(h: number) { return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Working late"; }
const PERIODS = [
  { value: "7", label: "Last 7 days" },
  { value: "28", label: "Last 28 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
];
const METRICS = [
  { key: "clicks", label: "Clicks", color: "chart-1", perm: "overview.view" },
  { key: "impressions", label: "Impressions", color: "chart-4", perm: "overview.view" },
  { key: "sessions", label: "Sessions", color: "chart-2", perm: "traffic.view" },
] as const;

const nf = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
};

// Count-up so big numbers animate in (subtle, ease-out cubic).
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    let start: number | null = null;
    const tick = (t: number) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, ms]);
  return v;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const can = useCan();
  const { projects: provided, loading: projectsLoading } = useProjects();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("clicks");
  const [selected, setSelected] = useState("all");
  const [period, setPeriod] = useState("28");
  const [greeting, setGreeting] = useState("Welcome back");
  const [quote, setQuote] = useState<string | null>(null);
  const name = user ? displayName(user).split(" ")[0] : null;

  // Time-of-day greeting + AI motivational line (both client-side to avoid SSR mismatch).
  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
    api.get<{ quote: string }>("/dashboard/quote").then((r) => setQuote(r.quote)).catch(() => {});
  }, []);

  useEffect(() => { if (user?.role === "SUPER_ADMIN") router.replace("/dashboard/admin"); }, [user?.role, router]);
  useEffect(() => {
    if (user?.role === "SUPER_ADMIN") return;
    setLoading(true);
    api.get<Summary>(`/dashboard/summary?days=${period}`)
      .then((s) => { setSummary(s); setGroupBy((g) => (g === "none" && s.isAgency ? "client" : g)); })
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [user?.role, period]);

  const slugById = useMemo(() => new Map(provided.map((p) => [p.id, p.slug])), [provided]);
  const rows: CampaignRow[] = useMemo(() => (summary?.projects ?? []).map((p) => ({ ...p, slug: slugById.get(p.id) ?? p.id })), [summary, slugById]);

  // Campaign filter — "all" or a single campaign. Everything below reads viewRows.
  const isSingle = selected !== "all" && rows.some((r) => r.id === selected);
  const viewRows = useMemo(() => (isSingle ? rows.filter((r) => r.id === selected) : rows), [rows, selected, isSingle]);
  const campaignOptions = useMemo(() => [
    { value: "all", label: "All campaigns" },
    ...rows.map((r) => ({ value: r.id, label: r.name, hint: r.domain, icon: <SiteFavicon domain={r.domain} className="h-5 w-5" iconClassName="h-3 w-3" /> })),
  ], [rows]);

  const kpis = useMemo(() => {
    const healths = viewRows.map((r) => r.metrics.audit?.healthScore).filter((h): h is number => h != null);
    const sum = (fn: (r: CampaignRow) => number | undefined) => viewRows.reduce((a, r) => a + (fn(r) ?? 0), 0);
    return {
      campaigns: viewRows.length,
      avgHealth: healths.length ? Math.round(healths.reduce((a, b) => a + b, 0) / healths.length) : null,
      gscClicks: sum((r) => (r.metrics.gsc?.loaded ? r.metrics.gsc.clicks : 0)),
      impressions: sum((r) => (r.metrics.gsc?.loaded ? r.metrics.gsc.impressions : 0)),
      sessions: sum((r) => (r.metrics.ga?.loaded ? r.metrics.ga.sessions : 0)),
      tracked: sum((r) => r.metrics.rankTracker?.trackedCount),
      backlinks: sum((r) => (r.metrics.backlinks?.loaded ? r.metrics.backlinks.backlinks : 0)),
    };
  }, [viewRows]);

  const bands = useMemo(() => {
    let good = 0, ok = 0, poor = 0, none = 0;
    for (const r of viewRows) { const h = r.metrics.audit?.healthScore; if (h == null) none++; else if (h >= 80) good++; else if (h >= 50) ok++; else poor++; }
    return [
      { key: "good", label: "Good", sub: "80+", value: good, color: "chart-2" },
      { key: "ok", label: "Needs work", sub: "50–79", value: ok, color: "chart-3" },
      { key: "poor", label: "Poor", sub: "<50", value: poor, color: "destructive" },
      { key: "none", label: "No audit", sub: "—", value: none, color: "muted-foreground" },
    ];
  }, [viewRows]);

  const topByClicks = useMemo(() => viewRows.filter((r) => r.metrics.gsc?.loaded && (r.metrics.gsc.clicks ?? 0) > 0)
    .map((r) => ({ name: r.name, domain: r.domain, slug: r.slug, clicks: r.metrics.gsc?.clicks ?? 0 }))
    .sort((a, b) => b.clicks - a.clicks).slice(0, 5), [viewRows]);

  const attention = useMemo(() => viewRows.filter((r) => { const a = r.metrics.audit; return !a || a.healthScore == null || a.healthScore < 50 || (a.errors ?? 0) > 0; })
    .map((r) => ({ name: r.name, domain: r.domain, slug: r.slug, audit: r.metrics.audit })).slice(0, 5), [viewRows]);

  const trend = useMemo(() => summary?.trend ?? [], [summary]);
  const hasTrend = trend.length > 1 && trend.some((d) => (d.clicks ?? 0) + (d.impressions ?? 0) + (d.sessions ?? 0) > 0);
  const availMetrics = useMemo(() => METRICS.filter((m) => can(m.perm)), [can]);
  const activeMetric = availMetrics.find((m) => m.key === metric) ?? availMetrics[0];

  // Default the chart to whichever metric actually has the most data, so it never
  // opens on a near-empty series.
  useEffect(() => {
    if (!summary || !availMetrics.length) return;
    const t = summary.trend ?? [];
    const best = availMetrics.map((m) => ({ k: m.key, total: t.reduce((a, d) => a + ((d as any)[m.key] ?? 0), 0) })).sort((a, b) => b.total - a.total)[0];
    if (best && best.total > 0) setMetric(best.k);
  }, [summary, availMetrics]);

  const clientsById = useMemo(() => new Map((summary?.clients ?? []).map((c) => [c.id, { name: c.name, type: c.type }])), [summary]);
  const busy = loading || projectsLoading;

  const org = summary?.org;
  const stats = [
    { label: "Campaigns", value: kpis.campaigns, fmt: (n: number) => String(Math.round(n)), show: true },
    { label: "Clients", value: org?.clients ?? 0, fmt: (n: number) => String(Math.round(n)), show: !!org, hint: org?.agencyClients ? `${org.agencyClients} agency` : undefined },
    { label: "Team members", value: org?.teamMembers ?? 0, fmt: (n: number) => String(Math.round(n)), show: !!org },
    { label: "Avg health", value: kpis.avgHealth ?? 0, fmt: (n: number) => (kpis.avgHealth == null ? "—" : String(Math.round(n))), show: can("audit.view"), accent: kpis.avgHealth == null ? undefined : kpis.avgHealth >= 80 ? "chart-2" : kpis.avgHealth >= 50 ? "chart-3" : "destructive" },
    { label: "Search clicks", value: kpis.gscClicks, fmt: nf, show: can("overview.view"), spark: "clicks", color: "chart-1" },
    { label: "Impressions", value: kpis.impressions, fmt: nf, show: can("overview.view"), spark: "impressions", color: "chart-4" },
    { label: "Sessions", value: kpis.sessions, fmt: nf, show: can("traffic.view"), spark: "sessions", color: "chart-2" },
    { label: "Tracked KW", value: kpis.tracked, fmt: nf, show: can("ranks.view") },
    { label: "Backlinks", value: kpis.backlinks, fmt: (n: number) => (kpis.backlinks > 0 ? nf(n) : "—"), show: can("backlinks.view") },
  ].filter((s) => s.show);

  return (
    <div className="space-y-3">
      {/* Welcome bar (relative z-20: keeps the campaign dropdown above the stat rail) */}
      <div className="fade-up relative z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-3.5">
          <UserAvatar src={user?.avatarUrl} className="h-12 w-12 shrink-0" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Overview</div>
            {userLoading ? <Skeleton className="mt-1 h-6 w-56" /> : (
              <h1 className="font-heading text-xl font-semibold tracking-tight">{greeting}{name ? `, ${name}` : ""}</h1>
            )}
            <p className="mt-0.5 max-w-xl text-sm italic text-muted-foreground">
              {quote ? `“${quote}”` : "Every campaign and its live SEO health."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rows.length > 0 && (
            <Combobox value={selected} onChange={setSelected} options={campaignOptions} placeholder="All campaigns" searchPlaceholder="Search campaign…" align="end" className="w-52" />
          )}
          <Combobox value={period} onChange={setPeriod} options={PERIODS} align="end" className="w-40" />

          {can("projects.create") && (
            <Link href="/dashboard/projects/new" className={cn(buttonVariants(), "gap-2")}><Plus className="h-4 w-4" /> New project</Link>
          )}
        </div>
      </div>

      {busy ? <DashboardSkeleton /> : rows.length === 0 ? <EmptyState canCreate={can("projects.create")} /> : (
        <>
          {/* Stat rail — hairline-separated cells, big tabular numbers, auto-fit */}
          <div className="fade-up grid gap-px overflow-hidden rounded-xl border border-border bg-border" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} fmt={s.fmt} accent={(s as any).accent} spark={(s as any).spark} color={(s as any).color} hint={(s as any).hint} trend={hasTrend ? trend : undefined} />)}
          </div>

          {/* Performance trend (portfolio-wide — hidden when a single campaign is picked) */}
          {activeMetric && hasTrend && !isSingle && (
            <div className="fade-up rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Performance · last {period} days</h3>
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  {availMetrics.map((m) => (
                    <button key={m.key} onClick={() => setMetric(m.key)} className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", activeMetric.key === m.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>{m.label}</button>
                  ))}
                </div>
              </div>
              <div className="px-2 py-2">
                <TrendChart
                  data={trend}
                  xKey="date"
                  height={210}
                  series={[{ key: activeMetric.key, name: activeMetric.label, color: activeMetric.color }]}
                  xTickFormatter={fmtDay}
                  labelFormatter={fmtDay}
                  valueFormatter={(v) => nf(v)}
                />
              </div>
            </div>
          )}

          {/* Insight panels */}
          <div className="grid gap-3 lg:grid-cols-3">
            {can("audit.view") && (
              <Panel title="Audit health">
                <div className="flex items-center gap-5">
                  <HealthRing bands={bands} total={kpis.campaigns} avg={kpis.avgHealth} />
                  <div className="flex-1 space-y-2.5">
                    {bands.map((b) => (
                      <div key={b.key} className="flex items-center gap-2.5 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ background: `hsl(var(--${b.color}))` }} />
                        <span className="flex-1 text-muted-foreground">{b.label} <span className="text-xs text-muted-foreground/60">{b.sub}</span></span>
                        <span className="font-semibold tabular-nums">{b.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            )}

            {can("overview.view") && (
              <Panel title="Top campaigns" hint={`clicks · ${period}d`}>
                {topByClicks.length ? (
                  <div className="space-y-3">
                    {topByClicks.map((t) => {
                      const maxc = topByClicks[0].clicks || 1;
                      return (
                        <Link key={t.slug} href={`/dashboard/projects/${t.slug}`} className="group block">
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="truncate font-medium group-hover:text-primary">{t.name}</span>
                            <span className="tabular-nums text-muted-foreground">{nf(t.clicks)}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                            <div className="bar-grow h-full rounded-full" style={{ width: `${Math.max(4, (t.clicks / maxc) * 100)}%`, background: "hsl(var(--primary))" }} />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : <EmptyHint text="Connect Search Console to rank click leaders." />}
              </Panel>
            )}

            {can("audit.view") && (
              <Panel title="Needs attention">
                {attention.length ? (
                  <div className="-mx-1.5 space-y-0.5">
                    {attention.map((a) => (
                      <Link key={a.slug} href={`/dashboard/projects/${a.slug}`} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-secondary/60">
                        <SiteFavicon domain={a.domain} className="h-7 w-7" iconClassName="h-3.5 w-3.5" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{a.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{!a.audit || a.audit.healthScore == null ? "No audit yet" : `Health ${a.audit.healthScore} · ${a.audit.errors} errors`}</div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    ))}
                  </div>
                ) : <EmptyHint text="Every campaign is in good shape." />}
              </Panel>
            )}
          </div>

          {/* Campaigns */}
          <div className="fade-up space-y-3" style={{ animationDelay: "80ms" }}>
            {groupBy === "none" ? (
              <CampaignsTable
                rows={viewRows}
                clientsById={clientsById}
                showClient={summary?.isAgency ?? false}
                days={Number(period)}
                title="Campaigns"
                extra={<GroupByPicker value={groupBy} onChange={setGroupBy} hasClients={(summary?.clients.length ?? 0) > 0} />}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <h2 className="font-heading text-lg font-semibold">Campaigns</h2>
                    <span className="text-sm text-muted-foreground">{viewRows.length}</span>
                  </div>
                  <GroupByPicker value={groupBy} onChange={setGroupBy} hasClients={(summary?.clients.length ?? 0) > 0} />
                </div>
                <GroupedCampaigns groupBy={groupBy} rows={viewRows} clients={summary?.clients ?? []} clientsById={clientsById} showClient={summary?.isAgency ?? false} days={Number(period)} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, fmt, accent, spark, color, trend, hint }: { label: string; value: number; fmt: (n: number) => string; accent?: string; spark?: string; color?: string; trend?: any[]; hint?: string }) {
  const v = useCountUp(value);
  const showSpark = spark && trend && trend.length > 1;
  return (
    <div className="relative bg-card px-3.5 py-3">
      {accent && <span className="absolute left-0 top-3 h-5 w-0.5 rounded-full" style={{ background: `hsl(var(--${accent}))` }} />}
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-[23px] font-semibold leading-none tracking-tight tabular-nums">{fmt(v)}</div>
      {showSpark ? <div className="mt-1.5 h-6"><Sparkline data={trend!} dataKey={spark!} color={color ?? "chart-1"} height={24} /></div>
        : hint ? <div className="mt-1.5 flex h-6 items-center text-xs text-muted-foreground/70">{hint}</div>
        : <div className="mt-1.5 h-6" />}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="fade-up rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
}

function HealthRing({ bands, total, avg }: { bands: { value: number; color: string }[]; total: number; avg: number | null }) {
  const r = 48, C = 2 * Math.PI * r;
  let acc = 0;
  const segs = bands.filter((b) => b.value > 0).map((b, i) => {
    const len = (b.value / Math.max(1, total)) * C;
    const el = <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={`hsl(var(--${b.color}))`} strokeWidth="8" strokeDasharray={`${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`} strokeDashoffset={-acc} strokeLinecap="round" />;
    acc += len;
    return el;
  });
  return (
    <div className="relative grid h-28 w-28 shrink-0 place-items-center">
      <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
        {segs}
      </svg>
      <div className="absolute text-center">
        <div className="text-[25px] font-semibold leading-none tabular-nums">{avg ?? "—"}</div>
        <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">avg health</div>
      </div>
    </div>
  );
}

function GroupByPicker({ value, onChange, hasClients }: { value: GroupBy; onChange: (v: GroupBy) => void; hasClients: boolean }) {
  void hasClients;
  const options = [
    { value: "none", label: "No grouping" },
    { value: "client", label: "Group by client" },
    { value: "member", label: "Group by team member" },
    { value: "health", label: "Group by health" },
  ];
  return (
    <Combobox
      value={value}
      onChange={(v) => onChange(v as GroupBy)}
      options={options}
      align="end"
      className="w-52"
      icon={<Layers className="h-4 w-4 text-muted-foreground" />}
    />
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="grid place-items-center py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid gap-3 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}</div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

function EmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground"><FolderPlus className="h-7 w-7" /></span>
        <div className="space-y-1">
          <h3 className="font-heading text-base font-semibold">No campaigns yet</h3>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{canCreate ? "Add a website to start tracking keywords, rankings, backlinks, traffic and site health." : "You haven't been given access to any campaigns yet. Ask your admin to assign one."}</p>
        </div>
        {canCreate && <Link href="/dashboard/projects/new" className={cn(buttonVariants(), "mt-1 gap-2")}><Plus className="h-4 w-4" /> New project</Link>}
      </CardContent>
    </Card>
  );
}
