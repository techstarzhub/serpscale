"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  FileSearch,
  Loader2,
  RefreshCw,
  Download,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Bot,
  Type,
  FileText,
  Settings2,
  Gauge,
  ShieldCheck,
  Link2,
  X,
  Sparkles,
  Wrench,
  ListChecks,
  LayoutGrid,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Project } from "@/components/providers/projects-provider";
import { PageSpeedPanel, type PageSpeedData } from "./pagespeed-panel";
import { AuditHistory } from "./audit-history";
import { LinksPanel, type LinkGraph } from "./links-panel";
import { InsightsPanel } from "./insights-panel";
// GitHub auto-fix PR feature hidden for now — re-enable by uncommenting here and below.
// import { AutofixCard } from "./autofix-panel";
import { CrawlMap } from "./crawl-map";
import { RichText, streamAuditFix } from "@/components/copilot/copilot-core";

type CrawlStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
type Severity = "error" | "warning" | "notice";
interface IssueSummary {
  code: string;
  severity: Severity;
  category: string;
  message: string;
  count: number;
  scope?: "site" | "page";
}

// Site-wide checks aren't tied to a single page. New crawls carry scope:"site";
// older crawls are recognised by their known codes as a fallback.
const SITE_LEVEL_CODES = new Set(["site-no-https", "no-robots", "no-sitemap"]);
function isSiteLevel(s: { code: string; scope?: string }) {
  return s.scope === "site" || SITE_LEVEL_CODES.has(s.code);
}
interface Crawl {
  id: string;
  status: CrawlStatus;
  maxPages: number;
  pagesCrawled: number;
  healthScore: number | null;
  errors: number;
  warnings: number;
  notices: number;
  issuesSummary: IssueSummary[] | null;
  technologies: { name: string; category: string }[] | null;
  perfScore: number | null;
  lcpMs: number | null;
  clsScore: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
  pagespeed: PageSpeedData | null;
  linkGraph: LinkGraph | null;
  error: string | null;
  finishedAt: string | null;
}
interface CrawlPage {
  id: string;
  url: string;
  statusCode: number | null;
  title: string | null;
  wordCount: number | null;
  issueCount: number;
  issues: { code: string; severity: Severity; message: string }[];
}

const CATS: Record<string, { label: string; icon: LucideIcon }> = {
  crawlability: { label: "Crawlability", icon: Bot },
  indexability: { label: "Indexability", icon: FileSearch },
  onpage: { label: "On-page", icon: Type },
  content: { label: "Content", icon: FileText },
  technical: { label: "Technical", icon: Settings2 },
  performance: { label: "Performance", icon: Gauge },
  security: { label: "Security", icon: ShieldCheck },
  links: { label: "Links", icon: Link2 },
};

const SEV_DOT: Record<Severity, string> = {
  error: "bg-destructive",
  warning: "bg-chart-3",
  notice: "bg-muted-foreground",
};

