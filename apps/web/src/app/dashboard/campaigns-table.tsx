"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, Search, SlidersHorizontal, Check, ChevronRight, Info, X, Layers, Users2, Building2, Plug, Pencil, Trash2, Smartphone, Monitor, TrendingUp, TrendingDown, Minus, Star } from "lucide-react";
import { SiteFavicon } from "@/components/ui/site-favicon";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useCan } from "@/components/providers/user-provider";
import { useProjects } from "@/components/providers/projects-provider";

// ---- Types (mirror GET /dashboard/summary) ----
type Loadable<T> = { loaded: boolean } & Partial<T>;
export interface CampaignRow {
  id: string;
  name: string;
  domain: string;
  slug: string;
  clientIds: string[];
  setup?: { tech: boolean; sitemap: boolean; gsc: boolean; ga: boolean; gmb: boolean } | null;
  members?: { id: string; name: string | null; email: string }[];
  techStack?: string[];
  speed?: { mobile: number | null; desktop: number | null };
  metrics: {
    audit?: { status: string; healthScore: number | null; errors: number; warnings: number; notices: number; finishedAt?: string | null; lcpMs?: number | null; clsScore?: number | null } | null;
    gsc?: Loadable<{ clicks: number; impressions: number; ctr: number; position: number | null }>;
    ga?: Loadable<{ sessions: number; users: number; bounceRate: number | null }>;
    gmb?: Loadable<{ rating: number | null; reviews: number }>;
    rankTracker?: { trackedCount: number; avgPosition: number | null; trend?: number | null };
    backlinks?: Loadable<{ backlinks: number; referringDomains: number; spamScore: number }>;
    rankedKeywords?: Loadable<{ count: number; etv: number; pos_1: number; pos_2_3: number; pos_4_10: number }>;
    competitors?: Loadable<{ count: number }>;
  };
}

// ---- formatting (all colors come from theme tokens elsewhere) ----
const nf = (n: number | null | undefined) => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
};
const pctf = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const posf = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));

// parse the live endpoint responses into the same compact blocks the summary uses
const parseGsc = (r: any): CampaignRow["metrics"]["gsc"] =>
  r?.totals ? { loaded: true, clicks: r.totals.clicks ?? 0, impressions: r.totals.impressions ?? 0, ctr: r.totals.ctr ?? 0, position: r.totals.position ?? null } : { loaded: false };
const parseGa = (r: any): CampaignRow["metrics"]["ga"] =>
  r?.totals ? { loaded: true, sessions: r.totals.sessions ?? 0, users: r.totals.users ?? 0, bounceRate: r.totals.bounceRate ?? null } : { loaded: false };
const parseGmb = (r: any): CampaignRow["metrics"]["gmb"] =>
  r?.matched ? { loaded: true, rating: r.rating ?? null, reviews: r.totalReviews ?? 0 } : { loaded: false };
const parseBacklinks = (r: any): CampaignRow["metrics"]["backlinks"] =>
  r?.summary ? { loaded: true, backlinks: r.summary.backlinks ?? 0, referringDomains: r.summary.referringDomains ?? 0, spamScore: r.summary.spamScore ?? 0 } : { loaded: false };
const parseRanked = (r: any): CampaignRow["metrics"]["rankedKeywords"] =>
  r?.totals ? { loaded: true, count: r.totals.count ?? 0, etv: r.totals.etv ?? 0, pos_1: r.totals.pos_1 ?? 0, pos_2_3: r.totals.pos_2_3 ?? 0, pos_4_10: r.totals.pos_4_10 ?? 0 } : { loaded: false };
const parseCompetitors = (r: any): CampaignRow["metrics"]["competitors"] =>
  r?.overview ? { loaded: true, count: Array.isArray(r.competitors) ? r.competitors.length : 0 } : { loaded: false };
const top10 = (b?: CampaignRow["metrics"]["rankedKeywords"]) => (b?.loaded ? (b.pos_1 ?? 0) + (b.pos_2_3 ?? 0) + (b.pos_4_10 ?? 0) : 0);

async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(size, q.length) }, async () => {
    while (q.length) { const it = q.shift(); if (it !== undefined) await fn(it); }
  }));
}

