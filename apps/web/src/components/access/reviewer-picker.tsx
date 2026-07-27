"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { api } from "@/lib/api";

interface Reviewer { id: string; name: string | null; email: string }

/**
 * Pick which people (who can grant access) to send an access request to. The
 * request goes ONLY to those selected. Multi-select.
 */
export function ReviewerPicker({ value, onChange, compact }: { value: string[]; onChange: (ids: string[]) => void; compact?: boolean }) {
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<Reviewer[]>("/access-requests/reviewers")
      .then((r) => setReviewers(Array.isArray(r) ? r : []))
      .catch(() => setReviewers([]))
      .finally(() => setLoaded(true));
  }, []);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  if (loaded && reviewers.length === 0) {
    return <p className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>No one available to receive requests yet.</p>;
  }

  return (
    <div>
      <label className={cn("mb-1 block font-medium text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>Send to</label>
      <div className={cn("space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5", compact ? "max-h-28" : "max-h-40")}>
        {reviewers.map((r) => {
          const on = value.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => toggle(r.id)}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors", on ? "bg-primary/10" : "hover:bg-secondary")}
            >
              <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                {on && <svg viewBox="0 0 12 12" className="h-3 w-3"><path fill="currentColor" d="M10 3L4.5 8.5 2 6l1-1 1.5 1.5L9 2z" /></svg>}
              </span>
              {!compact && <UserAvatar className="h-6 w-6" />}
              <span className="min-w-0">
                <span className={cn("block truncate", compact ? "text-xs" : "text-sm")}>{r.name || r.email}</span>
                {!compact && r.name && <span className="block truncate text-xs text-muted-foreground">{r.email}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
