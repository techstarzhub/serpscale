"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Check, Settings2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(() => {
    api.get<{ count: number }>("/notifications/unread-count").then((r) => setCount(r.count)).catch(() => {});
  }, []);

  useEffect(() => {
    loadCount();
    const iv = setInterval(loadCount, 30000); // light poll
    return () => clearInterval(iv);
  }, [loadCount]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      api
        .get<Notif[]>("/notifications")
        .then((r) => setItems(Array.isArray(r) ? r : []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }
  }

  async function openItem(n: Notif) {
    if (!n.read) {
      setItems((it) => it.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setCount((c) => Math.max(0, c - 1));
      api.post(`/notifications/${n.id}/read`).catch(() => {});
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    setItems((it) => it.map((x) => ({ ...x, read: true })));
    setCount(0);
    await api.post("/notifications/read-all").catch(() => {});
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" aria-label="Notifications" className="relative" onClick={toggle}>
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-card">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <button onClick={markAll} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground" title="Mark all read">
                  <Check className="h-3.5 w-3.5" /> Mark all
                </button>
              )}
              <Link href="/dashboard/settings/notifications" onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" title="Notification settings">
                <Settings2 className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={cn(
                    "flex w-full gap-2.5 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-secondary",
                    !n.read && "bg-primary/[0.04]",
                  )}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