// Value-proportional bar that sits BEHIND a right-aligned number (heatmap feel).
function Bar({ value, max, color, children }: { value: number; max: number; color: string; children: React.ReactNode }) {
  const w = max > 0 && value > 0 ? Math.max(6, (value / max) * 100) : 0;
  return (
    <div className="relative ml-auto flex h-7 min-w-[96px] items-center justify-end">
      {w > 0 && <div className="bar-grow absolute inset-y-1 right-0 rounded-md" style={{ width: `${w}%`, background: `hsl(var(--${color}) / 0.16)` }} />}
      <span className="relative z-10 pr-1.5 text-sm font-semibold tabular-nums">{children}</span>
    </div>
  );
}

// Right-aligned numeric columns for a clean data-table look.
const RIGHT_ALIGN = new Set(["speedMobile", "speedDesktop", "lcp", "gscClicks", "gscImpr", "gscCtr", "gscPos", "gmb", "sessions", "users", "bounce", "tracked", "rankTrend", "rankedKw", "etv", "backlinks", "refDomains", "spam", "competitors"]);

function HealthCell({ audit }: { audit: CampaignRow["metrics"]["audit"] }) {
  if (audit === undefined) return <span className="text-muted-foreground">—</span>;
  if (!audit || audit.healthScore == null) return <span className="text-xs text-muted-foreground">No audit</span>;
  const v = audit.healthScore;
  const c = v >= 80 ? "chart-2" : v >= 50 ? "chart-3" : "destructive";
  const r = 15, C = 2 * Math.PI * r, off = C * (1 - v / 100);
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-10 w-10 place-items-center">
        <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
          <circle cx="20" cy="20" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
          <circle cx="20" cy="20" r={r} fill="none" stroke={`hsl(var(--${c}))`} strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} className="ring-in" style={{ ["--dash" as any]: `${C}` }} />
        </svg>
        <span className={cn("absolute text-[11px] font-bold tabular-nums", `text-${c}`)}>{v}</span>
      </div>
      <div className="text-[11px] leading-tight text-muted-foreground">
        <div><span className="font-semibold text-destructive">{audit.errors}</span> err</div>
        <div><span className="font-semibold text-chart-3">{audit.warnings}</span> warn</div>
      </div>
    </div>
  );
}

function PosBadge({ p }: { p: number | null | undefined }) {
  if (p == null) return <span className="text-muted-foreground">—</span>;
  const tone = p <= 3 ? "bg-chart-2/15 text-chart-2" : p <= 10 ? "bg-chart-3/15 text-chart-3" : "bg-secondary text-muted-foreground";
  return <span className={cn("inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums", tone)}>{p.toFixed(1)}</span>;
}

