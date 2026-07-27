import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/** Compact number formatting (1.2K, 3.4M). */
export function fmtCompact(n: number | null | undefined): string {
  const v = n ?? 0;
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(v);
}

/** Google-rank position → tinted badge class (green top 3, amber top 10). */
export function posBadgeClass(p: number | null | undefined): string {
  if (p == null) return "bg-secondary text-muted-foreground";
  if (p <= 3) return "bg-chart-2/15 text-chart-2";
  if (p <= 10) return "bg-chart-3/15 text-chart-3";
  return "bg-secondary text-muted-foreground";
}

/** A value-proportional data bar behind a number — heatmap feel inside tables.
 *  Uses dynamic theme tokens only (no hardcoded colors). */
export function BarCell({
  value,
  max,
  color = "chart-1",
  format,
}: {
  value: number;
  max: number;
  color?: string;
  format?: (n: number) => string;
}) {
  const w = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div className="relative flex h-6 items-center justify-end rounded">
      <div className="absolute inset-y-0.5 left-0 rounded" style={{ width: `${w}%`, background: `hsl(var(--${color}) / 0.16)` }} />
      <span className="relative z-10 pr-1 text-sm font-medium tabular-nums">{format ? format(value) : value.toLocaleString()}</span>
    </div>
  );
}

/** Premium KPI stat card — colored icon tile, big number, optional hint. */
const KPI_ACCENTS: Record<string, string> = {
  blue: "bg-chart-1/12 text-chart-1",
  green: "bg-chart-2/12 text-chart-2",
  amber: "bg-chart-3/15 text-chart-3",
  violet: "bg-chart-4/12 text-chart-4",
};
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "blue",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  accent?: keyof typeof KPI_ACCENTS;
}) {
  return (
    <div className="group rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      {Icon && (
        <span className={cn("mb-3 grid h-10 w-10 place-items-center rounded-xl transition-transform group-hover:scale-105", KPI_ACCENTS[accent])}>
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="text-2xl font-bold leading-none tracking-tight">{value}</div>
      <div className="mt-1.5 text-sm font-medium text-muted-foreground">{label}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  );
}
