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
  permissions?: string[];
  // Client-portal users: which client they belong to, and if they can manage its members.
  clientId?: string | null;
  clientOwner?: boolean;
  // White-label branding for the org (agency name + logo) — shown in the sidebar.
  branding?: { agencyName: string | null; logoDataUrl: string | null; logoBg: string | null };
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