// ---- setup status + team/clients/tech popovers ----
function initials(name: string | null, email: string) {
  const s = (name || email || "?").trim();
  const parts = s.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function Avatar({ name, email, ring = true }: { name: string | null; email: string; ring?: boolean }) {
  return (
    <span title={name || email} className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-foreground", ring && "ring-2 ring-card")}>
      {initials(name, email)}
    </span>
  );
}

// One clear line inside the Details popover: green check = in place, grey cross = not.
function StatusLine({ ok, label, okText, offText }: { ok?: boolean; label: string; okText: string; offText: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="flex items-center gap-2">
        {ok ? <Check className="h-4 w-4 shrink-0 text-chart-2" /> : <X className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
        <span className="text-sm">{label}</span>
      </span>
      <span className={cn("shrink-0 text-xs font-medium", ok ? "text-chart-2" : "text-muted-foreground")}>{ok ? okText : offText}</span>
    </div>
  );
}

function SectionHead({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="mb-1 mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
      <Icon className="h-3.5 w-3.5" /> {children}
    </div>
  );
}

// A single readable panel per campaign: integrations set up or not, tech stack,
// assigned team, and clients — all with full labels (no cryptic chips). Shows on
// HOVER and renders through a portal so it floats above the table (never clipped).
function DetailsCell({ row, clientsById }: { row: CampaignRow; clientsById?: Map<string, { name: string; type: string }> }) {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const s = row.setup;
  const gsc = row.metrics.gsc?.loaded ?? s?.gsc;
  const ga = row.metrics.ga?.loaded ?? s?.ga;
  const members = row.members ?? [];
  const clients = row.clientIds.map((id) => clientsById?.get(id)).filter(Boolean) as { name: string; type: string }[];
  const tech = row.techStack ?? [];
  const setCount = [s?.tech, s?.sitemap, gsc, ga].filter(Boolean).length;

  const open = () => {
    if (timer.current) clearTimeout(timer.current);
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const W = 288, left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    const openUp = r.bottom > window.innerHeight * 0.6;
    setPos(openUp ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
  };
  const scheduleClose = () => { timer.current = setTimeout(() => setPos(null), 120); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Info className="h-3.5 w-3.5" /> Details
        <span className="rounded bg-secondary px-1 text-[10px] tabular-nums text-foreground">{setCount}/4</span>
      </button>
      {pos && typeof document !== "undefined" && createPortal(
        <div
          onMouseEnter={() => { if (timer.current) clearTimeout(timer.current); }}
          onMouseLeave={scheduleClose}
          style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: 288 }}
          className="z-[100] rounded-xl border border-border bg-card p-3 text-left shadow-lg"
        >
          <SectionHead icon={Plug}>Integrations &amp; setup</SectionHead>
          <StatusLine ok={gsc} label="Search Console" okText="Connected" offText="Not connected" />
          <StatusLine ok={ga} label="Google Analytics" okText="Connected" offText="Not connected" />
          <StatusLine ok={s?.sitemap} label="XML Sitemap" okText="Found" offText="Not found" />
          <StatusLine ok={row.metrics.gmb?.loaded ?? s?.gmb} label="Google Business" okText="Connected" offText="Not connected" />
          {row.metrics.gmb?.loaded && (
            <div className="mt-1 flex items-center gap-1.5 pl-6 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-chart-3 text-chart-3" />
              <span className="font-semibold text-foreground">{row.metrics.gmb.rating ?? "—"}</span> · {row.metrics.gmb.reviews} reviews
            </div>
          )}

          <SectionHead icon={Layers}>Tech stack</SectionHead>
          {tech.length ? (
            <div className="flex flex-wrap gap-1">{tech.map((t) => <span key={t} className="rounded-md bg-secondary px-1.5 py-0.5 text-xs">{t}</span>)}</div>
          ) : <p className="text-xs text-muted-foreground">No technologies detected yet.</p>}

          <SectionHead icon={Users2}>Team ({members.length})</SectionHead>
          {members.length ? (
            <div className="space-y-0.5">{members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-sm"><Avatar name={m.name} email={m.email} ring={false} /><span className="min-w-0 flex-1 truncate">{m.name || m.email}</span></div>
            ))}</div>
          ) : <p className="text-xs text-muted-foreground">No members assigned.</p>}

          <SectionHead icon={Building2}>Clients ({clients.length})</SectionHead>
          {clients.length ? (
            <div className="space-y-0.5">{clients.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{c.name}</span>{c.type === "AGENCY" && <span className="shrink-0 rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary">Agency</span>}</div>
            ))}</div>
          ) : <p className="text-xs text-muted-foreground">No clients linked.</p>}
        </div>,
        document.body,
      )}
    </span>
  );
}

// Largest Contentful Paint (Core Web Vitals): <=2.5s good, <=4s needs work, else poor.
function LcpBadge({ ms }: { ms: number | null | undefined }) {
  if (ms == null) return <span className="text-muted-foreground">—</span>;
  const s = ms / 1000;
  const tone = s <= 2.5 ? "text-chart-2" : s <= 4 ? "text-chart-3" : "text-destructive";
  return <span className={cn("text-sm font-semibold tabular-nums", tone)}>{s.toFixed(1)}s</span>;
}

// "when was this last audited" as a compact relative label.
function LastAudit({ at }: { at: string | null | undefined }) {
  if (!at) return <span className="text-xs text-muted-foreground">Never</span>;
  const d = new Date(at);
  const diff = Date.now() - d.getTime();
  const day = 86_400_000;
  let label: string;
  if (diff < 3_600_000) label = "Just now";
  else if (diff < day) label = `${Math.floor(diff / 3_600_000)}h ago`;
  else if (diff < 30 * day) label = `${Math.floor(diff / day)}d ago`;
  else label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return <span className="text-sm text-muted-foreground" title={d.toLocaleString()}>{label}</span>;
}

