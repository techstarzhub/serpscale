"use client";

import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Info, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { UserAvatar } from "@/components/ui/user-avatar";

interface Member {
  id: string;
  name: string | null;
  email: string;
  roleName: string;
  avatarUrl: string | null;
}
interface Meta {
  createdAt: string;
  createdBy: { id: string; name: string | null; email: string; avatarUrl: string | null } | null;
  members: Member[];
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

// Info (ⓘ) trigger shown on a sidebar campaign row. On hover it opens a small
// card — created by, created date, assigned members — fetched lazily (once) from
// /projects/:id/meta. The card is fixed-positioned so the sidebar's own overflow
// never clips it.
export function CampaignInfo({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (meta || loading) return;
    setLoading(true);
    try {
      setMeta(await api.get<Meta>(`/projects/${projectId}/meta`));
    } catch {
      /* leave meta null — the card shows a friendly fallback */
    } finally {
      setLoading(false);
    }
  }, [meta, loading, projectId]);

  const openCard = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const r = btnRef.current?.getBoundingClientRect();
    // Anchor to the right of the icon; clamp so a tall card stays on-screen.
    if (r) setPos({ top: Math.min(r.top, window.innerHeight - 320), left: r.right + 8 });
    setOpen(true);
    void load();
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`About ${projectName}`}
        onMouseEnter={openCard}
        onMouseLeave={scheduleClose}
        onFocus={openCard}
        onBlur={scheduleClose}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-primary"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && pos && createPortal(
        <div
          role="dialog"
          onMouseEnter={openCard}
          onMouseLeave={scheduleClose}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 60 }}
          className="fade-up w-64 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
        >
          <p className="mb-2 truncate text-sm font-semibold">{projectName}</p>

          {loading && !meta ? (
            <p className="py-1 text-xs text-muted-foreground">Loading…</p>
          ) : meta ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <UserAvatar src={meta.createdBy?.avatarUrl} className="h-7 w-7" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Created by</p>
                  <p className="truncate text-xs font-medium">{meta.createdBy?.name || meta.createdBy?.email || "Unknown"}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span>Created {fmtDate(meta.createdAt)}</span>
              </div>

              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Members ({meta.members.length})</p>
                {meta.members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No members assigned yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {meta.members.slice(0, 6).map((m) => (
                      <div key={m.id} className="flex items-center gap-2">
                        <UserAvatar src={m.avatarUrl} className="h-6 w-6" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">{m.name || m.email}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{m.roleName}</span>
                      </div>
                    ))}
                    {meta.members.length > 6 && (
                      <p className="pt-0.5 text-[11px] text-muted-foreground">+{meta.members.length - 6} more</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="py-1 text-xs text-muted-foreground">Couldn&apos;t load details.</p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
