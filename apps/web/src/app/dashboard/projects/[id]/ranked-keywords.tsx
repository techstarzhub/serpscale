"use client";

import { useEffect, useState } from "react";
import { Trophy, Loader2, ExternalLink, Search, TrendingUp, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { type Project } from "@/components/providers/projects-provider";
import { BarCell, MetricCard } from "@/components/ui/metric";
import { KpiCardSkeleton, TableCardSkeleton } from "@/components/ui/panel-skeletons";

interface RankedKw {
  keyword: string; volume: number; cpc: number | null; difficulty: number | null;
  position: number | null; url: string | null; title: string | null;
}
interface RankedResp {
  connected: boolean;
  target?: string;
  totals?: { count: number; etv: number; pos_1: number; pos_2_3: number; pos_4_10: number };
  keywords: RankedKw[];
}

function fmtVol(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
function posTone(p: number | null) {
  if (p == null) return "bg-muted text-muted-foreground";
  if (p <= 3) return "bg-chart-2/15 text-chart-2";
  if (p <= 10) return "bg-chart-3/15 text-chart-3";
  return "bg-muted text-muted-foreground";
}

/**
 * Every keyword the domain organically ranks for on Google, via DataForSEO Labs
 * (far broader than GSC's sampled query set). Cached 7 days server-side.
 */
export function RankedKeywords({ project, refreshNonce = 0 }: { project: Project; refreshNonce?: number }) {
  const [data, setData] = useState<RankedResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get<RankedResp>(`/projects/${project.id}/ranked-keywords${refreshNonce ? "?fresh=1" : ""}`)
      .then((d) => alive && (setData(d), setLoading(false)))
      .catch(() => alive && (setData(null), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [project.id, refreshNonce]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"><KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton /></div>
        <TableCardSkeleton rows={8} title={false} />
      </div>
    );
  }

  if (!data?.connected || !data.keywords || data.keywords.length === 0) {
    return null; // silently omit when DataForSEO is unavailable or domain has no ranked keywords
  }

  const t = data.totals;
  const filtered = q.trim() ? data.keywords.filter((k) => k.keyword.toLowerCase().includes(q.toLowerCase())) : data.keywords;
  const volMax = Math.max(1, ...filtered.map((k) => k.volume));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-primary" />
        <h4 className="font-heading text-sm font-semibold">All keywords you rank for</h4>
      </div>

      {t && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <MetricCard icon={Search} accent="blue" label="Ranked keywords" value={fmtVol(t.count ?? 0)} />
          <MetricCard icon={TrendingUp} accent="violet" label="Est. traffic / mo" value={fmtVol(t.etv ?? 0)} />
          <MetricCard icon={Trophy} accent="green" label="Top 3" value={fmtVol((t.pos_1 ?? 0) + (t.pos_2_3 ?? 0))} />
          <MetricCard icon={LineChart} accent="amber" label="Positions 4-10" value={fmtVol(t.pos_4_10 ?? 0)} />
        </div>
      )}

      <Card>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter keywords…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="shrink-0 text-xs text-muted-foreground">{filtered.length}</span>
        </div>
        <div className="max-h-[440px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20 bg-card text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Keyword</th>
                <th className="px-4 py-2 text-center font-medium">Position</th>
                <th className="px-4 py-2 text-right font-medium">Volume</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Ranking URL</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((k, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-2 font-medium">{k.keyword}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={cn("inline-block min-w-[2rem] rounded-md px-2 py-0.5 text-xs font-semibold", posTone(k.position))}>{k.position ?? "—"}</span>
                  </td>
                  <td className="px-3 py-1.5"><BarCell value={k.volume} max={volMax} color="chart-1" format={fmtVol} /></td>
                  <td className="hidden px-4 py-2 md:table-cell">
                    {k.url ? (
                      <a href={k.url} target="_blank" rel="noreferrer" className="inline-flex max-w-[320px] items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary" title={k.url}>
                        <span className="truncate">{k.url.replace(/^https?:\/\//, "")}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