// Rank movement across tracked keywords: up = improved (green), down = worse (red).
function RankTrend({ trend }: { trend: number | null | undefined }) {
  if (trend == null || Math.abs(trend) < 0.05) return <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Minus className="h-3.5 w-3.5" /></span>;
  const up = trend > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums", up ? "text-chart-2" : "text-destructive")}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {Math.abs(trend).toFixed(1)}
    </span>
  );
}

// PageSpeed performance score badge (Google thresholds: 90+ green, 50+ amber, else red).
function SpeedBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-muted-foreground">—</span>;
  const tone = score >= 90 ? "bg-chart-2/15 text-chart-2" : score >= 50 ? "bg-chart-3/15 text-chart-3" : "bg-destructive/10 text-destructive";
  return <span className={cn("inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums", tone)}>{score}</span>;
}

function SpamBadge({ s }: { s: number | undefined }) {
  if (s == null) return <span className="text-muted-foreground">—</span>;
  const tone = s <= 10 ? "text-chart-2" : s <= 30 ? "text-chart-3" : "text-destructive";
  return <span className={cn("text-sm font-semibold tabular-nums", tone)}>{s}%</span>;
}

// A paid-data trigger. Shows the cached value; on a miss shows a "Load" chip that
// fetches once (a single paid call) and updates shared row state.
function LoadCell({ loaded, projectId, path, onLoad, children }: {
  loaded: boolean; projectId: string; path: string; onLoad: (raw: any) => void; children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  if (loaded) return <>{children}</>;
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        setLoading(true);
        try { onLoad(await api.get<any>(`/projects/${projectId}${path}`)); } catch { /* retry later */ } finally { setLoading(false); }
      }}
      disabled={loading}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {loading ? "…" : "Load"}
    </button>
  );
}

