"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, RefreshCw, Trash2, ArrowUp, ArrowDown, Minus, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export function TrackedKeywords({ project }: { project: Project }) {
  const [rows, setRows] = useState<Tracked[]>([]);
  const [loading, setLoading] = useState(true);
  const [kw, setKw] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = () =>
    api
      .get<Tracked[]>(`/projects/${project.id}/rank-keywords`)
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

  async function refresh() {
    setRefreshing(true);
    try {
      await api.post(`/projects/${project.id}/rank-keywords/refresh`);
      await load();
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }

  const posLabel = (p: number | null) => (p == null ? "> 100" : `#${p}`);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" /> Tracked keywords
          </CardTitle>
          <CardDescription>Google positions checked automatically every day. Add keywords to build rank history.</CardDescription>
        </div>
        {rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh now
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
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

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No keywords tracked yet. Add one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Keyword</th>
                  <th className="py-2 pr-3 font-medium">Position</th>
                  <th className="py-2 pr-3 font-medium">Change</th>
                  <th className="py-2 pr-3 font-medium">Best</th>
                  <th className="py-2 pr-3 font-medium">Trend</th>
                  <th className="py-2 pr-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{r.keyword}</div>
                      {r.url && <div className="max-w-[220px] truncate text-xs text-muted-foreground">{r.url}</div>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={cn("font-semibold", r.position != null && r.position <= 10 ? "text-chart-2" : "text-foreground")}>
                        {posLabel(r.position)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3"><Delta delta={r.delta} /></td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{posLabel(r.best)}</td>
                    <td className="py-2.5 pr-3"><Sparkline history={r.history} /></td>
                    <td className="py-2.5 pr-3 text-right">
                      <button onClick={() => remove(r.id)} className="text-muted-foreground transition-colors hover:text-destructive" title="Stop tracking">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