function Donut({ value }: { value: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  const color = value >= 80 ? "hsl(var(--chart-2))" : value >= 50 ? "hsl(var(--chart-3))" : "hsl(var(--destructive))";
  return (
    <div className="relative grid h-28 w-28 shrink-0 place-items-center">
      <svg viewBox="0 0 112 112" className="h-28 w-28 -rotate-90">
        <circle cx="56" cy="56" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="11" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-[10px] text-muted-foreground">of 100</div>
      </div>
    </div>
  );
}

function StatusBadge({ code }: { code: number | null }) {
  const tone =
    code == null ? "bg-secondary text-muted-foreground"
      : code < 300 ? "bg-chart-2/12 text-chart-2"
        : code < 400 ? "bg-chart-3/15 text-chart-3"
          : "bg-destructive/10 text-destructive";
  return <span className={cn("inline-flex h-6 min-w-10 items-center justify-center rounded-md px-1.5 text-xs font-semibold", tone)}>{code ?? "ERR"}</span>;
}

// ---------------------------------------------------------------------------

export function SiteAudit({ project }: { project: Project }) {
  const [crawl, setCrawl] = useState<Crawl | null>(null); // completed results
  const [reRun, setReRun] = useState<Crawl | null>(null); // an in-progress re-run
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const speedTries = useRef(0);

  const fetchLatest = useCallback(() => api.get<Crawl | null>(`/projects/${project.id}/crawl/latest`), [project.id]);

  useEffect(() => {
    fetchLatest()
      .then((c) => {
        if (c && (c.status === "RUNNING" || c.status === "QUEUED")) setReRun(c);
        else setCrawl(c);
      })
      .catch(() => setCrawl(null))
      .finally(() => setLoading(false));
  }, [fetchLatest]);

  // Poll the in-progress crawl; also poll briefly after completion for page speed.
  const inProgress = reRun ?? (crawl && crawl.status !== "COMPLETED" && crawl.status !== "FAILED" && crawl.status !== "CANCELLED" ? crawl : null);
  const needSpeed = crawl?.status === "COMPLETED" && crawl.perfScore == null && speedTries.current < 20;

  useEffect(() => {
    if (!inProgress && !needSpeed) return;
    const iv = setInterval(async () => {
      try {
        const c = await fetchLatest();
        if (!c) return;
        if (c.status === "RUNNING" || c.status === "QUEUED") {
          if (reRun) setReRun(c);
          else setCrawl(c);
        } else {
          // finished
          setCrawl(c);
          setReRun(null);
          if (c.perfScore == null) speedTries.current += 1;
        }
      } catch {
        /* ignore */
      }
    }, needSpeed && !inProgress ? 3000 : 1500);
    return () => clearInterval(iv);
  }, [inProgress, needSpeed, reRun, fetchLatest]);

  async function runAudit() {
    setStarting(true);
    speedTries.current = 0;
    try {
      const c = await api.post<Crawl>(`/projects/${project.id}/crawl`, { maxPages: 1000 });
      if (crawl?.status === "COMPLETED") setReRun(c); // keep results, show banner
      else setCrawl(c);
    } catch {
      /* ignore */
    } finally {
      setStarting(false);
    }
  }

  const [cancelling, setCancelling] = useState(false);
  async function cancelAudit() {
    setCancelling(true);
    try {
      await api.post(`/projects/${project.id}/crawl/cancel`);
    } catch {
      /* ignore */
    }
    setReRun(null);
    try {
      setCrawl(await fetchLatest());
    } catch {
      setCrawl(null);
    }
    setCancelling(false);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // First-ever crawl in progress (no prior results) -> full progress view.
  if (!crawl && inProgress) return <ProgressCard crawl={inProgress} domain={project.domain} onCancel={cancelAudit} cancelling={cancelling} />;

  if (!crawl) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FileSearch className="h-7 w-7" />
          </span>
          <div className="space-y-1">
            <h3 className="font-heading text-base font-semibold">Run your first site audit</h3>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              We will crawl {project.domain} and produce a full report - errors, warnings, page speed, and more.
            </p>
          </div>
          <Button className="gap-2" disabled={starting} onClick={runAudit}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
            Run audit
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (crawl.status === "FAILED") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive"><AlertCircle className="h-7 w-7" /></span>
          <div className="space-y-1">
            <h3 className="font-heading text-base font-semibold">Audit failed</h3>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">{crawl.error || "Something went wrong while crawling."}</p>
          </div>
          <Button className="gap-2" disabled={starting} onClick={runAudit}><RefreshCw className="h-4 w-4" /> Try again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {reRun && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="font-medium text-primary">Re-crawling {project.domain}...</span>
          <span className="text-muted-foreground">{reRun.pagesCrawled} pages · showing your last report below</span>
        </div>
      )}
      <AuditReport crawl={crawl} onRerun={runAudit} rerunning={starting || !!reRun} projectId={project.id} />
    </div>
  );
}

