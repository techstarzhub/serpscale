import { Skeleton } from "./skeleton";

// Structured skeletons that mirror real panel layouts so loading/refresh feels
// solid instead of a spinner. Composed from the shimmer <Skeleton/> primitive.

// Mirrors the real StatCard EXACTLY (icon + value + label + hint, same spacing)
// so the skeleton reserves the same height and nothing jumps when data loads.
export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-4 w-10 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-7 w-20 rounded-md" />
      <Skeleton className="mt-2 h-3.5 w-24 rounded-full" />
      {/* sparkline area — mirrors the little trend curve on the real cards */}
      <Skeleton className="mt-3 h-7 w-full rounded-md opacity-70" />
    </div>
  );
}

export function KpiGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartCardSkeleton({ height = 230 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-1.5 h-3 w-56" />
      </div>
      <div className="p-4">
        <Skeleton className="w-full" style={{ height }} />
      </div>
    </div>
  );
}

export function TableCardSkeleton({ rows = 6, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      {title && (
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="mt-1.5 h-3 w-64" />
        </div>
      )}
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${55 - (i % 4) * 8}%` }} />
            <Skeleton className="ml-auto h-3.5 w-12" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Bar-list style card (channels, countries, ranking distribution).
export function BarListCardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-2.5 p-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${80 - i * 12}%` }} />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Full Overview command-center skeleton (KPIs → charts → distributions → tables).
export function OverviewSkeleton() {
  return (
    <div className="space-y-2.5">
      <KpiGridSkeleton count={4} />
      <KpiGridSkeleton count={4} />
      <div className="grid gap-2.5 lg:grid-cols-2">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
      <div className="grid gap-2.5 lg:grid-cols-3">
        <BarListCardSkeleton />
        <BarListCardSkeleton />
        <BarListCardSkeleton />
      </div>
      <div className="grid gap-2.5 lg:grid-cols-3">
        <div className="lg:col-span-2"><TableCardSkeleton rows={7} /></div>
        <BarListCardSkeleton rows={7} />
      </div>
    </div>
  );
}
