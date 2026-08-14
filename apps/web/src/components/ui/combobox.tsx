"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboOption {
  value: string;
  label: string;
  hint?: string;
  /** Secondary line shown beneath the label (e.g. a campaign's domain). */
  sub?: string;
  icon?: React.ReactNode;
}

/**
 * Reusable searchable dropdown (combobox). Type to filter, click or Enter to
 * select, Escape / outside-click to close. Fully theme-styled.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className,
  triggerClassName,
  align = "start",
  disabled,
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  /** Override the trigger button's className entirely (useful to match pill-shaped form fields). */
  triggerClassName?: string;
  align?: "start" | "end";
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle) || o.hint?.toLowerCase().includes(needle));
  }, [q, options]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus the search box when opening.
  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[active]) choose(filtered[active].value); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          triggerClassName ??
            "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm transition-colors hover:bg-secondary/40 focus:outline-none focus:ring-2 focus:ring-ring",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {(selected?.icon ?? icon) && <span className="shrink-0">{selected?.icon ?? icon}</span>}
        <span className={cn("min-w-0 flex-1 truncate text-left", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 w-full min-w-[220px] overflow-hidden rounded-lg border border-border bg-card shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <div className="relative border-b border-border">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="h-9 w-full bg-transparent pl-8 pr-3 text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matches</p>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                    i === active ? "bg-secondary" : "hover:bg-secondary/60",
                  )}
                >
                  {o.icon && <span className="shrink-0">{o.icon}</span>}
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate">{o.label}</span>
                    {o.sub && <span className="block truncate text-xs font-normal text-muted-foreground">{o.sub}</span>}
                  </span>
                  {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
                  <Check className={cn("h-4 w-4 shrink-0", o.value === value ? "text-primary opacity-100" : "opacity-0")} />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
