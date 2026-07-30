"use client";

/**
 * Themed Recharts wrappers.
 *
 * Every colour is pulled from the live CSS design tokens (hsl(var(--...))) so
 * charts stay perfectly in sync with light/dark themes and any admin-set
 * palette. No hard-coded hex, no gradients-as-decoration (only subtle area
 * fills for readability).
 */

import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Resolve a design token to a concrete hsl() string that Recharts (SVG) accepts.
export function token(name: string, alpha = 1): string {
  return alpha >= 1 ? `hsl(var(--${name}))` : `hsl(var(--${name}) / ${alpha})`;
}

export const CHART_SERIES = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

const axisProps = {
  stroke: token("muted-foreground", 0.5),
  tick: { fill: token("muted-foreground"), fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

function TooltipContent({ active, payload, label, formatter, labelFormatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      {label != null && (
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-0.5">
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto font-semibold text-foreground">
              {formatter ? formatter(p.value, p.name) : Number(p.value).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Series {
  key: string;
  name: string;
  color?: string; // token name, defaults cycle through CHART_SERIES
}

// ---------------------------------------------------------------------------
// Area / line trend chart (great for time series: clicks, sessions, ...)
// ---------------------------------------------------------------------------
export function TrendChart({
  data,
  xKey,
  series,
  height = 260,
  type = "area",
  xTickFormatter,
  valueFormatter,
  labelFormatter,
  yDomain,
  dots = false,
}: {
  data: any[];
  xKey: string;
  series: Series[];
  height?: number;
  type?: "area" | "line";
  xTickFormatter?: (v: any) => string;
  valueFormatter?: (v: number, name?: string) => string;
  labelFormatter?: (v: any) => string;
  yDomain?: [number | string, number | string];
  dots?: boolean;
}) {
  const gid = useMemo(() => series.map((s) => `g-${s.key}-${Math.round((s.key.length * 97) % 1000)}`), [series]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          {series.map((s, i) => {
            const c = token(s.color || CHART_SERIES[i % CHART_SERIES.length]);
            return (
              <linearGradient key={gid[i]} id={gid[i]} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={type === "area" ? 0.28 : 0} />
                <stop offset="100%" stopColor={c} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid vertical={false} stroke={token("border")} strokeOpacity={0.35} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={xTickFormatter} minTickGap={24} />
        <YAxis {...axisProps} width={44} domain={yDomain} allowDecimals={false} tickFormatter={(v) => compact(v)} />
        <Tooltip
          cursor={{ stroke: token("border"), strokeWidth: 1 }}
          content={<TooltipContent formatter={valueFormatter} labelFormatter={labelFormatter} />}
        />
        {series.map((s, i) => {
          const c = token(s.color || CHART_SERIES[i % CHART_SERIES.length]);
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={c}
              strokeWidth={2}
              fill={`url(#${gid[i]})`}
              dot={dots ? { r: 2.5, fill: c, strokeWidth: 0 } : false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar chart (channels, top pages, countries, ...)
// ---------------------------------------------------------------------------
// Reliable CSS horizontal-bar list (recharts vertical BarChart mis-scales bars
// in flex/grid cards, so we render deterministic CSS bars instead).
export function BarList({
  data,
  categoryKey,
  valueKey,
  color = "chart-1",
  valueFormatter,
}: {
  data: any[];
  categoryKey: string;
  valueKey: string;
  height?: number;
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const v = Number(d[valueKey]) || 0;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="w-32 shrink-0 truncate text-xs text-muted-foreground" title={String(d[categoryKey])}>{d[categoryKey]}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-secondary/50">
              <div className="h-full rounded" style={{ width: `${Math.max((v / max) * 100, 2)}%`, background: token(color) }} />
            </div>
            <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums">{valueFormatter ? valueFormatter(v) : v.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut chart (device split, channel share, ...)
// ---------------------------------------------------------------------------
export function DonutChart({
  data,
  nameKey,
  valueKey,
  height = 220,
  centerLabel,
  centerValue,
}: {
  data: any[];
  nameKey: string;
  valueKey: string;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<TooltipContent />} />
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            strokeWidth={0}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={token(CHART_SERIES[i % CHART_SERIES.length])} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {(centerValue || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && <span className="font-heading text-2xl font-bold">{centerValue}</span>}
          {centerLabel && <span className="text-xs text-muted-foreground">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radial gauge (health score, performance score, ...)
// ---------------------------------------------------------------------------
export function GaugeChart({
  value,
  max = 100,
  height = 200,
  label,
  color,
}: {
  value: number;
  max?: number;
  height?: number;
  label?: string;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const c = color || (pct >= 90 ? "chart-2" : pct >= 50 ? "chart-3" : "destructive");
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          data={[{ v: pct }]}
          startAngle={220}
          endAngle={-40}
          barSize={10}
        >
          {/* Fixed 0..100 domain so the arc length is proportional to the score. */}
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: token("muted") }} dataKey="v" cornerRadius={6} fill={token(c)} angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-heading font-bold", label ? "text-3xl" : "text-2xl")}>{Math.round(value)}</span>
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}

// A small sparkline for KPI cards.
export function Sparkline({ data, dataKey, color = "chart-1", height = 40 }: { data: any[]; dataKey: string; color?: string; height?: number }) {
  const id = `sp-${dataKey}-${color}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={token(color)} stopOpacity={0.3} />
            <stop offset="100%" stopColor={token(color)} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={token(color)} strokeWidth={1.5} fill={`url(#${id})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ChartCard({ title, subtitle, action, children, className }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h4 className="font-heading text-sm font-semibold">{title}</h4>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// Compact number formatting for axis ticks (1.2K, 3.4M).
export function compact(v: number): string {
  if (v == null || isNaN(v)) return "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${v}`;
}
