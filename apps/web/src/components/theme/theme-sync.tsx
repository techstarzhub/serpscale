"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/components/providers/user-provider";
import { useTheme } from "./theme-provider";

/**
 * Bridges the (localStorage-based, app-wide) ThemeProvider with the signed-in
 * user's server-saved theme so their dashboard look follows them across devices.
 *
 * - On load: hydrate the user's saved { overrides, mode } into the live theme
 *   (server is the source of truth once authenticated).
 * - On change: debounce-persist any theme edit (from the wizard or Settings →
 *   Appearance) back to the server. Everything stays dynamic CSS tokens — no
 *   hardcoded values, we only shuttle the token map around.
 *
 * Mounted inside the dashboard layout (a child of both ThemeProvider and
 * UserProvider). Renders nothing.
 */
export function ThemeSync() {
  const { user } = useCurrentUser();
  const { overrides, mode, applyMany, setMode, resetAll } = useTheme();
  const hydratedFor = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate once per user from the server-saved theme. We RESET first so that
  // switching accounts in the same browser starts from the default look — a user
  // with no saved theme never inherits the previous user's customization.
  useEffect(() => {
    if (!user) {
      hydratedFor.current = null;
      return;
    }
    if (hydratedFor.current === user.id) return;
    hydratedFor.current = user.id;
    const saved = user.themeOverrides;
    resetAll();
    if (saved?.overrides && Object.keys(saved.overrides).length) applyMany(saved.overrides);
    setMode(saved?.mode ?? "light");
  }, [user, applyMany, setMode, resetAll]);

  // Persist edits (debounced) once we've hydrated this user.
  useEffect(() => {
    if (!user || hydratedFor.current !== user.id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Fire-and-forget; the live theme already works from localStorage.
      void api.patch("/users/me/theme", { themeOverrides: overrides, mode }).catch(() => {});
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [overrides, mode, user]);

  return null;
}
