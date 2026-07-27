"use client";

import { useMemo, useState } from "react";
import { Network } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MapNode {
  url: string;
  path: string;
  depth: number;
  status: number | null;
  inlinks: number;
}

const W = 820;
const H = 560;
const CX = W / 2;
const CY = H / 2;

function nodeColor(status: number | null) {
  if (status == null) return "hsl(var(--muted-foreground))";
  if (status >= 400) return "hsl(var(--destructive))";
  if (status >= 300) return "hsl(var(--chart-3))";
  return "hsl(var(--chart-2))";
}

export function CrawlMap({ nodes }: { nodes: MapNode[] }) {
  const [hover, setHover] = useState<MapNode | null>(null);

  const { placed, maxDepth } = useMemo(() => {
    const byDepth = new Map<number, MapNode[]>();
    for (const n of nodes) {
      const arr = byDepth.get(n.depth) ?? [];
      arr.push(n);
      byDepth.set(n.depth, arr);
    }
    const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));
    const ringGap = maxDepth > 0 ? Math.min(230 / maxDepth, 130) : 0;
    const maxIn = Math.max(1, ...nodes.map((n) => n.inlinks));
    const placed: (MapNode & { x: number; y: number; r: number })[] = [];
    for (const [depth, arr] of byDepth) {
      const radius = depth * ringGap;
      arr.forEach((n, i) => {
        const angle = arr.length === 1 && depth === 0 ? 0 : (i / arr.length) * Math.PI * 2 - Math.PI / 2 + depth * 0.4;
        const r = 4 + (Math.sqrt(n.inlinks) / Math.sqrt(maxIn)) * 12;
        placed.push({
          ...n,
          x: depth === 0 ? CX : CX + radius * Math.cos(angle),
          y: depth === 0 ? CY : CY + radius * Math.sin(angle),
          r: depth === 0 ? 14 : r,
        });
      });
    }
    return { placed, maxDepth };
  }, [nodes]);

  if (!nodes || nodes.length === 0) return null;
  const ringGap = maxDepth > 0 ? Math.min(230 / maxDepth, 130) : 0;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Network className="h-4 w-4" /></span>
          <div>
            <h4 className="font-heading text-sm font-semibold">Site structure map</h4>
            <p className="text-xs text-muted-foreground">Rings = click depth · dot size = inlinks · colour = status</p>
          </div>
        </div>
        <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-chart-2" /> OK</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-chart-3" /> Redirect</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" /> Broken</span>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[440px] w-full" preserveAspectRatio="xMidYMid meet">
          {/* depth rings */}
          {Array.from({ length: maxDepth }, (_, i) => i + 1).map((d) => (
            <circle key={d} cx={CX} cy={CY} r={d * ringGap} fill="none" stroke="hsl(var(--border))" strokeDasharray="4 5" />
          ))}
          {/* spokes from centre to each node (structure hint) */}
          {placed.filter((n) => n.depth > 0).map((n, i) => (
            <line key={`l${i}`} x1={CX} y1={CY} x2={n.x} y2={n.y} stroke="hsl(var(--border))" strokeOpacity={hover ? (hover.url === n.url ? 0.9 : 0.15) : 0.4} />
          ))}
          {/* nodes */}
          {placed.map((n, i) => (
            <circle
              key={`n${i}`}
              cx={n.x}
              cy={n.y}
              r={hover?.url === n.url ? n.r + 2 : n.r}
              fill={nodeColor(n.status)}
              stroke="hsl(var(--card))"
              strokeWidth={n.depth === 0 ? 3 : 1.5}
              className="cursor-pointer transition-all"
              opacity={hover && hover.url !== n.url ? 0.5 : 1}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>

        {/* hover info */}
        <div className="pointer-events-none absolute left-3 top-3 max-w-[60%] rounded-lg border border-border bg-card/95 px-3 py-2 shadow-sm">
          {hover ? (
            <>
              <p className="truncate text-xs font-semibold" title={hover.url}>{hover.path || "/"}</p>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className={cn("font-medium", hover.status && hover.status >= 400 ? "text-destructive" : "text-chart-2")}>{hover.status ?? "—"}</span>
                <span>depth {hover.depth}</span>
                <span>{hover.inlinks} inlinks</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Hover a page to inspect it</p>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Showing {nodes.length} pages
      </div>
    </div>
  );
}