function ProgressCard({ crawl, domain, onCancel, cancelling }: { crawl: Crawl; domain: string; onCancel?: () => void; cancelling?: boolean }) {
  const pct = crawl.maxPages > 0 ? Math.min(100, Math.round((crawl.pagesCrawled / crawl.maxPages) * 100)) : 0;
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Crawling {domain}...</p>
            <p className="text-xs text-muted-foreground">{crawl.pagesCrawled} pages crawled</p>
          </div>
          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel} disabled={cancelling}>
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Cancel
            </Button>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-destructive">{crawl.errors} errors</span>
          <span className="text-chart-3">{crawl.warnings} warnings</span>
          <span className="text-muted-foreground">{crawl.notices} notices</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

const AUDIT_VIEWS = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "issues", label: "Issues", icon: ListChecks },
  { key: "performance", label: "Performance", icon: Gauge },
  { key: "content", label: "Content & AI", icon: Bot },
  { key: "structure", label: "Structure", icon: Link2 },
  { key: "trends", label: "Trends", icon: TrendingUp },
] as const;
type AuditView = (typeof AUDIT_VIEWS)[number]["key"];

function AuditReport({ crawl, onRerun, rerunning, projectId }: { crawl: Crawl; onRerun: () => void; rerunning: boolean; projectId: string }) {
  const [codeFilter, setCodeFilter] = useState<{ code: string; label: string; site?: boolean } | null>(null);
  const [view, setView] = useState<AuditView>("overview");
  const summary = crawl.issuesSummary ?? [];

  // category -> issue count
  const byCat = new Map<string, number>();
  for (const s of summary) byCat.set(s.category, (byCat.get(s.category) ?? 0) + s.count);

  const health = crawl.healthScore ?? 0;
  const maxCat = Math.max(1, ...Array.from(byCat.values()));

  // Pages available for the per-page speed test: homepage + the most-linked pages.
  const psPages = (() => {
    const top = crawl.linkGraph?.topLinked ?? [];
    if (top.length === 0) return [];
    let home = top[0].url;
    try { home = new URL(top[0].url).origin; } catch { /* keep */ }
    const label = (u: string) => { try { const p = new URL(u).pathname; return p === "/" ? "Homepage" : p; } catch { return u; } };
    const seen = new Set([home, `${home}/`]);
    const rest = top.filter((p) => !seen.has(p.url)).slice(0, 15).map((p) => ({ url: p.url, label: label(p.url) }));
    return [{ url: home, label: "Homepage" }, ...rest];
  })();

  return (
    <div className="space-y-3">
      {/* Summary */}
      <Card>
        <CardContent className="flex flex-col items-center gap-5 p-5 sm:flex-row">
          <Donut value={health} />
          <div className="flex-1 text-center sm:text-left">
            <h3 className="font-heading text-lg font-semibold">
              Site health: {health >= 80 ? "Good" : health >= 50 ? "Needs work" : "Poor"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Crawled {crawl.pagesCrawled} pages {crawl.finishedAt ? `· ${new Date(crawl.finishedAt).toLocaleString()}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Metric label="Errors" value={crawl.errors} tone="bg-destructive/10 text-destructive" />
              <Metric label="Warnings" value={crawl.warnings} tone="bg-chart-3/15 text-chart-3" />
              <Metric label="Notices" value={crawl.notices} tone="bg-secondary text-muted-foreground" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`${API_BASE}/projects/${projectId}/report.pdf`}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
            >
              <Download className="h-4 w-4" />
              PDF
            </a>
            <Button variant="outline" className="gap-2" disabled={rerunning} onClick={onRerun}>
              {rerunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Re-run audit
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sub-navigation — one focused section at a time instead of a wall */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-1.5">
        {AUDIT_VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {v.label}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW: action plan + where issues sit ── */}
      {view === "overview" && <AuditPlan projectId={projectId} />}

      {/* Auto-fix → GitHub PR loop (connect lives in the Settings tab) — hidden for now
      <AutofixCard projectId={projectId} crawlId={crawl.id} /> */}

      {/* ── CONTENT & AI: readiness, accessibility, cannibalization ── */}
      {view === "content" && (
        <InsightsPanel
          aiReadiness={crawl.linkGraph?.aiReadiness}
          accessibility={crawl.linkGraph?.accessibility}
          cannibalization={crawl.linkGraph?.cannibalization}
          duplicateContent={crawl.linkGraph?.duplicateContent}
        />
      )}

      {/* ── TRENDS: history over time ── */}
      {view === "trends" && <AuditHistory projectId={projectId} />}

      {/* Category breakdown (Overview) */}
      {view === "overview" && (
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h4 className="font-heading text-sm font-semibold">Issues by category</h4>
          <p className="text-xs text-muted-foreground">Where the {crawl.errors + crawl.warnings + crawl.notices} findings sit across your site</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4">
          {Object.entries(CATS).map(([key, meta]) => {
            const Icon = meta.icon;
            const n = byCat.get(key) ?? 0;
            return (
              <div key={key} className="p-4 transition-colors hover:bg-secondary/40">
                <div className="flex items-center gap-3">
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", n > 0 ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <div className={cn("text-lg font-semibold leading-none", n > 0 ? "text-foreground" : "text-muted-foreground")}>{n}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{meta.label}</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${n > 0 ? Math.max(6, (n / maxCat) * 100) : 0}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* ── PERFORMANCE: Core Web Vitals ── */}
      {view === "performance" && (
      <PageSpeedPanel
        data={crawl.pagespeed}
        measuring={crawl.perfScore == null}
        scalarPerf={crawl.perfScore}
        projectId={projectId}
        pages={psPages}
      />
      )}

      {/* ── STRUCTURE: site map + internal linking + tech ── */}
      {view === "structure" && crawl.linkGraph?.nodes && crawl.linkGraph.nodes.length > 0 && <CrawlMap nodes={crawl.linkGraph.nodes} />}

      {view === "structure" && <LinksPanel linkGraph={crawl.linkGraph} />}

      {/* Detected technologies */}
      {view === "structure" && crawl.technologies && crawl.technologies.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 p-4">
            <span className="mr-1 text-sm font-semibold">Tech</span>
            {crawl.technologies.map((t) => (
              <span key={t.name} className="rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs font-medium" title={t.category}>
                {t.name}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* ── ISSUES: findings list + pages table ── */}
      {view === "issues" && (
      <div className="grid gap-3 lg:grid-cols-4">
        <Card className="self-start lg:sticky lg:top-20">
          <div className="border-b border-border p-4">
            <h4 className="font-heading text-sm font-semibold">Issues found</h4>
            <p className="text-xs text-muted-foreground">Click an issue to filter the pages</p>
          </div>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
            <button
              onClick={() => setCodeFilter(null)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-secondary",
                !codeFilter && "bg-secondary",
              )}
            >
              All pages
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold">{crawl.pagesCrawled}</span>
            </button>
            {summary.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No issues found.</p>
            ) : (
              summary.map((s) => {
                const site = isSiteLevel(s);
                return (
                  <button
                    key={s.code}
                    onClick={() => setCodeFilter({ code: s.code, label: s.message, site })}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-secondary",
                      codeFilter?.code === s.code && "bg-secondary",
                    )}
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", SEV_DOT[s.severity])} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.message}</span>
                      <span className="flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
                        {CATS[s.category]?.label ?? s.category}
                        {site && <span className="rounded bg-secondary px-1 py-px text-[10px] font-medium normal-case text-muted-foreground">Site-wide</span>}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-semibold text-foreground">{s.count}</span>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <div className="space-y-3 lg:col-span-3">
          {codeFilter && <AuditFix projectId={projectId} code={codeFilter.code} label={codeFilter.label} />}
          <PagesTable projectId={projectId} crawlId={crawl.id} codeFilter={codeFilter} onClearCode={() => setCodeFilter(null)} />
        </div>
      </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium", tone)}>
      {value}
      <span className="text-xs font-normal opacity-80">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------

const columns: ColumnDef<CrawlPage>[] = [
  { header: "Status", accessorKey: "statusCode", cell: ({ row }) => <StatusBadge code={row.original.statusCode} /> },
  {
    header: "URL",
    accessorKey: "url",
    cell: ({ row }) => (
      <a href={row.original.url} target="_blank" rel="noreferrer" className="inline-flex max-w-[380px] items-center gap-1 truncate text-sm text-foreground hover:text-primary" title={row.original.url}>
        <span className="truncate">{row.original.url.replace(/^https?:\/\//, "")}</span>
        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
      </a>
    ),
  },
  { header: "Title", accessorKey: "title", cell: ({ row }) => <span className="line-clamp-1 max-w-[240px] text-sm text-muted-foreground" title={row.original.title ?? ""}>{row.original.title || <span className="italic">missing</span>}</span> },
  { header: "Words", accessorKey: "wordCount", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.wordCount ?? "-"}</span> },
  {
    header: "Issues",
    accessorKey: "issueCount",
    cell: ({ row }) => {
      const n = row.original.issueCount;
      if (n === 0) return <span className="inline-flex items-center gap-1 text-sm text-chart-2"><CheckCircle2 className="h-4 w-4" /> OK</span>;
      const hasError = row.original.issues.some((i) => i.severity === "error");
      return (
        <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold", hasError ? "bg-destructive/10 text-destructive" : "bg-chart-3/15 text-chart-3")}>
          {n}
        </span>
      );
    },
  },
];

// Whole-audit prioritised AI action plan — one roadmap across all findings.
function AuditPlan({ projectId }: { projectId: string }) {
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function getPlan() {
    setLoading(true);
    setPlan(null);
    await streamAuditFix(
      `/projects/${projectId}/audit-plan/stream`,
      {},
      {
        onToken: (t) => { setLoading(false); setPlan(t); },
        onDone: (t) => { setLoading(false); setPlan(t); },
        onError: () => { setLoading(false); setPlan("Couldn't build a plan right now. Please try again."); },
      },
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <ListChecks className="h-[18px] w-[18px]" />
            </span>
            <div>
              <div className="text-sm font-semibold">AI action plan</div>
              <div className="text-xs text-muted-foreground">Every issue, prioritised by impact — what to fix first</div>
            </div>
          </div>
          {!plan && (
            <Button size="sm" onClick={getPlan} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Building plan…" : "Build action plan"}
            </Button>
          )}
        </div>
        {plan && (
          <>
            <div className="mt-3 border-t border-border pt-3 text-sm text-foreground">
              <RichText text={plan} />
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={getPlan} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Rebuild
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// AI-generated, stack-aware "how to fix" for the selected audit issue.
function AuditFix({ projectId, code, label }: { projectId: string; code: string; label: string }) {
  const [fix, setFix] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset whenever the selected issue changes.
  useEffect(() => {
    setFix(null);
  }, [code]);

  async function getFix() {
    setLoading(true);
    setFix(null);
    await streamAuditFix(
      `/projects/${projectId}/audit-fix/stream`,
      { code },
      {
        onToken: (t) => { setLoading(false); setFix(t); },
        onDone: (t) => { setLoading(false); setFix(t); },
        onError: () => { setLoading(false); setFix("Couldn't generate a fix right now. Please try again."); },
      },
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Wrench className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold">How to fix: {label}</div>
              <div className="text-xs text-muted-foreground">Tailored to your site&apos;s tech stack</div>
            </div>
          </div>
          {!fix && (
            <Button size="sm" onClick={getFix} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Thinking…" : "Get AI fix"}
            </Button>
          )}
        </div>
        {fix && (
          <>
            <div className="mt-3 border-t border-border pt-3 text-sm text-foreground">
              <RichText text={fix} />
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={getFix} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Regenerate
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Per-issue inline AI fix inside an expanded page row — streams the stack-aware fix
// for that one issue right where the user sees it in the table.
function RowIssueFix({ projectId, code }: { projectId: string; code: string }) {
  const [open, setOpen] = useState(false);
  const [fix, setFix] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setFix(null);
    await streamAuditFix(
      `/projects/${projectId}/audit-fix/stream`,
      { code },
      {
        onToken: (t) => { setLoading(false); setFix(t); },
        onDone: (t) => { setLoading(false); setFix(t); },
        onError: () => { setLoading(false); setFix("Couldn't generate a fix right now. Please try again."); },
      },
    );
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && fix == null && !loading) run();
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
      >
        <Wrench className="h-3 w-3" /> {open ? "Hide fix" : "AI fix"}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border bg-card p-3">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating a fix for your stack…
            </div>
          )}
          {fix && (
            <div className="text-sm text-foreground">
              <RichText text={fix} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PagesTable({ projectId, crawlId, codeFilter, onClearCode }: { projectId: string; crawlId: string; codeFilter: { code: string; label: string; site?: boolean } | null; onClearCode: () => void }) {
  const [rows, setRows] = useState<CrawlPage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const take = 25;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  useEffect(() => setPage(0), [codeFilter, q, issuesOnly]);

  useEffect(() => {
    // Site-wide issues have no per-page rows to fetch.
    if (codeFilter?.site) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ skip: String(page * take), take: String(take) });
      if (q.trim()) params.set("q", q.trim());
      if (issuesOnly) params.set("issuesOnly", "true");
      if (codeFilter) params.set("code", codeFilter.code);
      try {
        const res = await api.get<{ total: number; rows: CrawlPage[] }>(`/crawls/${crawlId}/pages?${params.toString()}`);
        setRows(res.rows);
        setTotal(res.total);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [crawlId, page, q, issuesOnly, codeFilter]);

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  const pageCount = Math.max(1, Math.ceil(total / take));

  // Site-wide issue: show an explainer instead of an empty pages table.
  if (codeFilter?.site) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <h4 className="font-heading text-base font-semibold">{codeFilter.label}</h4>
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">Site-wide</span>
            </div>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              This affects the whole domain, not a single page — so there are no individual pages to list. Fix it once at the site level.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onClearCode}>
            <ChevronLeft className="h-4 w-4" /> Back to all pages
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-2.5 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search URLs..." className="h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {codeFilter && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
              {codeFilter.label}
              <button onClick={onClearCode} aria-label="Clear filter"><X className="h-3.5 w-3.5" /></button>
            </span>
          )}
        </div>
        <label className="flex shrink-0 cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} />
          Only pages with issues
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="w-8" />
              {table.getHeaderGroups()[0].headers.map((h) => (
                <th key={h.id} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {Array.from({ length: columns.length + 1 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-[160px]" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length + 1} className="px-4 py-10 text-center text-sm text-muted-foreground">No pages found.</td></tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const p = row.original;
                const open = expanded.has(p.id);
                const hasIssues = p.issueCount > 0;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={cn(
                        "border-b border-border transition-colors",
                        hasIssues && "cursor-pointer hover:bg-secondary/50",
                        open && "bg-secondary/40",
                        !open && "last:border-0",
                      )}
                      onClick={() => hasIssues && toggle(p.id)}
                    >
                      <td className="pl-3">
                        {hasIssues && (
                          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} />
                        )}
                      </td>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-2.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                    {open && hasIssues && (
                      <tr className="border-b border-border bg-secondary/20 last:border-0">
                        <td colSpan={columns.length + 1} className="px-4 py-3">
                          <div className="space-y-2.5 pl-1">
                            {p.issues.map((iss, i) => (
                              <div key={i} className="text-sm">
                                <div className="flex flex-wrap items-center gap-2.5">
                                  <span className={cn("h-2 w-2 shrink-0 rounded-full", SEV_DOT[iss.severity])} />
                                  <span className="capitalize text-muted-foreground">{iss.severity}</span>
                                  <span className="text-foreground">{iss.message}</span>
                                  {iss.code && <RowIssueFix projectId={projectId} code={iss.code} />}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border p-3 text-sm">
        <span className="text-muted-foreground">{total} page{total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Page {page + 1} of {pageCount}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </Card>
  );
}
