"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Globe,
  ExternalLink,
  LineChart,
  Link2,
  FileSearch,
  Sparkles,
  Trash2,
  Plus,
  MousePointerClick,
  Gauge,
  Activity,
  Users,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  Swords,
  Monitor,
  Smartphone,
  Zap,
  Loader2,
  Wrench,
  ChevronDown,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { SiGooglesearchconsole, SiGoogleanalytics } from "react-icons/si";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjects, type Project } from "@/components/providers/projects-provider";
import { api } from "@/lib/api";
import { TrendChart, BarList, DonutChart, ChartCard } from "@/components/ui/charts";
import { OverviewSkeleton, KpiGridSkeleton, TableCardSkeleton } from "@/components/ui/panel-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { RichText, streamAuditFix } from "@/components/copilot/copilot-core";
import { LoadDataCard, WarmingCard, useWarmupPoll, isNewProject } from "./dataforseo-panels";
// GitHub auto-fix PR feature hidden for now — re-enable by uncommenting here and below.
// import { GithubConnectCard } from "./autofix-panel";

const ACCENTS: Record<string, string> = {
  blue: "bg-gradient-to-br from-chart-1/20 to-chart-1/5 text-chart-1 ring-1 ring-inset ring-chart-1/20",
  green: "bg-gradient-to-br from-chart-2/20 to-chart-2/5 text-chart-2 ring-1 ring-inset ring-chart-2/20",
  amber: "bg-gradient-to-br from-chart-3/25 to-chart-3/5 text-chart-3 ring-1 ring-inset ring-chart-3/20",
  violet: "bg-gradient-to-br from-chart-4/20 to-chart-4/5 text-chart-4 ring-1 ring-inset ring-chart-4/20",
};
// Accent key -> the chart CSS var name, so the sparkline matches the icon tint.
const ACCENT_VAR: Record<string, string> = { blue: "chart-1", green: "chart-2", amber: "chart-3", violet: "chart-4" };