function SortBtn({ column, label }: { column: any; label: string }) {
  const s = column.getIsSorted();
  return (
    <button onClick={() => column.toggleSorting()} className="inline-flex items-center gap-1 hover:text-foreground">
      {label}
      {s === "asc" ? <ArrowUp className="h-3 w-3" /> : s === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

export function CampaignsTable({
  rows,
  clientsById,
  showClient = false,
  title,
  extra,
  days = 28,
}: {
  rows: CampaignRow[];
  clientsById?: Map<string, { name: string; type: string }>;
  showClient?: boolean;
  title?: string;
  extra?: React.ReactNode;
  days?: number;
}) {
  const router = useRouter();
  const can = useCan();
  const { refresh: refreshProjects } = useProjects();
  const [data, setData] = useState<CampaignRow[]>(rows);
  const [editRow, setEditRow] = useState<CampaignRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<CampaignRow | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [chip, setChip] = useState<"all" | "attention" | "noaudit">("all");
  const tried = useRef<Set<string>>(new Set());

  useEffect(() => setData(rows), [rows]);
  // Re-fetch free data when the period changes.
  useEffect(() => { tried.current = new Set(); }, [days]);

  const patch = (id: string, key: keyof CampaignRow["metrics"], block: any) =>
    setData((prev) => prev.map((r) => (r.id === id ? { ...r, metrics: { ...r.metrics, [key]: block } } : r)));

  // Auto-load FREE data (Search Console + Analytics) so the table fills in without
  // any cost. Paid DataForSEO data stays behind an explicit "Load" chip.
  const canOverview = can("overview.view");
  const canTraffic = can("traffic.view");
  useEffect(() => {
    const jobs = rows.filter((r) => !tried.current.has(r.id));
    jobs.forEach((r) => tried.current.add(r.id));
    if (!jobs.length || (!canOverview && !canTraffic)) return;
    let cancelled = false;
    runPool(jobs, 5, async (r) => {
      if (cancelled) return;
      const tasks: Promise<void>[] = [];
      if (canOverview && !r.metrics.gsc?.loaded) tasks.push(api.get<any>(`/projects/${r.id}/gsc?days=${days}`).then((g) => { if (!cancelled) patch(r.id, "gsc", parseGsc(g)); }).catch(() => {}));
      if (canTraffic && !r.metrics.ga?.loaded) tasks.push(api.get<any>(`/projects/${r.id}/ga?days=${days}`).then((g) => { if (!cancelled) patch(r.id, "ga", parseGa(g)); }).catch(() => {}));
      if (canOverview && !r.metrics.gmb?.loaded) tasks.push(api.get<any>(`/projects/${r.id}/gmb`).then((g) => { if (!cancelled) patch(r.id, "gmb", parseGmb(g)); }).catch(() => {}));
      await Promise.all(tasks);
    });
    return () => { cancelled = true; };
  }, [rows, canOverview, canTraffic, days]);

  const counts = useMemo(() => ({
    all: data.length,
    attention: data.filter((r) => { const a = r.metrics.audit; return a && a.healthScore != null && (a.healthScore < 50 || (a.errors ?? 0) > 0); }).length,
    noaudit: data.filter((r) => { const a = r.metrics.audit; return a === null || (a && a.healthScore == null); }).length,
  }), [data]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = data;
    if (chip === "attention") out = out.filter((r) => { const a = r.metrics.audit; return a && a.healthScore != null && (a.healthScore < 50 || (a.errors ?? 0) > 0); });
    else if (chip === "noaudit") out = out.filter((r) => { const a = r.metrics.audit; return a === null || (a && a.healthScore == null); });
    if (s) out = out.filter((r) => r.name.toLowerCase().includes(s) || r.domain.toLowerCase().includes(s));
    return out;
  }, [data, q, chip]);

  // per-column maxes for the proportional data bars
  const max = useMemo(() => ({
    clicks: Math.max(1, ...data.map((r) => (r.metrics.gsc?.loaded ? r.metrics.gsc.clicks ?? 0 : 0))),
    sessions: Math.max(1, ...data.map((r) => (r.metrics.ga?.loaded ? r.metrics.ga.sessions ?? 0 : 0))),
    backlinks: Math.max(1, ...data.map((r) => (r.metrics.backlinks?.loaded ? r.metrics.backlinks.backlinks ?? 0 : 0))),
    ranked: Math.max(1, ...data.map((r) => (r.metrics.rankedKeywords?.loaded ? r.metrics.rankedKeywords.count ?? 0 : 0))),
  }), [data]);

  const columns = useMemo<ColumnDef<CampaignRow>[]>(() => {
    const c: ColumnDef<CampaignRow>[] = [
      {
        id: "campaign",
        header: ({ column }) => <SortBtn column={column} label="Campaign" />,
        accessorFn: (r) => r.name.toLowerCase(),
        enableHiding: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center gap-3">
              <SiteFavicon domain={r.domain} className="h-9 w-9 shrink-0" iconClassName="h-4 w-4" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold transition-colors group-hover:text-primary">{r.name}</div>
                <div className="truncate text-xs text-muted-foreground">{r.domain}</div>
              </div>
            </div>
          );
        },
      },
    ];

    if (can("audit.view")) {
      c.push({
        id: "health",
        header: ({ column }) => <SortBtn column={column} label="Health" />,
        accessorFn: (r) => r.metrics.audit?.healthScore ?? -1,
        cell: ({ row }) => <HealthCell audit={row.original.metrics.audit} />,
      });
    }

    if (can("audit.view")) {
      c.push(
        { id: "speedMobile", header: () => <span className="inline-flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" />Mobile</span>, accessorFn: (r) => r.speed?.mobile ?? -1, cell: ({ row }) => <SpeedBadge score={row.original.speed?.mobile} /> },
        { id: "speedDesktop", header: () => <span className="inline-flex items-center gap-1"><Monitor className="h-3.5 w-3.5" />Desktop</span>, accessorFn: (r) => r.speed?.desktop ?? -1, cell: ({ row }) => <SpeedBadge score={row.original.speed?.desktop} /> },
        { id: "lcp", header: ({ column }) => <SortBtn column={column} label="LCP" />, accessorFn: (r) => r.metrics.audit?.lcpMs ?? 999999, cell: ({ row }) => <LcpBadge ms={row.original.metrics.audit?.lcpMs} /> },
        { id: "lastAudit", header: "Last audit", enableSorting: false, cell: ({ row }) => <LastAudit at={row.original.metrics.audit?.finishedAt} /> },
      );
    }

    c.push({ id: "details", header: "Setup & team", enableSorting: false, cell: ({ row }) => <DetailsCell row={row.original} clientsById={clientsById} /> });

    if (canOverview) {
      c.push(
        { id: "gscClicks", header: ({ column }) => <SortBtn column={column} label="Clicks" />, accessorFn: (r) => (r.metrics.gsc?.loaded ? r.metrics.gsc.clicks ?? 0 : -1), cell: ({ row }) => { const g = row.original.metrics.gsc; return g?.loaded ? <Bar value={g.clicks ?? 0} max={max.clicks} color="chart-1">{nf(g.clicks)}</Bar> : <Dash />; } },
        { id: "gscImpr", header: ({ column }) => <SortBtn column={column} label="Impr." />, accessorFn: (r) => (r.metrics.gsc?.loaded ? r.metrics.gsc.impressions ?? 0 : -1), cell: ({ row }) => { const g = row.original.metrics.gsc; return g?.loaded ? <span className="tabular-nums">{nf(g.impressions)}</span> : <Dash />; } },
        { id: "gscCtr", header: "CTR", accessorFn: (r) => (r.metrics.gsc?.loaded ? r.metrics.gsc.ctr ?? 0 : -1), cell: ({ row }) => { const g = row.original.metrics.gsc; return g?.loaded ? <span className="tabular-nums">{pctf(g.ctr)}</span> : <Dash />; } },
        { id: "gscPos", header: ({ column }) => <SortBtn column={column} label="Position" />, accessorFn: (r) => (r.metrics.gsc?.loaded ? r.metrics.gsc.position ?? 999 : 9999), cell: ({ row }) => { const g = row.original.metrics.gsc; return g?.loaded ? <PosBadge p={g.position} /> : <Dash />; } },
        { id: "gmb", header: () => <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />GMB</span>, accessorFn: (r) => (r.metrics.gmb?.loaded ? r.metrics.gmb.rating ?? 0 : -1), cell: ({ row }) => { const g = row.original.metrics.gmb; if (!g?.loaded) return <Dash />; return <span className="inline-flex items-center gap-1 tabular-nums"><Star className="h-3.5 w-3.5 fill-chart-3 text-chart-3" />{g.rating ?? "—"}<span className="ml-0.5 text-xs text-muted-foreground">{nf(g.reviews)}</span></span>; } },
      );
    }

    if (canTraffic) {
      c.push(
        { id: "sessions", header: ({ column }) => <SortBtn column={column} label="Sessions" />, accessorFn: (r) => (r.metrics.ga?.loaded ? r.metrics.ga.sessions ?? 0 : -1), cell: ({ row }) => { const g = row.original.metrics.ga; return g?.loaded ? <Bar value={g.sessions ?? 0} max={max.sessions} color="chart-4">{nf(g.sessions)}</Bar> : <Dash />; } },
        { id: "users", header: "Users", accessorFn: (r) => (r.metrics.ga?.loaded ? r.metrics.ga.users ?? 0 : -1), cell: ({ row }) => { const g = row.original.metrics.ga; return g?.loaded ? <span className="tabular-nums">{nf(g.users)}</span> : <Dash />; } },
        { id: "bounce", header: "Bounce", accessorFn: (r) => (r.metrics.ga?.loaded ? r.metrics.ga.bounceRate ?? -1 : -1), cell: ({ row }) => { const g = row.original.metrics.ga; return g?.loaded ? <span className="tabular-nums">{pctf(g.bounceRate)}</span> : <Dash />; } },
      );
    }

    if (can("ranks.view")) {
      c.push(
        { id: "tracked", header: ({ column }) => <SortBtn column={column} label="Tracked" />, accessorFn: (r) => r.metrics.rankTracker?.trackedCount ?? -1, cell: ({ row }) => { const t = row.original.metrics.rankTracker; if (!t) return <Dash />; return <span className="tabular-nums">{t.trackedCount}{t.avgPosition != null ? <span className="ml-1 text-xs text-muted-foreground">avg {t.avgPosition}</span> : null}</span>; } },
        { id: "rankTrend", header: ({ column }) => <SortBtn column={column} label="Rank Δ" />, accessorFn: (r) => r.metrics.rankTracker?.trend ?? -999, cell: ({ row }) => <RankTrend trend={row.original.metrics.rankTracker?.trend} /> },
        { id: "rankedKw", header: ({ column }) => <SortBtn column={column} label="Ranked KW" />, accessorFn: (r) => (r.metrics.rankedKeywords?.loaded ? r.metrics.rankedKeywords.count ?? 0 : -1), cell: ({ row }) => { const b = row.original.metrics.rankedKeywords; return (<LoadCell loaded={!!b?.loaded} projectId={row.original.id} path="/ranked-keywords" onLoad={(raw) => patch(row.original.id, "rankedKeywords", parseRanked(raw))}><Bar value={b?.count ?? 0} max={max.ranked} color="chart-2">{nf(b?.count)}<span className="ml-1 text-xs font-normal text-muted-foreground">top10 {nf(top10(b))}</span></Bar></LoadCell>); } },
        { id: "etv", header: "Traffic value", accessorFn: (r) => (r.metrics.rankedKeywords?.loaded ? r.metrics.rankedKeywords.etv ?? 0 : -1), cell: ({ row }) => { const b = row.original.metrics.rankedKeywords; return b?.loaded ? <span className="tabular-nums">${nf(b.etv)}</span> : <Dash />; } },
      );
    }

    if (can("backlinks.view")) {
      c.push(
        { id: "backlinks", header: ({ column }) => <SortBtn column={column} label="Backlinks" />, accessorFn: (r) => (r.metrics.backlinks?.loaded ? r.metrics.backlinks.backlinks ?? 0 : -1), cell: ({ row }) => { const b = row.original.metrics.backlinks; return (<LoadCell loaded={!!b?.loaded} projectId={row.original.id} path="/backlinks" onLoad={(raw) => patch(row.original.id, "backlinks", parseBacklinks(raw))}><Bar value={b?.backlinks ?? 0} max={max.backlinks} color="chart-2">{nf(b?.backlinks)}</Bar></LoadCell>); } },
        { id: "refDomains", header: "Ref. domains", accessorFn: (r) => (r.metrics.backlinks?.loaded ? r.metrics.backlinks.referringDomains ?? 0 : -1), cell: ({ row }) => { const b = row.original.metrics.backlinks; return b?.loaded ? <span className="tabular-nums">{nf(b.referringDomains)}</span> : <Dash />; } },
        { id: "spam", header: "Spam", accessorFn: (r) => (r.metrics.backlinks?.loaded ? r.metrics.backlinks.spamScore ?? 0 : -1), cell: ({ row }) => { const b = row.original.metrics.backlinks; return b?.loaded ? <SpamBadge s={b.spamScore} /> : <Dash />; } },
      );
    }

    if (can("competitors.view")) {
      c.push({ id: "competitors", header: "Competitors", accessorFn: (r) => (r.metrics.competitors?.loaded ? r.metrics.competitors.count ?? 0 : -1), cell: ({ row }) => { const b = row.original.metrics.competitors; return (<LoadCell loaded={!!b?.loaded} projectId={row.original.id} path="/competitors" onLoad={(raw) => patch(row.original.id, "competitors", parseCompetitors(raw))}><span className="tabular-nums">{nf(b?.count)}</span></LoadCell>); } });
    }

    const canEdit = can("projects.edit");
    const canDelete = can("projects.delete");
    c.push({
      id: "actions",
      header: "",
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          {(canEdit || canDelete) && (
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
              {canEdit && <button title="Edit name" onClick={() => setEditRow(row.original)} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>}
              {canDelete && <button title="Delete" onClick={() => setDeleteRow(row.original)} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          )}
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
        </div>
      ),
    });

    return c;
  }, [can, canOverview, canTraffic, showClient, clientsById, max]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const chips: { key: typeof chip; label: string; n: number }[] = [
    { key: "all", label: "All", n: counts.all },
    { key: "attention", label: "Needs attention", n: counts.attention },
    { key: "noaudit", label: "No audit", n: counts.noaudit },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {title && (
            <div className="flex items-baseline gap-1.5 pl-1 pr-2">
              <h2 className="font-heading text-base font-semibold">{title}</h2>
              <span className="text-sm text-muted-foreground tabular-nums">{rows.length}</span>
            </div>
          )}
          {chips.map((ch) => (
            <button key={ch.key} onClick={() => setChip(ch.key)} className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors", chip === ch.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50")}>
              {ch.label}
              <span className={cn("rounded-md px-1.5 text-xs tabular-nums", chip === ch.key ? "bg-background/70 text-foreground" : "bg-secondary text-muted-foreground")}>{ch.n}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {extra}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-48 rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring" />
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-secondary/50">
              <SlidersHorizontal className="h-4 w-4" /> Columns
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 max-h-80 w-52 overflow-auto rounded-xl border border-border bg-card p-1.5 shadow-card">
                  {table.getAllLeafColumns().filter((col) => col.getCanHide()).map((col) => (
                    <button key={col.id} onClick={() => col.toggleVisibility()} className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm capitalize transition-colors hover:bg-secondary/60">
                      {col.id.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase())}
                      {col.getIsVisible() ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {hg.headers.map((h, i) => (
                  <th key={h.id} className={cn("whitespace-nowrap bg-muted px-4 py-3",
                    RIGHT_ALIGN.has(h.column.id) && "text-right",
                    i === 0 && "sticky left-0 z-20 shadow-[1px_0_0_0_hsl(var(--border))]",
                    i === hg.headers.length - 1 && "sticky right-0 z-20 shadow-[-1px_0_0_0_hsl(var(--border))]")}>
                    {h.isPlaceholder ? null : (
                      <span className={cn("inline-flex", RIGHT_ALIGN.has(h.column.id) && "w-full justify-end")}>{flexRender(h.column.columnDef.header, h.getContext())}</span>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} onClick={() => router.push(`/dashboard/projects/${row.original.slug}`)} className="group cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-secondary/40">
                {row.getVisibleCells().map((cell, i, arr) => (
                  <td key={cell.id} className={cn("relative whitespace-nowrap px-4 py-3",
                    RIGHT_ALIGN.has(cell.column.id) && "text-right tabular-nums",
                    i === 0 && "sticky left-0 z-20 bg-card shadow-[1px_0_0_0_hsl(var(--border))] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary before:opacity-0 group-hover:before:opacity-100",
                    i === arr.length - 1 && "sticky right-0 z-20 bg-card shadow-[-1px_0_0_0_hsl(var(--border))]")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-muted-foreground">No campaigns match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editRow && <RenameModal row={editRow} onClose={() => setEditRow(null)} onSaved={(name) => { setData((prev) => prev.map((r) => (r.id === editRow.id ? { ...r, name } : r))); refreshProjects(); setEditRow(null); }} />}
      {deleteRow && <DeleteModal row={deleteRow} onClose={() => setDeleteRow(null)} onDeleted={() => { setData((prev) => prev.filter((r) => r.id !== deleteRow.id)); refreshProjects(); setDeleteRow(null); }} />}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span>Showing {table.getRowModel().rows.length} of {data.length} campaigns</span>
        <span className="hidden sm:inline">Free data (audit · Search Console · Analytics) loads automatically. Paid data loads on demand.</span>
      </div>
    </div>
  );
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

// Centered modal (portal — never clipped by the table).
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] grid place-items-center bg-foreground/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function RenameModal({ row, onClose, onSaved }: { row: CampaignRow; onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState(row.name);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    const n = name.trim();
    if (!n || n === row.name) return onClose();
    setSaving(true); setErr("");
    try { await api.patch(`/projects/${row.id}`, { name: n }); onSaved(n); }
    catch (e: any) { setErr(e?.message || "Couldn't rename."); setSaving(false); }
  };
  return (
    <Modal title="Edit campaign name" onClose={onClose}>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</label>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring" />
      <p className="mt-1 text-xs text-muted-foreground">{row.domain}</p>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-secondary/50">Cancel</button>
        <button onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</button>
      </div>
    </Modal>
  );
}

function DeleteModal({ row, onClose, onDeleted }: { row: CampaignRow; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const del = async () => {
    setBusy(true); setErr("");
    try { await api.del(`/projects/${row.id}`); onDeleted(); }
    catch (e: any) { setErr(e?.message || "Couldn't delete."); setBusy(false); }
  };
  return (
    <Modal title="Delete campaign" onClose={onClose}>
      <p className="text-sm text-muted-foreground">Delete <span className="font-semibold text-foreground">{row.name}</span> <span className="text-xs">({row.domain})</span>? This removes the campaign and all its data. This can't be undone.</p>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-secondary/50">Cancel</button>
        <button onClick={del} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-sm font-medium text-white disabled:opacity-60">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Delete</button>
      </div>
    </Modal>
  );
}
