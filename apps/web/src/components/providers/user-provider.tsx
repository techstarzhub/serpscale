"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "MEMBER" | "CLIENT";
  orgId: string | null;
  avatarUrl: string | null;
  // Null until the user finishes the first-login onboarding wizard.
  onboardedAt?: string | null;
  // Server-persisted dashboard theme (dynamic CSS tokens + light/dark), so it
  // follows the user across devices. Hydrated into ThemeProvider on load.
  themeOverrides?: { overrides?: Record<string, string>; mode?: "light" | "dark" } | null;
  permissions?: string[];
  // Client-portal users: which client they belong to, and if they can manage its members.
  clientId?: string | null;
  clientOwner?: boolean;
  clientCanManageTeam?: boolean;
  isAgencyClient?: boolean;
  // White-label branding for the org (agency name + logo) — shown in the sidebar.
  branding?: { agencyName: string | null; logoDataUrl: string | null; logoBg: string | null };
  // Plan entitlements — which feature modules + numeric limits the org's plan
  // grants. Drives feature gating across the dashboard. Derived server-side from
  // the plan the super admin assigned; nothing is hardcoded on the client.
  entitlements?: {
    planName: string | null;
    planSlug: string | null;
    status: string | null;
    active: boolean;
    trialEndsAt: string | null;
    features: string[];
    limits: Record<string, number | null>;
  };
}

interface UserContextValue {
  user: CurrentUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: CurrentUser | null) => void;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  setUser: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<CurrentUser>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return (
    <UserContext.Provider value={{ user, loading, refresh, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export const useCurrentUser = () => useContext(UserContext);

/** Permission check hook. SUPER_ADMIN and ADMIN always pass (full access);
 *  otherwise the permission must be in the user's resolved list. */
export function useCan(): (perm: string) => boolean {
  const { user } = useCurrentUser();
  return (perm: string) => {
    if (!user) return false;
    // Org admin holds every org permission. Super admin gets exactly the perms
    // resolved server-side (platform-only), so campaign perms correctly fail.
    if (user.role === "ADMIN") return true;
    return (user.permissions ?? []).includes(perm);
  };
}

/** Plan-feature check hook. SUPER_ADMIN + org ADMIN see everything; otherwise the
 *  module key must be in the org plan's entitlements. Returns a stable checker. */
export function useFeature(): (key: string) => boolean {
  const { user } = useCurrentUser();
  return (key: string) => {
    if (!user) return false;
    if (user.role === "SUPER_ADMIN") return true;
    return (user.entitlements?.features ?? []).includes(key);
  };
}

/** Returns the plan's cap for a limit key (null = unlimited / not set). */
export function useLimit(): (key: string) => number | null {
  const { user } = useCurrentUser();
  return (key: string) => {
    const v = user?.entitlements?.limits?.[key];
    return v == null ? null : v;
  };
}

/** Days left in an active trial (rounded up), or null when not trialing. */
export function trialDaysLeft(user: CurrentUser | null): number | null {
  const e = user?.entitlements;
  if (!e || e.status !== "TRIALING" || !e.trialEndsAt) return null;
  const ms = new Date(e.trialEndsAt).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 3600 * 1000));
}

/** True when an org owner/member has no active plan — either they never
 *  subscribed (paid signup before payment) or their plan lapsed (trial ended,
 *  payment failed, canceled). The dashboard is locked behind a subscribe/upgrade
 *  wall. Only the platform owner (super admin) is exempt. */
export function accessPaused(user: CurrentUser | null): boolean {
  if (!user || !user.entitlements) return false;
  // When the org's subscription lapses (payment failed / declined / canceled /
  // trial ended — any reason at all), EVERYONE under it is locked out instantly:
  // the admin, every team member, and every client. Only the super admin is exempt.
  if (user.role === "SUPER_ADMIN") return false;
  return user.entitlements.active === false;
}

// Display helpers.
export function displayName(user: CurrentUser | null): string {
  if (!user) return "Guest";
  return user.name || user.email.split("@")[0];
}

export function roleLabel(role?: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super admin";
    case "ADMIN":
      return "Admin";
    case "MEMBER":
      return "Member";
    default:
      return "Guest";
  }
}