// Tiny dependency-free trend line (with a soft gradient area) for a stat card —
// the signature "at-a-glance trend" look. Renders nothing with < 2 points.
function Sparkline({ data, color = "chart-1", className }: { data: number[]; color?: string; className?: string }) {
  const pts = data.filter((n) => Number.isFinite(n));
  if (pts.length < 2) return null;
  const w = 100, h = 26;
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const step = w / (pts.length - 1);
  const coords = pts.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const gid = `spark-${color}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-6 w-full overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`hsl(var(--${color}))`} stopOpacity="0.22" />
          <stop offset="100%" stopColor={`hsl(var(--${color}))`} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={`hsl(var(--${color}))`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  hint,
  delta,
  deltaGoodDown,
  spark,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: keyof typeof ACCENTS;
  hint?: string;
  delta?: number | null;
  deltaGoodDown?: boolean; // for metrics where a drop is good (e.g. avg. position)
  spark?: number[]; // optional trend series for the mini sparkline
}) {
  const hasDelta = delta != null && isFinite(delta) && Math.abs(delta) >= 0.5;
  const up = (delta ?? 0) > 0;
  const good = deltaGoodDown ? !up : up;
  return (
    <Card className="group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <span className={cn("grid h-10 w-10 place-items-center rounded-xl transition-transform group-hover:scale-105", ACCENTS[accent])}>
            <Icon className="h-5 w-5" />
          </span>
          {hasDelta && (
            <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold", good ? "bg-chart-2/12 text-chart-2" : "bg-destructive/10 text-destructive")}>
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(delta!).toFixed(0)}%
            </span>
          )}
        </div>
        <div className="mt-3 font-heading text-[28px] font-bold leading-none tracking-tight">{value}</div>
        <div className="mt-2 text-sm font-medium text-muted-foreground">{label}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>}
        {spark && spark.length > 1 && (
          <div className="mt-2.5 -mb-1">
            <Sparkline data={spark} color={ACCENT_VAR[accent]} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-7 w-7" />
        </span>
        <div className="space-y-1">
          <h3 className="font-heading text-base font-semibold">{title}</h3>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{desc}</p>
        </div>
        {children && <div className="flex flex-wrap justify-center gap-2 pt-1">{children}</div>}
      </CardContent>
    </Card>
  );
}

const ONBOARDING: { icon: LucideIcon; title: string; desc: string; accent: keyof typeof ACCENTS }[] = [
  { icon: FileSearch, title: "Run a site audit", desc: "Find technical and on-page issues", accent: "blue" },
  { icon: Search, title: "Add keywords", desc: "Track your Google rankings daily", accent: "green" },
  { icon: Link2, title: "Discover backlinks", desc: "See who links to your site", accent: "violet" },
];

type Metric = { clicks: number; impressions: number; ctr: number; position: number };
type GscOverview = {
  connected: boolean; matched: boolean; totals?: Metric;
  queries?: { key: string; clicks: number; impressions: number; ctr: number; position: number }[];
  pages?: { key: string; clicks: number; impressions: number; ctr: number; position: number }[];
  countries?: { key: string; clicks: number; impressions: number }[];
  devices?: { key: string; clicks: number }[];
  trend?: { date: string; clicks: number; impressions: number }[];
};
type GaOverview = {
  connected: boolean; matched: boolean;
  totals?: { sessions: number; users: number; newUsers: number; pageviews: number; avgDuration: number; bounceRate: number; engagementRate: number };
  trend?: { date: string; sessions: number; users: number }[];
  channels?: { channel: string; sessions: number }[];
  topPages?: { path: string; pageviews: number; sessions: number }[];
  countries?: { country: string; sessions: number }[];
  devices?: { device: string; sessions: number }[];
  sources?: { source: string; sessions: number }[];
};
type BlOverview = {
  connected: boolean;
  summary?: { backlinks: number; referringDomains: number; dofollow: number; spamScore: number };
  referringDomains?: { domain: string; backlinks: number; rank: number; dofollow: number }[];
};
type RankedOverview = {
  connected: boolean;
  totals?: { count: number; etv: number; pos_1: number; pos_2_3: number; pos_4_10: number };
  keywords?: { keyword: string; volume: number; position: number | null; url: string | null }[];
};
type CompOverview = { connected: boolean; competitors?: { domain: string; commonKeywords: number; keywords: number; top10: number; etv: number }[] };

// Short axis label for both "YYYYMMDD" (GA) and "YYYY-MM-DD" (GSC) dates.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(d: string): string {
  const s = String(d).replace(/-/g, "");
  if (s.length !== 8) return String(d);
  return `${MONTHS[Number(s.slice(4, 6)) - 1]} ${Number(s.slice(6, 8))}`;
}
// Period-over-period % change: recent half vs previous half of a trend series.
function pctDelta(rows: { [k: string]: unknown }[] | undefined, key: string): number | null {
  if (!rows || rows.length < 4) return null;
  const half = Math.floor(rows.length / 2);
  const prev = rows.slice(0, half).reduce((s, r) => s + (Number(r[key]) || 0), 0);
  const recent = rows.slice(half).reduce((s, r) => s + (Number(r[key]) || 0), 0);
  if (prev <= 0) return recent > 0 ? 100 : null;
  return ((recent - prev) / prev) * 100;
}
function posBadge(p: number | null): string {
  if (p == null) return "bg-secondary text-muted-foreground";
  if (p <= 3) return "bg-chart-2/15 text-chart-2";
  if (p <= 10) return "bg-chart-3/15 text-chart-3";
  return "bg-secondary text-muted-foreground";
}
const pct = (v: number | undefined) => `${((v ?? 0) * 100).toFixed(1)}%`;

// Lighthouse-style 0-100 score color (solid, no gradient).
function scoreVar(s: number | null): string {
  if (s == null) return "muted-foreground";
  if (s >= 90) return "chart-2";
  if (s >= 50) return "chart-3";
  return "destructive";
}
function ScoreRing({ score, size = 60 }: { score: number | null; size?: number }) {
  const s = score ?? 0;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = `hsl(var(--${scoreVar(score)}))`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ - (s / 100) * circ} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold" style={{ color }}>{score ?? "—"}</span>
    </div>
  );
}
// Data-bar cell — a subtle value-proportional bar behind a number (heatmap feel).
function BarCell({ value, max, color = "chart-1", format }: { value: number; max: number; color?: string; format?: (n: number) => string }) {
  const w = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div className="relative flex h-6 items-center justify-end rounded">
      <div className="absolute inset-y-0.5 left-0 rounded" style={{ width: `${w}%`, background: `hsl(var(--${color}) / 0.16)` }} />
      <span className="relative z-10 pr-1 text-sm font-medium tabular-nums">{format ? format(value) : value.toLocaleString()}</span>
    </div>
  );
}
// Core Web Vitals color by Google thresholds.
function cwvVar(kind: "lcp" | "cls" | "fcp", v: number | null): string {
  if (v == null) return "muted-foreground";
  if (kind === "cls") return v <= 0.1 ? "chart-2" : v <= 0.25 ? "chart-3" : "destructive";
  if (kind === "lcp") return v <= 2500 ? "chart-2" : v <= 4000 ? "chart-3" : "destructive";
  return v <= 1800 ? "chart-2" : v <= 3000 ? "chart-3" : "destructive"; // fcp
}
function Cwv({ label, kind, v }: { label: string; kind: "lcp" | "cls" | "fcp"; v: number | null }) {
  const disp = v == null ? "—" : kind === "cls" ? v.toFixed(2) : `${(v / 1000).toFixed(1)}s`;
  return (
    <div className="rounded-lg border border-border px-2 py-1.5 text-center">
      <div className="text-sm font-bold" style={{ color: `hsl(var(--${cwvVar(kind, v)}))` }}>{disp}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
type PsiStrategy = { scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null }; lab: { lcp: { value: number | null }; cls: { value: number | null }; fcp: { value: number | null } } } | null;
type PsiData = { fetchedAt?: string; mobile?: PsiStrategy; desktop?: PsiStrategy } | null;

function SpeedColumn({ label, icon: Icon, data }: { label: string; icon: LucideIcon; data: PsiStrategy }) {
  if (!data) return <div className="flex-1 py-6 text-center text-sm text-muted-foreground">No {label.toLowerCase()} data.</div>;
  const s = data.scores;
  return (
    <div className="flex-1 space-y-3">
      <div className="flex items-center gap-3">
        <ScoreRing score={s.performance} size={62} />
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4 text-muted-foreground" />{label}</div>
          <div className="text-xs text-muted-foreground">Performance score</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Cwv label="LCP" kind="lcp" v={data.lab.lcp.value} />
        <Cwv label="CLS" kind="cls" v={data.lab.cls.value} />
        <Cwv label="FCP" kind="fcp" v={data.lab.fcp.value} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>A11y <b className="font-semibold text-foreground">{s.accessibility ?? "—"}</b></span>
        <span>Best practices <b className="font-semibold text-foreground">{s.bestPractices ?? "—"}</b></span>
        <span>SEO <b className="font-semibold text-foreground">{s.seo ?? "—"}</b></span>
      </div>
    </div>
  );
}

type IssueSummary = { code: string; message: string; count: number; severity: "high" | "medium" | "low" | string };

const SEV_DOT: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-chart-3",
  low: "bg-muted-foreground",
};

// One audit issue on the Overview, with an inline, stack-aware AI fix that
// expands on demand (shares the /audit-fix endpoint used by the full audit tab).
function IssueFixRow({ projectId, issue, readOnly = false }: { projectId: string; issue: IssueSummary; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [fix, setFix] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Public / read-only view: show the issue as plain info — no AI-fix action.
  if (readOnly) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", SEV_DOT[issue.severity] ?? "bg-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{issue.message}</span>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {issue.count} {issue.count === 1 ? "page" : "pages"}
        </span>
      </div>
    );
  }

  async function runFix() {
    setLoading(true);
    setFix(null);
    await streamAuditFix(
      `/projects/${projectId}/audit-fix/stream`,
      { code: issue.code },
      {
        onToken: (t) => { setLoading(false); setFix(t); },
        onDone: (t) => { setLoading(false); setFix(t); },
        onError: () => { setLoading(false); setFix("Couldn't generate a fix right now. Please try again."); },
      },
    );
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && fix == null && !loading) await runFix();
  }

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-secondary/40"
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", SEV_DOT[issue.severity] ?? "bg-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{issue.message}</span>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {issue.count} {issue.count === 1 ? "page" : "pages"}
        </span>
        <span className="ml-1 hidden items-center gap-1 text-xs font-semibold text-primary sm:inline-flex">
          <Wrench className="h-3.5 w-3.5" /> AI fix
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border px-3.5 py-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating a fix for your stack…
            </div>
          )}
          {!loading && fix && (
            <>
              <div className="text-sm text-foreground">
                <RichText text={fix} />
              </div>
              <Button variant="ghost" size="sm" className="mt-2" onClick={runFix}>
                <RefreshCw className="h-4 w-4" /> Regenerate
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TopIssues({ projectId, issues, readOnly = false }: { projectId: string; issues: IssueSummary[]; readOnly?: boolean }) {
  const rank = (s: string) => (s === "high" ? 0 : s === "medium" ? 1 : 2);
  const sorted = [...issues].sort((a, b) => rank(a.severity) - rank(b.severity) || b.count - a.count).slice(0, 8);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{readOnly ? "Top issues found" : "Top issues to fix"}</CardTitle>
            <CardDescription>{readOnly ? "Technical & on-page issues from the latest audit." : "Tap any issue for a step-by-step fix tailored to your site."}</CardDescription>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-chart-3/15 text-chart-3">
            <Wrench className="h-[18px] w-[18px]" />
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-border px-3.5 py-4 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-chart-2" /> No issues found in the latest audit. Nice work.
          </div>
        ) : (
          sorted.map((i) => <IssueFixRow key={i.code} projectId={projectId} issue={i} readOnly={readOnly} />)
        )}
      </CardContent>
    </Card>
  );
}

export function OverviewPanel({ project, refreshNonce = 0, base, readOnly = false, days = 28, range }: { project: Project; refreshNonce?: number; base?: string; readOnly?: boolean; days?: number; range?: { from: string; to: string } }) {
  // Explicit from/to range overrides the day count (both handled by the API).
  const rangeQ = range ? `&from=${range.from}&to=${range.to}` : "";
  // API path root — defaults to the authed project route, but the public
  // read-only view passes `/public/projects/<shareKey>` so the same panel
  // renders from the unauthenticated endpoints.
  const apiBase = base ?? `/projects/${project.id}`;
  const [gsc, setGsc] = useState<GscOverview | null>(null);
  const [ga, setGa] = useState<GaOverview | null>(null);
  const [bl, setBl] = useState<BlOverview | null>(null);
  const [ranked, setRanked] = useState<RankedOverview | null>(null);
  const [comp, setComp] = useState<CompOverview | null>(null);
  const [health, setHealth] = useState<number | null>(null);
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [psi, setPsi] = useState<PsiData>(null);
  const [psiLoading, setPsiLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    const f = refreshNonce ? "&fresh=1" : "";
    // DataForSEO (paid) calls: only read the cache when the Overview auto-loads;
    // a live/paid refetch happens solely on the explicit Refresh button.
    const dfq = refreshNonce ? "?fresh=1" : "?cachedOnly=1";
    Promise.allSettled([
      api.get<GscOverview>(`${apiBase}/gsc?days=${days}${rangeQ}${f}`),
      api.get<GaOverview>(`${apiBase}/ga?days=${days}${rangeQ}${f}`),
      api.get<BlOverview>(`${apiBase}/backlinks${dfq}`),
      api.get<RankedOverview>(`${apiBase}/ranked-keywords${dfq}`),
      api.get<{ healthScore: number | null; issuesSummary: IssueSummary[] | null } | null>(`${apiBase}/crawl/latest`),
      api.get<CompOverview>(`${apiBase}/competitors${dfq}`),
    ]).then((res) => {
      if (!alive) return;
      if (res[0].status === "fulfilled") setGsc(res[0].value);
      if (res[1].status === "fulfilled") setGa(res[1].value);
      if (res[2].status === "fulfilled") setBl(res[2].value);
      if (res[3].status === "fulfilled") setRanked(res[3].value);
      if (res[4].status === "fulfilled") {
        setHealth(res[4].value?.healthScore ?? null);
        setIssues(Array.isArray(res[4].value?.issuesSummary) ? res[4].value!.issuesSummary! : []);
      }
      if (res[5].status === "fulfilled") setComp(res[5].value);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [project.id, refreshNonce, days, rangeQ]);

  // PageSpeed is slow (~15s uncached) — fetch it separately so it never blocks
  // the rest of the dashboard. Cached 24h server-side, so repeat loads are instant.
  useEffect(() => {
    let alive = true;
    setPsiLoading(true);
    setPsi(null);
    const root = project.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    api
      .get<PsiData>(`${apiBase}/pagespeed?url=${encodeURIComponent(`https://${root}`)}${refreshNonce ? "&fresh=1" : ""}`)
      .then((d) => alive && setPsi(d))
      .catch(() => alive && setPsi(null))
      .finally(() => alive && setPsiLoading(false));
    return () => {
      alive = false;
    };
  }, [project.id, project.domain, refreshNonce]);

  const gscLive = gsc?.connected && gsc?.matched;
  const gaLive = ga?.connected && ga?.matched;
  const blLive = bl?.connected && (bl.summary?.backlinks ?? 0) > 0;
  const top10 = ranked?.totals ? ranked.totals.pos_1 + ranked.totals.pos_2_3 + ranked.totals.pos_4_10 : null;
  const anyData = gscLive || gaLive || blLive || health != null;

  // Loading / refreshing → full structured skeleton that mirrors the dashboard.
  if (!loaded) return <OverviewSkeleton />;

  // Nothing connected yet → keep the onboarding guidance.
  if (loaded && !anyData) {
    return (
      <div className="space-y-3">
        <Card>
          <CardContent className="flex flex-col items-center px-6 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-7 w-7" />
            </span>
            <h3 className="mt-4 font-heading text-lg font-semibold">Start tracking {project.domain}</h3>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">Connect Google Search Console &amp; Analytics, run an audit, and explore keywords to populate this dashboard.</p>
            <div className="mt-7 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
              {ONBOARDING.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="rounded-xl border border-border p-4 text-left transition-colors hover:border-ring/40 hover:bg-secondary/40">
                    <div className="flex items-center justify-between">
                      <span className={cn("grid h-9 w-9 place-items-center rounded-lg", ACCENTS[step.accent])}><Icon className="h-[18px] w-[18px]" /></span>
                      <span className="text-xs font-semibold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium">{step.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dash = (v: string) => (loaded ? v : "—");
  const queries = (gsc?.queries ?? []).slice(0, 10);
  const channels = (ga?.channels ?? []).slice(0, 6);
  const devices = (ga?.devices ?? []).slice(0, 5);
  const gaCountries = (ga?.countries ?? []).slice(0, 8);
  const topPages = (ga?.topPages ?? []).slice(0, 8);
  const rankedKw = (ranked?.keywords ?? []).slice(0, 10);
  const competitors = (comp?.competitors ?? []).slice(0, 8);
  const refDomains = (bl?.referringDomains ?? []).slice(0, 8);
  const clicksDelta = pctDelta(gsc?.trend, "clicks");
  const sessionsDelta = pctDelta(ga?.trend, "sessions");
  const qMax = Math.max(1, ...queries.map((q) => q.impressions));
  const kwMax = Math.max(1, ...rankedKw.map((k) => k.volume));
  const cMax = Math.max(1, ...competitors.map((c) => c.commonKeywords));
  const rdMax = Math.max(1, ...refDomains.map((d) => d.backlinks));
  const pgMax = Math.max(1, ...topPages.map((p) => p.pageviews));
  const rankDist = ranked?.totals
    ? [
        { bucket: "Top 3", n: ranked.totals.pos_1 + ranked.totals.pos_2_3 },
        { bucket: "Positions 4-10", n: ranked.totals.pos_4_10 },
        { bucket: "Positions 11+", n: Math.max(0, ranked.totals.count - ranked.totals.pos_1 - ranked.totals.pos_2_3 - ranked.totals.pos_4_10) },
      ]
    : [];

  // Grid columns follow how many cards are actually present, so a lone card fills
  // the row instead of leaving empty space next to it.
  const hasGscTrend = !!(gscLive && (gsc!.trend?.length ?? 0) > 1);
  const hasGaTrend = !!(gaLive && (ga!.trend?.length ?? 0) > 1);
  const chartCount = (hasGscTrend ? 1 : 0) + (hasGaTrend ? 1 : 0);
  const distCount = (channels.length > 0 ? 1 : 0) + (devices.length > 0 ? 1 : 0) + (rankDist.some((r) => r.n > 0) ? 1 : 0);
  const colsClass = (n: number) => (n >= 3 ? "lg:grid-cols-3" : n === 2 ? "lg:grid-cols-2" : "");

  return (
    <div className="space-y-2.5">
      {/* KPI row 1 — search & health */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ranking keywords" value={dash(gscLive ? String(gsc!.queries?.length ?? 0) : "—")} icon={Search} accent="blue" hint={gscLive ? "Search Console · 28d" : "Connect Google"} spark={gscLive ? gsc!.trend?.map((t) => t.impressions) : undefined} />
        <StatCard label="Clicks / 28d" value={dash(gscLive ? fmtNum(gsc!.totals?.clicks) : "—")} icon={MousePointerClick} accent="green" hint={gscLive ? `${pct(gsc!.totals?.ctr)} CTR · ${fmtNum(gsc!.totals?.impressions)} impr.` : "Connect Google"} delta={clicksDelta} spark={gscLive ? gsc!.trend?.map((t) => t.clicks) : undefined} />
        <StatCard label="Avg. position" value={dash(gscLive ? (gsc!.totals?.position ?? 0).toFixed(1) : "—")} icon={Gauge} accent="violet" hint={gscLive ? "Search Console · 28d" : "Connect Google"} />
        <StatCard label="Site health" value={dash(health != null ? String(health) : "—")} icon={Activity} accent="amber" hint={health != null ? "Latest audit" : "Run an audit"} />
      </div>

      {/* KPI row 2 — traffic & authority */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sessions / 28d" value={dash(gaLive ? fmtNum(ga!.totals?.sessions) : "—")} icon={Users} accent="blue" hint={gaLive ? `${fmtNum(ga!.totals?.users)} users · ${pct(ga!.totals?.engagementRate)} engaged` : "Connect Analytics"} delta={sessionsDelta} spark={gaLive ? ga!.trend?.map((t) => t.sessions) : undefined} />
        <StatCard label="Keywords in top 10" value={dash(top10 != null ? fmtNum(top10) : "—")} icon={Trophy} accent="green" hint={ranked?.totals ? `${fmtNum(ranked.totals.count)} ranked · ${fmtNum(ranked.totals.etv)} est. visits` : "Page-1 keywords"} />
        <StatCard label="Backlinks" value={dash(blLive ? fmtNum(bl!.summary?.backlinks) : "—")} icon={Link2} accent="violet" hint={blLive ? `${fmtNum(bl!.summary?.dofollow)} dofollow` : "No data yet"} />
        <StatCard label="Referring domains" value={dash(blLive ? fmtNum(bl!.summary?.referringDomains) : "—")} icon={Globe} accent="amber" hint={blLive ? `spam score ${bl!.summary?.spamScore}%` : "No data yet"} deltaGoodDown />
      </div>

      {/* Top audit issues with inline, stack-aware AI fixes */}
      {!readOnly && health != null && issues.length > 0 && <TopIssues projectId={project.id} issues={issues} readOnly={readOnly} />}

      {/* Trend charts — search performance + website traffic */}
      {chartCount > 0 ? (
        <div className={cn("grid gap-2.5", colsClass(chartCount))}>
          {gscLive && (gsc!.trend?.length ?? 0) > 1 && (
            <ChartCard title="Search performance" subtitle="Clicks & impressions · last 28 days" action={<SiGooglesearchconsole className="h-4 w-4" style={{ color: "#458CF5" }} title="Google Search Console" />}>
              <TrendChart
                data={gsc!.trend!}
                xKey="date"
                xTickFormatter={fmtDay}
                labelFormatter={fmtDay}
                series={[
                  { key: "clicks", name: "Clicks", color: "chart-1" },
                  { key: "impressions", name: "Impressions", color: "chart-2" },
                ]}
                height={230}
                dots
              />
            </ChartCard>
          )}
          {gaLive && (ga!.trend?.length ?? 0) > 1 && (
            <ChartCard title="Website traffic" subtitle="Sessions & users · last 28 days" action={<SiGoogleanalytics className="h-4 w-4" style={{ color: "#E37400" }} title="Google Analytics" />}>
              <TrendChart
                data={ga!.trend!}
                xKey="date"
                xTickFormatter={fmtDay}
                labelFormatter={fmtDay}
                series={[
                  { key: "sessions", name: "Sessions", color: "chart-1" },
                  { key: "users", name: "Users", color: "chart-4" },
                ]}
                height={230}
                dots
              />
            </ChartCard>
          )}
        </div>
      ) : null}

      {/* Distributions — channels, devices, ranking spread */}
      {distCount > 0 && (
        <div className={cn("grid gap-2.5", colsClass(distCount))}>
          {channels.length > 0 && (
            <ChartCard title="Traffic channels" subtitle="Sessions by source">
              <BarList data={channels} categoryKey="channel" valueKey="sessions" color="chart-1" valueFormatter={fmtNum} />
            </ChartCard>
          )}
          {devices.length > 0 && (
            <ChartCard title="Device split" subtitle="Sessions by device">
              <DonutChart data={devices} nameKey="device" valueKey="sessions" centerLabel="sessions" centerValue={fmtNum(ga?.totals?.sessions)} height={200} />
            </ChartCard>
          )}
          {rankDist.some((r) => r.n > 0) && (
            <ChartCard title="Ranking distribution" subtitle="Where your keywords rank">
              <BarList data={rankDist} categoryKey="bucket" valueKey="n" color="chart-3" valueFormatter={fmtNum} />
            </ChartCard>
          )}
        </div>
      )}

      {/* Website speed — mobile + desktop (lazy) */}
      {(psiLoading || psi?.mobile || psi?.desktop) && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /><CardTitle className="text-base">Website speed</CardTitle></div>
            <CardDescription>Core Web Vitals & Lighthouse scores for your homepage.</CardDescription>
          </CardHeader>
          <CardContent>
            {psiLoading ? (
              <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                {[0, 1].map((c) => (
                  <div key={c} className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-[62px] w-[62px] rounded-full" />
                      <div className="space-y-1.5"><Skeleton className="h-4 w-20" /><Skeleton className="h-3 w-28" /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
                    <Skeleton className="h-3 w-48" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                <SpeedColumn label="Mobile" icon={Smartphone} data={psi?.mobile ?? null} />
                <div className="hidden w-px bg-border sm:block" />
                <SpeedColumn label="Desktop" icon={Monitor} data={psi?.desktop ?? null} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top search queries (detailed) + top countries */}
      {(queries.length > 0 || gaCountries.length > 0) && (
        <div className="grid gap-2.5 lg:grid-cols-3">
          {queries.length > 0 && (
            <Card className={gaCountries.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2"><SiGooglesearchconsole className="h-4 w-4" style={{ color: "#458CF5" }} /><CardTitle className="text-base">Top search queries</CardTitle></div>
                <CardDescription>Best-performing Google queries · last 28 days.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-20 bg-card text-left text-xs uppercase text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-4 py-2 font-medium">Query</th>
                        <th className="px-4 py-2 text-right font-medium">Clicks</th>
                        <th className="px-4 py-2 text-right font-medium">Impr.</th>
                        <th className="px-4 py-2 text-right font-medium">CTR</th>
                        <th className="px-4 py-2 text-center font-medium">Pos.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queries.map((q, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/40">
                          <td className="px-4 py-2 font-medium">{q.key}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtNum(q.clicks)}</td>
                          <td className="px-3 py-1.5"><BarCell value={q.impressions} max={qMax} color="chart-1" format={fmtNum} /></td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{pct(q.ctr)}</td>
                          <td className="px-4 py-2 text-center"><span className={cn("inline-block min-w-[2rem] rounded-md px-2 py-0.5 text-xs font-semibold", posBadge(q.position))}>{q.position.toFixed(1)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {gaCountries.length > 0 && (
            <ChartCard title="Top countries" subtitle="Sessions by country" className={queries.length > 0 ? undefined : "lg:col-span-3"}>
              <BarList data={gaCountries} categoryKey="country" valueKey="sessions" color="chart-4" valueFormatter={fmtNum} />
            </ChartCard>
          )}
        </div>
      )}

      {/* Top ranked keywords + competitors */}
      {(rankedKw.length > 0 || competitors.length > 0) && (
        <div className="grid gap-2.5 lg:grid-cols-3">
          {rankedKw.length > 0 && (
            <Card className={competitors.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /><CardTitle className="text-base">Top ranked keywords</CardTitle></div>
                <CardDescription>Keywords your site ranks for on Google.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-20 bg-card text-left text-xs uppercase text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-4 py-2 font-medium">Keyword</th>
                        <th className="px-4 py-2 text-center font-medium">Pos.</th>
                        <th className="px-4 py-2 text-right font-medium">Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedKw.map((k, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/40">
                          <td className="px-4 py-2 font-medium">{k.keyword}</td>
                          <td className="px-4 py-2 text-center"><span className={cn("inline-block min-w-[2rem] rounded-md px-2 py-0.5 text-xs font-semibold", posBadge(k.position))}>{k.position ?? "—"}</span></td>
                          <td className="px-3 py-1.5"><BarCell value={k.volume} max={kwMax} color="chart-1" format={fmtNum} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {competitors.length > 0 && (
            <Card className={rankedKw.length > 0 ? undefined : "lg:col-span-3"}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2"><Swords className="h-4 w-4 text-primary" /><CardTitle className="text-base">Top competitors</CardTitle></div>
                <CardDescription>Domains you compete with.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-20 bg-card text-left text-xs uppercase text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-4 py-2 font-medium">Domain</th>
                        <th className="px-4 py-2 text-right font-medium">Common</th>
                      </tr>
                    </thead>
                    <tbody>
                      {competitors.map((c, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/40">
                          <td className="px-4 py-2 font-medium">{c.domain}</td>
                          <td className="px-3 py-1.5"><BarCell value={c.commonKeywords} max={cMax} color="chart-1" format={fmtNum} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Top referring domains + top pages */}
      {(refDomains.length > 0 || topPages.length > 0) && (
        <div className="grid gap-2.5 lg:grid-cols-3">
          {refDomains.length > 0 && (
            <Card className={topPages.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" /><CardTitle className="text-base">Top referring domains</CardTitle></div>
                <CardDescription>Strongest domains linking to you.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 font-medium">Domain</th>
                      <th className="px-4 py-2 text-right font-medium">Backlinks</th>
                      <th className="px-4 py-2 text-right font-medium">Dofollow</th>
                      <th className="px-4 py-2 text-right font-medium">Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refDomains.map((d, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/40">
                        <td className="px-4 py-2 font-medium">{d.domain}</td>
                        <td className="px-3 py-1.5"><BarCell value={d.backlinks} max={rdMax} color="chart-4" format={fmtNum} /></td>
                        <td className="px-4 py-2 text-right tabular-nums text-chart-2">{fmtNum(d.dofollow)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{d.rank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
          {topPages.length > 0 && (
            <Card className={refDomains.length > 0 ? undefined : "lg:col-span-3"}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2"><Monitor className="h-4 w-4 text-primary" /><CardTitle className="text-base">Top pages</CardTitle></div>
                <CardDescription>Most-visited pages.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 font-medium">Page</th>
                      <th className="px-4 py-2 text-right font-medium">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPages.map((p, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/40">
                        <td className="max-w-[220px] truncate px-4 py-2 font-medium" title={p.path}>{p.path}</td>
                        <td className="px-3 py-1.5"><BarCell value={p.pageviews} max={pgMax} color="chart-2" format={fmtNum} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export function KeywordsPanel() {
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Enter a seed keyword, e.g. seo tools" className="pl-9" />
            </div>
            <Button className="sm:w-auto">Research</Button>
          </div>
        </CardContent>
      </Card>

      <EmptyState
        icon={Search}
        title="Discover keyword ideas"
        desc="Enter a seed keyword above to see search volume, difficulty, CPC, and intent."
      />
    </div>
  );
}

export function RanksPanel() {
  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <StatCard label="Tracked keywords" value="—" icon={Search} accent="blue" hint="None yet" />
        <StatCard label="Avg. position" value="—" icon={LineChart} accent="green" hint="None yet" />
        <StatCard label="Top 10 keywords" value="—" icon={Sparkles} accent="violet" hint="None yet" />
      </div>
      <EmptyState
        icon={LineChart}
        title="Track your keywords"
        desc="Add the keywords you want to rank for and we'll check their Google position every day."
      >
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add keywords
        </Button>
      </EmptyState>
    </div>
  );
}

function fmtNum(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(v >= 100_000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(v);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type BacklinksData = {
  connected: boolean;
  loaded?: boolean;
  summary?: {
    backlinks: number; referringDomains: number; referringMainDomains: number;
    dofollow: number; nofollow: number; brokenBacklinks: number; referringIps: number;
    spamScore: number; rank: number; referringPages: number;
  };
  referringDomains?: { domain: string; backlinks: number; rank: number; dofollow: number; firstSeen: string | null }[];
  backlinks?: { urlFrom: string; urlTo: string; domainFrom: string; anchor: string; dofollow: boolean; rank: number; firstSeen: string | null }[];
  tld?: Record<string, number>;
};

export function BacklinksPanel({ project, refreshNonce = 0, refreshMode = "live", base }: { project: Project; refreshNonce?: number; refreshMode?: "live" | "cached"; base?: string }) {
  const apiBase = base ?? `/projects/${project.id}`;
  const [data, setData] = useState<BacklinksData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (mode: "cached" | "live") => {
      setLoading(true);
      const q = mode === "cached" ? "?cachedOnly=1" : "?fresh=1";
      api
        .get<BacklinksData>(`${apiBase}/backlinks${q}`)
        .then((d) => (setData(d), setLoading(false)))
        .catch(() => (setData(null), setLoading(false)));
    },
    [project.id],
  );
  useEffect(() => { load("cached"); }, [load]);
  useEffect(() => { if (refreshNonce) load(refreshMode); }, [refreshNonce]);
  const reloadCached = useCallback(() => load("cached"), [load]);
  const warming = useWarmupPoll(isNewProject(project), data?.loaded === false, reloadCached);

  if (loading) {
    return (
      <div className="space-y-3">
        <KpiGridSkeleton count={4} />
        <div className="grid gap-2.5 sm:grid-cols-3">
          <TableCardSkeleton rows={2} title={false} />
          <TableCardSkeleton rows={2} title={false} />
          <TableCardSkeleton rows={3} title={false} />
        </div>
        <TableCardSkeleton rows={6} />
        <TableCardSkeleton rows={6} />
      </div>
    );
  }

  if (data?.loaded === false) {
    return warming ? <WarmingCard label="Backlink data" /> : <LoadDataCard label="Backlink data" onLoad={() => load("live")} />;
  }

  if (!data?.connected || !data.summary) {
    return (
      <EmptyState
        icon={Link2}
        title="Backlinks unavailable"
        desc="Backlink data is not available for this domain yet. It will appear here once the profile is fetched."
      />
    );
  }

  const s = data.summary;
  const refDomains = data.referringDomains ?? [];
  const links = data.backlinks ?? [];
  const rdBlMax = Math.max(1, ...refDomains.map((d) => d.backlinks));
  const tld = Object.entries(data.tld ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const tldMax = Math.max(1, ...tld.map(([, v]) => v));
  const spamTone = s.spamScore >= 40 ? "text-destructive" : s.spamScore >= 20 ? "text-chart-3" : "text-chart-2";

  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Backlinks" value={fmtNum(s.backlinks)} icon={Link2} accent="blue" hint={`${fmtNum(s.referringPages)} referring pages`} />
        <StatCard label="Referring domains" value={fmtNum(s.referringDomains)} icon={ExternalLink} accent="violet" hint={`${fmtNum(s.referringMainDomains)} main domains`} />
        <StatCard label="Dofollow" value={fmtNum(s.dofollow)} icon={Globe} accent="green" hint={`${fmtNum(s.nofollow)} nofollow`} />
        <StatCard label="Domain rank" value={String(s.rank)} icon={Gauge} accent="amber" hint={`${fmtNum(s.referringIps)} referring IPs`} />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Spam score</span>
              <span className={cn("font-semibold", spamTone)}>{s.spamScore}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", s.spamScore >= 40 ? "bg-destructive" : s.spamScore >= 20 ? "bg-chart-3" : "bg-chart-2")} style={{ width: `${Math.min(100, s.spamScore)}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Broken backlinks</span>
              <span className={cn("font-semibold", s.brokenBacklinks > 0 ? "text-chart-3" : "text-foreground")}>{fmtNum(s.brokenBacklinks)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Links pointing to pages that return errors.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 text-sm text-muted-foreground">Top referring TLDs</div>
            <div className="space-y-1.5">
              {tld.length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
              {tld.map(([name, v]) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 truncate text-xs text-muted-foreground">.{name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-chart-1" style={{ width: `${(v / tldMax) * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{fmtNum(v)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Referring domains</CardTitle>
          <CardDescription>Domains linking to {project.domain}, strongest first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-card text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">Domain</th>
                  <th className="px-4 py-2 text-right font-medium">Backlinks</th>
                  <th className="px-4 py-2 text-right font-medium">Dofollow</th>
                  <th className="px-4 py-2 text-right font-medium">Rank</th>
                </tr>
              </thead>
              <tbody>
                {refDomains.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No referring domains found.</td>
                  </tr>
                )}
                {refDomains.map((d) => (
                  <tr key={d.domain} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2">
                      <a href={`https://${d.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium hover:underline">
                        {d.domain}
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </a>
                    </td>
                    <td className="px-3 py-1.5"><BarCell value={d.backlinks} max={rdBlMax} color="chart-4" format={fmtNum} /></td>
                    <td className="px-4 py-2 text-right tabular-nums text-chart-2">{fmtNum(d.dofollow)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{d.rank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent backlinks</CardTitle>
          <CardDescription>Individual links pointing to your pages.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-card text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 font-medium">From</th>
                  <th className="px-4 py-2 font-medium">Anchor</th>
                  <th className="px-4 py-2 text-center font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">Rank</th>
                </tr>
              </thead>
              <tbody>
                {links.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No backlinks found.</td>
                  </tr>
                )}
                {links.map((b, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2">
                      <a href={b.urlFrom} target="_blank" rel="noreferrer" className="inline-flex max-w-[280px] items-center gap-1.5 truncate hover:underline" title={b.urlFrom}>
                        <span className="truncate font-medium">{b.domainFrom || hostOf(b.urlFrom)}</span>
                      </a>
                    </td>
                    <td className="px-4 py-2">
                      <span className="line-clamp-1 max-w-[260px] text-muted-foreground" title={b.anchor}>{b.anchor || "—"}</span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", b.dofollow ? "bg-chart-2/12 text-chart-2" : "bg-muted text-muted-foreground")}>
                        {b.dofollow ? "dofollow" : "nofollow"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{b.rank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AuditPanel({ project }: { project: Project }) {
  return (
    <EmptyState
      icon={FileSearch}
      title="Run your first site audit"
      desc={`We'll crawl ${project.domain} and report errors, warnings, and an overall health score.`}
    >
      <Button className="gap-2">
        <FileSearch className="h-4 w-4" />
        Run audit
      </Button>
    </EmptyState>
  );
}

export function SettingsPanel({ project }: { project: Project }) {
  const router = useRouter();
  const { removeProject, refresh } = useProjects();
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState(project.name);
  const [domain, setDomain] = useState(project.domain);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/projects/${project.id}`, { name: name.trim(), domain: domain.trim() });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
          <CardDescription>Update this project&apos;s name and domain.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={save}>
            <div className="space-y-2">
              <Label htmlFor="pname">Project name</Label>
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdomain">Domain</Label>
              <Input id="pdomain" value={domain} onChange={(e) => setDomain(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : saved ? "Saved" : "Save changes"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Delete project</CardTitle>
          <CardDescription>
            Permanently remove this project and its data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Are you sure?</span>
              <Button
                variant="destructive"
                onClick={() => {
                  removeProject(project.id);
                  router.push("/dashboard");
                }}
              >
                <Trash2 className="h-4 w-4" />
                Yes, delete
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="destructive" onClick={() => setConfirm(true)}>
              <Trash2 className="h-4 w-4" />
              Delete project
            </Button>
          )}
        </CardContent>
      </Card>

      {/* GitHub auto-fix PR connection — hidden in the UI for now
      <GithubConnectCard projectId={project.id} /> */}
    </div>
  );
}
