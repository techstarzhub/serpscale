"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, RefreshCw, Trash2, ArrowUp, ArrowDown, Minus, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InlineStats, posBadgeClass } from "@/components/ui/metric";
import { api } from "@/lib/api";
import type { Project } from "@/components/providers/projects-provider";

interface Tracked {
  id: string;
  keyword: string;
  country: string;
  device: string;
  lastCheckedAt: string | null;
  position: number | null;
  url: string | null;
  delta: number | null;
  best: number | null;
  history: { position: number | null; at: string }[];
}

// Tiny inline sparkline of rank positions (lower = better, so we invert).
function Sparkline({ history }: { history: { position: number | null }[] }) {
  const pts = history.filter((h) => h.position != null).map((h) => h.position as number);
  if (pts.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const max = Math.max(...pts, 10);
  const w = 90, h = 26;
  const step = w / (pts.length - 1);
  const y = (p: number) => 2 + (Math.min(p, 100) / Math.max(max, 100)) * (h - 4); // higher position number = lower on chart
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Delta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0)
    return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" /></span>;
  const up = delta > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-chart-2" : "text-destructive")}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta)}
    </span>
  );
}

// "2h ago" style relative time for the last automatic update.
function timeAgo(d: Date | null): string {
  if (!d) return "not checked yet";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 90) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function TrackedKeywords({ project, base, readOnly = false }: { project: Project; base?: string; readOnly?: boolean }) {
  const apiBase = base ?? `/projects/${project.id}`;
  const [rows, setRows] = useState<Tracked[]>([]);
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () =>
    api
      .get<Tracked[]>(`${apiBase}/rank-keywords`)
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function add() {
    const text = kw.trim();
    if (!text) return;
    setAdding(true);
    try {
      await api.post(`/projects/${project.id}/rank-keywords`, { keyword: text });
      setKw("");
      // Give the first live check a moment, then reload.
      setTimeout(load, 1200);
      await load();
    } catch {
      /* ignore */
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    try {
      await api.del(`/projects/${project.id}/rank-keywords/${id}`);
    } catch {
      load();
    }
  }

  const posLabel = (p: number | null) => (p == null ? "> 100" : `#${p}`);

  // At-a-glance summary of the tracked set (all derived from live daily checks).
  const inTop10 = rows.filter((r) => r.position != null && r.position <= 10).length;
  const improved = rows.filter((r) => (r.delta ?? 0) > 0).length;
  const bestOverall = rows.reduce<number | null>(
    (b, r) => (r.position != null && (b == null || r.position < b) ? r.position : b),
    null,
  );
  // Most recent automatic check across all tracked keywords.
  const lastUpdated = rows.reduce<Date | null>((latest, r) => {
    if (!r.lastCheckedAt) return latest;
    const d = new Date(r.lastCheckedAt);
    return !latest || d > latest ? d : latest;
  }, null);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" /> Tracked keywords
          </CardTitle>
          <CardDescription>Google positions update automatically every day. Add keywords to build rank history.</CardDescription>
        </div>
        {rows.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-secondary/50 px-2.5 py-1 text-xs text-muted-foreground" title="Positions refresh automatically once a day">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Updated {timeAgo(lastUpdated)}</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {!readOnly && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
            className="flex gap-2"
          >
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="Add a keyword to track (e.g. best running shoes)"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <Button type="submit" disabled={adding || !kw.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Track
            </Button>
          </form>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No keywords tracked yet. Add one above.</div>
        ) : (
          <div className="space-y-4">
            <InlineStats
              items={[
                { label: "Tracked", value: String(rows.length) },
                { label: "In top 10", value: String(inTop10), tone: inTop10 ? "text-chart-2" : undefined },
                { label: "Improved", value: String(improved), tone: improved ? "text-chart-2" : undefined },
                { label: "Best", value: bestOverall != null ? `#${bestOverall}` : "—" },
              ]}
            />
            <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2.5 pl-4 pr-3 font-medium">Keyword</th>
                  <th className="py-2.5 pr-3 font-medium">Position</th>
                  <th className="py-2.5 pr-3 font-medium">Change</th>
                  <th className="py-2.5 pr-3 font-medium">Best</th>
                  <th className="py-2.5 pr-3 font-medium">Trend</th>
                  <th className="py-2.5 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/30">
                    <td className="py-2.5 pl-4 pr-3">
                      <div className="font-medium">{r.keyword}</div>
                      {r.url && <div className="max-w-[220px] truncate text-xs text-muted-foreground">{r.url}</div>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={cn("inline-block min-w-[2.75rem] rounded-md px-2 py-0.5 text-center text-xs font-semibold", posBadgeClass(r.position))}>
                        {posLabel(r.position)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3"><Delta delta={r.delta} /></td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{posLabel(r.best)}</td>
                    <td className="py-2.5 pr-3"><Sparkline history={r.history} /></td>
                    <td className="py-2.5 pr-4 text-right">
                      {!readOnly && (
                        <button onClick={() => remove(r.id)} className="text-muted-foreground transition-colors hover:text-destructive" title="Stop tracking">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
