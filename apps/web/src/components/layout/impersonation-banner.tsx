"use client";

import { useState } from "react";
import { Eye, Loader2, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentUser, displayName } from "@/components/providers/user-provider";

/**
 * Sticky bar shown while an admin is "viewing as" another user. Returning
 * re-issues the admin's own session and reloads into the dashboard.
 */
export function ImpersonationBanner() {
  const { user } = useCurrentUser();
  const [busy, setBusy] = useState(false);
  if (!user?.impersonating) return null;

  async function stop() {
    setBusy(true);
    try {
      await api.post("/auth/stop-impersonate");
    } catch {
      /* fall through — reload will land on login if the session is gone */
    }
    // Full reload so every provider (user, theme, projects) re-hydrates as admin.
    window.location.href = "/dashboard";
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-[110] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-sm shadow-lg backdrop-blur-sm">
        <Eye className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="truncate">
          Viewing as <b>{displayName(user)}</b>
          <span className="hidden text-muted-foreground sm:inline"> · {user.email}</span>
        </span>
        <button
          onClick={stop}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
          Return to your account
        </button>
      </div>
    </div>
  );
}
