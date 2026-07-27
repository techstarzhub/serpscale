"use client";

import { useEffect, useState } from "react";
import { Loader2, Zap, Smartphone, Monitor, CheckCircle2, Timer, Wrench, ChevronRight, ShieldCheck, FileText, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { GaugeChart } from "@/components/ui/charts";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { RichText, streamAuditFix } from "@/components/copilot/copilot-core";

interface AuditDetails {
  headings: { key: string; label: string; valueType: string }[];
  items: Record<string, string | number>[];
}

// ---- Shapes coming from the API (crawl.pagespeed) ----
interface Metric {
  value: number | null;
  display: string | null;
  score: number | null; // 0..1 Lighthouse score
}
interface FieldMetric {
  percentile: number | null;
  category: string | null;
}
interface StrategyReport {
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
  lab: { fcp: Metric; lcp: Metric; cls: Metric; tbt: Metric; speedIndex: Metric; tti: Metric; ttfb: Metric };
  field: {
    overall: string | null;
    lcp: FieldMetric | null;
    inp: FieldMetric | null;
    cls: FieldMetric | null;
    fcp: FieldMetric | null;
    ttfb: FieldMetric | null;
  } | null;
  opportunities: { id: string; title: string; description: string; savingsMs: number | null; savingsBytes: number | null; score: number | null; details: AuditDetails | null }[];
  diagnostics: { id: string; title: string; description: string; display: string | null; score: number | null; details: AuditDetails | null }[];
  audits: { id: string; category: string; title: string; description: string; display: string | null; score: number | null; details: AuditDetails | null }[];
  passedAudits: number;
}
export interface PageSpeedData {
  fetchedAt: string;
  mobile: StrategyReport | null;
  desktop: StrategyReport | null;
}

// ---- helpers ----
function scoreTone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v >= 90) return "text-chart-2";
  if (v >= 50) return "text-chart-3";
  return "text-destructive";
}
function rating(score: number | null) {
  if (score == null) return { label: "—", cls: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground" };
  if (score >= 0.9) return { label: "Good", cls: "bg-chart-2/12 text-chart-2", dot: "bg-chart-2" };
  if (score >= 0.5) return { label: "Needs work", cls: "bg-chart-3/15 text-chart-3", dot: "bg-chart-3" };
  return { label: "Poor", cls: "bg-destructive/12 text-destructive", dot: "bg-destructive" };
}
function fieldTone(cat: string | null) {
  const c = (cat || "").toUpperCase();
  if (c === "FAST" || c === "GOOD") return { label: "Good", cls: "bg-chart-2/12 text-chart-2", dot: "bg-chart-2" };
  if (c === "AVERAGE" || c === "NEEDS_IMPROVEMENT") return { label: "Needs work", cls: "bg-chart-3/15 text-chart-3", dot: "bg-chart-3" };
  if (c === "SLOW" || c === "POOR") return { label: "Poor", cls: "bg-destructive/12 text-destructive", dot: "bg-destructive" };
  return { label: "—", cls: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground" };
}
function fmtMsVal(ms: number | null) {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

const CATEGORY_CARDS = [
  { key: "performance", label: "Performance" },
  { key: "accessibility", label: "Accessibility" },
  { key: "bestPractices", label: "Best Practices" },
  { key: "seo", label: "SEO" },
] as const;

// Per-metric thresholds (Google's good / needs-improvement boundaries) for the meter.
const VITALS = [
  { key: "lcp", label: "LCP", full: "Largest Contentful Paint", good: 2500, ni: 4000, max: 6000 },
  { key: "cls", label: "CLS", full: "Cumulative Layout Shift", good: 0.1, ni: 0.25, max: 0.4 },
  { key: "tbt", label: "TBT", full: "Total Blocking Time", good: 200, ni: 600, max: 1000 },
  { key: "fcp", label: "FCP", full: "First Contentful Paint", good: 1800, ni: 3000, max: 4500 },
  { key: "speedIndex", label: "Speed Index", full: "Speed Index", good: 3400, ni: 5800, max: 8000 },
  { key: "ttfb", label: "TTFB", full: "Time to First Byte", good: 800, ni: 1800, max: 2500 },
] as const;

// A threshold meter: green (good) / amber (needs work) / red (poor) with a marker.
function Meter({ value, good, ni, max }: { value: number | null; good: number; ni: number; max: number }) {
  const g = Math.min((good / max) * 100, 100);
  const n = Math.min((ni / max) * 100, 100);
  const pos = value == null ? null : Math.min(Math.max((value / max) * 100, 1.5), 98.5);
  return (
    <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full">
      <div className="absolute inset-y-0 left-0 bg-chart-2/35" style={{ width: `${g}%` }} />
      <div className="absolute inset-y-0 bg-chart-3/35" style={{ left: `${g}%`, width: `${n - g}%` }} />
      <div className="absolute inset-y-0 bg-destructive/35" style={{ left: `${n}%`, right: 0 }} />
      {pos != null && (
        <span className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" style={{ left: `${pos}%` }} />
      )}
    </div>
  );
}

function CardShell({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h4 className="font-heading text-sm font-semibold">{title}</h4>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

// Human-readable formatting per Lighthouse valueType.
function fmtBytes(n: number) {
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${Math.round(n)} B`;
}
function fmtMs(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
}
function isNumericType(t: string) {
  return ["bytes", "ms", "timespanMs", "numeric", "millisecond"].includes(t);
}
function fmtCell(v: string | number, valueType: string): string {
  if (v === "" || v == null) return "—";
  if (typeof v === "number") {
    if (valueType === "bytes") return fmtBytes(v);
    if (valueType === "ms" || valueType === "timespanMs" || valueType === "millisecond") return fmtMs(v);
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(v);
}
const isUrl = (v: string | number) => typeof v === "string" && /^https?:\/\//i.test(v);
// Shorten a URL to its path + filename for readability (full URL kept in title / link).
function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    const path = url.pathname === "/" ? "/" : url.pathname;
    return `${url.hostname}${path}${url.search ? "?…" : ""}`;
  } catch {
    return u;
  }
}

// Full details table — units, right-aligned numbers, and magnitude bars behind
// numeric columns so the biggest offenders visually stand out.
function DetailsTable({ details }: { details: AuditDetails }) {
  // Column maxima for the magnitude bars.
  const maxes: Record<string, number> = {};
  for (const h of details.headings) {
    if (isNumericType(h.valueType)) {
      maxes[h.key] = Math.max(1, ...details.items.map((it) => (typeof it[h.key] === "number" ? (it[h.key] as number) : 0)));
    }
  }
  return (
    <div className="overflow-x-auto border-t border-border bg-secondary/20">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            {details.headings.map((h) => (
              <th key={h.key} className={cn("whitespace-nowrap px-3 py-2 font-medium", isNumericType(h.valueType) ? "text-right" : "text-left")}>
                {h.label || h.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {details.items.map((it, i) => (
            <tr key={i} className="border-t border-border/60 align-top even:bg-background/40">
              {details.headings.map((h) => {
                const v = it[h.key] ?? "";
                const numeric = isNumericType(h.valueType);
                if (numeric) {
                  const n = typeof v === "number" ? v : 0;
                  const pct = maxes[h.key] ? (n / maxes[h.key]) * 100 : 0;
                  return (
                    <td key={h.key} className="relative px-3 py-2 text-right tabular-nums">
                      <span className="absolute inset-y-1 right-0 rounded-l bg-chart-3/15" style={{ width: `${Math.max(pct, 2)}%` }} />
                      <span className="relative font-medium">{fmtCell(v, h.valueType)}</span>
                    </td>
                  );
                }
                return (
                  <td key={h.key} className="max-w-[360px] px-3 py-2">
                    {isUrl(v) ? (
                      <a href={String(v)} target="_blank" rel="noreferrer" className="block truncate text-primary hover:underline" title={String(v)}>
                        {shortUrl(String(v))}
                      </a>
                    ) : (
                      <span className="block break-words" title={String(v)}>{v === "" ? "—" : String(v)}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A finding row that expands to reveal its details table and a stack-aware AI fix.
function ExpandableRow({
  title,
  description,
  badge,
  dot,
  details,
  projectId,
  category,
  display,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  dot?: string;
  details: AuditDetails | null;
  projectId?: string;
  category?: string;
  display?: string;
}) {
  const [open, setOpen] = useState(false);
  const [fix, setFix] = useState<string | null>(null);
  const [loadingFix, setLoadingFix] = useState(false);
  const has = !!details && details.items.length > 0;
  // Expandable if there's a details table OR we can generate an AI fix for it.
  const canExpand = has || !!projectId;

  async function getFix() {
    if (!projectId) return;
    setLoadingFix(true);
    setFix(null);
    // Ground the AI in the real affected resources (actual URLs / selectors + a
    // key metric) instead of letting it invent file names and sizes.
    const evidence = (details?.items ?? []).slice(0, 12).map((it) => {
      const cells = details!.headings.map((h) => {
        const v = it[h.key];
        return v === "" || v == null ? "" : String(v);
      });
      return cells.filter(Boolean).join(" — ");
    }).filter(Boolean);
    await streamAuditFix(
      `/projects/${projectId}/lighthouse-fix/stream`,
      { title, description, category, display, evidence },
      {
        onToken: (t) => { setLoadingFix(false); setFix(t); },
        onDone: (t) => { setLoadingFix(false); setFix(t); },
        onError: () => { setLoadingFix(false); setFix("Couldn't generate a fix right now. Please try again."); },
      },
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => canExpand && setOpen((o) => !o)}
        className={cn("flex w-full items-start gap-2 p-3 text-left transition-colors", canExpand ? "cursor-pointer hover:bg-secondary/40" : "cursor-default")}
      >
        {canExpand ? (
          <ChevronRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        ) : dot ? (
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot)} />
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{title}</p>
            <div className="flex shrink-0 items-center gap-2">
              {has && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{details!.items.length} items</span>}
              {projectId && (
                <span className="hidden items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary sm:inline-flex">
                  <Wrench className="h-3 w-3" /> AI fix
                </span>
              )}
              {badge}
            </div>
          </div>
          {description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description}</p>}
        </div>
      </button>
      {/* AI fix sits ABOVE the details table so it's visible the moment the row
          opens — big tables (12-19 rows) used to bury the "Get AI fix" button. */}
      {open && projectId && (
        <div className="border-t border-border bg-secondary/20 px-3 py-3">
          {!fix && !loadingFix && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={getFix}>
                <Sparkles className="h-4 w-4" /> Get AI fix
              </Button>
              <span className="text-xs text-muted-foreground">Step-by-step fix tailored to your stack</span>
            </div>
          )}
          {loadingFix && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating a fix for your stack…
            </div>
          )}
          {!loadingFix && fix && (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Wrench className="h-3.5 w-3.5" /> How to fix this
              </div>
              <div className="mt-2 text-sm text-foreground">
                <RichText text={fix} />
              </div>
              <Button variant="ghost" size="sm" className="mt-2" onClick={getFix}>
                <RefreshCw className="h-4 w-4" /> Regenerate
              </Button>
            </>
          )}
        </div>
      )}
      {open && has && <DetailsTable details={details!} />}
    </div>
  );
}

export function PageSpeedPanel({
  data,
  measuring,
  scalarPerf,
  projectId,
  pages = [],
}: {
  data: PageSpeedData | null;
  measuring: boolean;
  scalarPerf: number | null;
  projectId?: string;
  pages?: { url: string; label: string }[];
}) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  // Per-page speed test: the first option is the homepage (uses stored data);
  // any other page is fetched live from PageSpeed on demand.
  const homeUrl = pages[0]?.url ?? "";
  const [selUrl, setSelUrl] = useState(homeUrl);
  const isHome = !selUrl || selUrl === homeUrl;
  const [remote, setRemote] = useState<PageSpeedData | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(false);

  useEffect(() => {
    if (isHome || !projectId) {
      setRemote(null);
      return;
    }
    let alive = true;
    setLoadingRemote(true);
    api
      .get<PageSpeedData>(`/projects/${projectId}/pagespeed?url=${encodeURIComponent(selUrl)}`)
      .then((d) => alive && setRemote(d))
      .catch(() => alive && setRemote(null))
      .finally(() => alive && setLoadingRemote(false));
    return () => {
      alive = false;
    };
  }, [selUrl, isHome, projectId]);

  const activeData = isHome ? data : remote;

  const PageSelect = pages.length > 1 && projectId ? (
    <Combobox
      value={selUrl}
      onChange={setSelUrl}
      options={pages.map((p) => ({ value: p.url, label: p.label }))}
      searchPlaceholder="Search pages…"
      align="end"
      className="w-[200px]"
      icon={<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
    />
  ) : null;

  // Loading (either the initial crawl measurement, or an on-demand page test).
  if (loadingRemote || (!activeData && isHome)) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-heading text-sm font-semibold">Performance & Core Web Vitals</span>
          </div>
          {PageSelect}
        </div>
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          {loadingRemote ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Testing this page with Google PageSpeed (mobile + desktop)…</>
          ) : measuring ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Measuring with Google PageSpeed (mobile + desktop)…</>
          ) : scalarPerf === 0 ? (
            "Performance data unavailable for this crawl. Re-run the audit to fetch fresh data."
          ) : (
            "Re-run the audit to load Core Web Vitals, opportunities and diagnostics."
          )}
        </p>
      </div>
    );
  }
  if (!activeData) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /><span className="font-heading text-sm font-semibold">Performance</span></div>
          {PageSelect}
        </div>
        <p className="p-4 text-sm text-muted-foreground">No PageSpeed data for this page.</p>
      </div>
    );
  }

  // Pick the selected device, falling back to whichever strategy succeeded.
  const report = activeData[device] ?? activeData.mobile ?? activeData.desktop;
  const activeDevice = activeData[device] ? device : activeData.mobile ? "mobile" : "desktop";
  if (!report) return null;

  const f = report.field;
  const hasField = !!f && !!(f.lcp || f.inp || f.cls);

  const DeviceToggle = (
    <div className="flex items-center gap-2">
      {PageSelect}
      <div className="inline-flex gap-0.5 rounded-lg border border-border bg-secondary/50 p-0.5">
        {(["mobile", "desktop"] as const).map((d) => {
          const Icon = d === "mobile" ? Smartphone : Monitor;
          const disabled = !activeData[d];
          return (
            <button
              key={d}
              disabled={disabled}
              onClick={() => setDevice(d)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                activeDevice === d ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                disabled && "cursor-not-allowed opacity-40",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {d}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Scores */}
      <CardShell title="Lighthouse scores" sub={`Analyzed on ${activeDevice}`} right={DeviceToggle}>
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
          {CATEGORY_CARDS.map((c) => {
            const v = report.scores[c.key];
            return (
              <div key={c.key} className="flex flex-col items-center rounded-lg border border-border bg-secondary/20 p-2">
                <GaugeChart value={v ?? 0} label="" height={116} />
                <span className={cn("mt-1 text-center text-xs font-semibold", scoreTone(v))}>{c.label}</span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-chart-2" /> 90–100</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-chart-3" /> 50–89</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" /> 0–49</span>
          <span className="ml-auto flex items-center gap-1 text-chart-2"><CheckCircle2 className="h-3.5 w-3.5" /> {report.passedAudits} audits passed</span>
        </div>
      </CardShell>

      {/* Core Web Vitals with threshold meters */}
      <CardShell title="Core Web Vitals" sub={`Lab data · ${activeDevice}`}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {VITALS.map((v) => {
            const m = report.lab[v.key];
            const r = rating(m?.score ?? null);
            return (
              <div key={v.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground" title={v.full}>{v.label}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", r.cls)}>{r.label}</span>
                </div>
                <div className="mt-1 text-xl font-semibold leading-none">{m?.display ?? "—"}</div>
                <Meter value={m?.value ?? null} good={v.good} ni={v.ni} max={v.max} />
              </div>
            );
          })}
        </div>
      </CardShell>

      {/* Real-user field data (CrUX) — only when Google has it */}
      {hasField && (
        <CardShell
          title="Real-user experience"
          sub="Chrome UX Report · last 28 days"
          right={f!.overall ? <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", fieldTone(f!.overall).cls)}>{fieldTone(f!.overall).label}</span> : undefined}
        >
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { k: "lcp", label: "LCP", m: f!.lcp, fmt: (n: number) => fmtMsVal(n) },
              { k: "inp", label: "INP", m: f!.inp, fmt: (n: number) => `${Math.round(n)} ms` },
              { k: "cls", label: "CLS", m: f!.cls, fmt: (n: number) => (n / 100).toFixed(2) },
              { k: "fcp", label: "FCP", m: f!.fcp, fmt: (n: number) => fmtMsVal(n) },
              { k: "ttfb", label: "TTFB", m: f!.ttfb, fmt: (n: number) => fmtMsVal(n) },
            ]
              .filter((x) => x.m)
              .map((x) => {
                const t = fieldTone(x.m!.category);
                return (
                  <div key={x.k} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">{x.label}</span>
                      <span className={cn("h-2 w-2 rounded-full", t.dot)} />
                    </div>
                    <div className="mt-2 text-base font-semibold leading-none">{x.m!.percentile != null ? x.fmt(x.m!.percentile) : "—"}</div>
                    <div className={cn("mt-1 text-xs", t.cls.split(" ")[1])}>{t.label}</div>
                  </div>
                );
              })}
          </div>
        </CardShell>
      )}

      {/* Opportunities — expandable to show affected resources */}
      <CardShell
        title="Opportunities"
        sub="Fixes that save load time · click a row for details"
        right={<span className="flex items-center gap-1.5 rounded-md bg-chart-3/12 px-2 py-1 text-xs font-semibold text-chart-3"><Timer className="h-3.5 w-3.5" /> {report.opportunities.length}</span>}
      >
        {report.opportunities.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No major opportunities — nicely optimised.</p>
        ) : (
          <div className="divide-y divide-border">
            {report.opportunities.map((o) => (
              <ExpandableRow
                key={o.id}
                title={o.title}
                description={o.description}
                details={o.details}
                projectId={projectId}
                category="performance"
                badge={o.savingsMs != null && o.savingsMs > 0 ? <span className="rounded-md bg-chart-3/12 px-2 py-0.5 text-xs font-semibold text-chart-3">−{fmtMsVal(o.savingsMs)}</span> : undefined}
              />
            ))}
          </div>
        )}
      </CardShell>

      {/* Diagnostics — expandable */}
      <CardShell
        title="Diagnostics"
        sub="More about the page's performance · click a row for details"
        right={<span className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground"><Wrench className="h-3.5 w-3.5" /> {report.diagnostics.length}</span>}
      >
        {report.diagnostics.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No diagnostics to show.</p>
        ) : (
          <div className="divide-y divide-border">
            {report.diagnostics.map((d) => (
              <ExpandableRow
                key={d.id}
                title={d.title}
                description={d.description}
                details={d.details}
                dot={rating(d.score).dot}
                projectId={projectId}
                category="performance"
                display={d.display ?? undefined}
                badge={d.display ? <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">{d.display}</span> : undefined}
              />
            ))}
          </div>
        )}
      </CardShell>

      {/* Accessibility / SEO / Best-Practices failing audits — expandable */}
      {report.audits.length > 0 && (
        <CardShell
          title="Accessibility, SEO & Best Practices"
          sub={`${report.audits.length} checks to fix · click a row to see exactly what's affected`}
          right={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="divide-y divide-border">
            {report.audits.map((au) => (
              <ExpandableRow
                key={au.id}
                title={au.title}
                description={au.description}
                details={au.details}
                dot={rating(au.score).dot}
                projectId={projectId}
                category={au.category}
                display={au.display ?? undefined}
                badge={
                  <span className="flex items-center gap-1.5">
                    {au.display && <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">{au.display}</span>}
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{au.category}</span>
                  </span>
                }
              />
            ))}
          </div>
        </CardShell>
      )}
    </div>
  );
}
