"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, TrendingUp, TrendingDown, Minus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { TrendChart, ChartCard, compact } from "@/components/ui/charts";

interface CrawlHistoryItem {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  pagesCrawled: number;
  healthScore: number | null;
  errors: number;
  warnings: number;
  notices: number;
  perfScore: number | null;
  lcpMs: number | null;
  clsScore: number | null;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${mo[d.getMonth()]} ${d.getDate()}`;
}
// Axis label: date, plus time when several audits fall on the same day.
function fmtAxis(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function healthTone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v >= 80) return "text-chart-2";
  if (v >= 50) return "text-chart-3";
  return "text-destructive";
}

// Small delta chip comparing a value to the previous audit.
function Delta({ curr, prev, invert }: { curr: number | null; prev: number | null; invert?: boolean }) {
  if (curr == null || prev == null) return null;
  const diff = curr - prev;
  if (diff === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" /></span>;
  // For health/perf, up is good. For issues (invert), down is good.
  const good = invert ? diff < 0 : diff > 0;
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-chart-2" : "text-destructive")}>
      <Icon className="h-3 w-3" /> {Math.abs(diff)}
    </span>
  );
}

export function AuditHistory({ projectId, refreshKey }: { projectId: string; refreshKey?: number }) {
  const [items, setItems] = useState<CrawlHistoryItem[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.get<CrawlHistoryItem[]>(`/projects/${projectId}/crawl/history`));
    } catch {
      setItems([]);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Chronological (oldest first) for the charts.
  const series = useMemo(() => (items ? [...items].reverse().map((c) => ({
    date: c.finishedAt || c.startedAt,
    health: c.healthScore ?? 0,
    errors: c.errors,
    warnings: c.warnings,
    notices: c.notices,
    perf: c.perfScore ?? 0,
  })) : []), [items]);

  if (items === null) return <Skeleton className="h-24 rounded-xl" />;
  if (items.length < 2) return null; // need at least 2 audits to trend

  const latest = items[0];
  const best = items.reduce((m, c) => Math.max(m, c.healthScore ?? 0), 0);
  const avg = Math.round(items.reduce((s, c) => s + (c.healthScore ?? 0), 0) / items.length);
  // Tighten the health axis so small changes are visible; widen the label to a
  // time when every audit landed on the same calendar day.
  const healthMin = Math.max(0, Math.min(...items.map((c) => c.healthScore ?? 100)) - 10);
  const days = new Set(items.map((c) => new Date(c.finishedAt || c.startedAt).toDateString()));
  const sameDay = days.size === 1;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><History className="h-4 w-4" /></span>
          <div>
            <h4 className="font-heading text-sm font-semibold">Audit history & trends</h4>
            <p className="text-xs text-muted-foreground">{items.length} audits · track progress over time</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-4 sm:flex">
            <Stat label="Latest" value={latest.healthScore} />
            <Stat label="Best" value={best} />
            <Stat label="Average" value={avg} />
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <ChartCard title="Site health over time" subtitle="Higher is better">
              <TrendChart
                data={series}
                xKey="date"
                xTickFormatter={sameDay ? fmtAxis : fmtDate}
                labelFormatter={fmtDateTime}
                series={[{ key: "health", name: "Health", color: "chart-2" }]}
                yDomain={[healthMin, 100]}
                dots
                height={220}
              />
            </ChartCard>
            <ChartCard title="Issues over time" subtitle="Errors, warnings & notices per audit">
              <TrendChart
                data={series}
                xKey="date"
                type="line"
                xTickFormatter={sameDay ? fmtAxis : fmtDate}
                labelFormatter={fmtDateTime}
                dots
                series={[
                  { key: "errors", name: "Errors", color: "destructive" },
                  { key: "warnings", name: "Warnings", color: "chart-3" },
                  { key: "notices", name: "Notices", color: "chart-1" },
                ]}
                height={220}
              />
            </ChartCard>
          </div>

          {/* Past audits table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Pages</th>
                  <th className="px-3 py-2 font-semibold">Health</th>
                  <th className="px-3 py-2 font-semibold">Errors</th>
                  <th className="px-3 py-2 font-semibold">Warnings</th>
                  <th className="px-3 py-2 font-semibold">Notices</th>
                  <th className="px-3 py-2 font-semibold">Perf</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c, i) => {
                  const prev = items[i + 1];
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0 even:bg-secondary/20">
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{fmtDateTime(c.finishedAt || c.startedAt)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.pagesCrawled}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <span className={cn("font-semibold", healthTone(c.healthScore))}>{c.healthScore ?? "—"}</span>
                          {prev && <Delta curr={c.healthScore} prev={prev.healthScore} />}
                        </span>
                      </td>
                      <td className="px-3 py-2"><span className="flex items-center gap-1.5"><span className={c.errors > 0 ? "text-destructive" : "text-muted-foreground"}>{c.errors}</span>{prev && <Delta curr={c.errors} prev={prev.errors} invert />}</span></td>
                      <td className="px-3 py-2"><span className="flex items-center gap-1.5"><span className="text-muted-foreground">{c.warnings}</span>{prev && <Delta curr={c.warnings} prev={prev.warnings} invert />}</span></td>
                      <td className="px-3 py-2 text-muted-foreground">{c.notices}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5"><span className={healthTone(c.perfScore)}>{c.perfScore ?? "—"}</span>{prev && <Delta curr={c.perfScore} prev={prev.perfScore} />}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="text-right">
      <div className={cn("text-base font-semibold leading-none", healthTone(value))}>{value ?? "—"}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
