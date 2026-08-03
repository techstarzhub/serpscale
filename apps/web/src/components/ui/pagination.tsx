"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Build a compact page list with ellipses, e.g. [1, "…", 4, 5, 6, "…", 20].
function pageList(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < totalPages - 1) out.push("…");
  out.push(totalPages);
  return out;
}

/**
 * Reusable, theme-styled pagination bar: "Showing X–Y of Z", numbered pages
 * with ellipses, prev/next, and an optional page-size selector. Fully dynamic
 * (no hardcoded colors). Hidden entirely when there's nothing to paginate.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  label = "items",
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  label?: string;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const pages = useMemo(() => pageList(current, totalPages), [current, totalPages]);

  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);

  if (total <= pageSize && !onPageSizeChange) return null;

  return (
    <div className={cn("flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row", className)}>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          Showing <span className="font-medium text-foreground tabular-nums">{from}</span>–
          <span className="font-medium text-foreground tabular-nums">{to}</span> of{" "}
          <span className="font-medium text-foreground tabular-nums">{total}</span> {label}
        </span>
        {onPageSizeChange && (
          <label className="hidden items-center gap-1.5 sm:flex">
            <span>Per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded-md border border-border bg-card px-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(current - 1)}
            disabled={current <= 1}
            className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="grid h-8 w-8 place-items-center text-xs text-muted-foreground">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={cn(
                  "grid h-8 min-w-8 place-items-center rounded-md border px-2 text-sm tabular-nums transition-colors",
                  p === current
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-foreground hover:bg-secondary",
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => onPageChange(current + 1)}
            disabled={current >= totalPages}
            className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
