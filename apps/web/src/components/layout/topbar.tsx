"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Moon, Sparkles, Sun, User, Settings, Palette, LogOut, KeyRound, Plus, Clock, AlertTriangle, Headphones } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { useTheme } from "@/components/theme/theme-provider";
import { useCurrentUser, displayName, roleLabel, trialDaysLeft, useCan } from "@/components/providers/user-provider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getSupportSocket } from "@/lib/support";
import { NotificationBell } from "./notification-bell";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p === "/dashboard", title: "Dashboard" },
  { match: (p) => p === "/dashboard/projects/new", title: "New project" },
  { match: (p) => p.startsWith("/dashboard/projects/"), title: "Project" },
  { match: (p) => p.startsWith("/dashboard/clients"), title: "Clients" },
  { match: (p) => p.startsWith("/dashboard/portal/team"), title: "My team" },
  { match: (p) => p.startsWith("/dashboard/settings"), title: "Settings" },
  { match: (p) => p.startsWith("/dashboard/admin"), title: "Admin" },
];

// Small countdown pill shown in the topbar during an active free trial.
function TrialPill() {
  const { user } = useCurrentUser();
  const days = trialDaysLeft(user);
  if (days == null || !user?.entitlements?.active) return null;
  return (
    <Link
      href="/dashboard/settings/billing"
      title="You're on a free trial — upgrade anytime"
      className="hidden items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 sm:inline-flex"
    >
      <Clock className="h-3.5 w-3.5" />
      {days > 0 ? `Trial · ${days}d left` : "Trial ends today"}
    </Link>
  );
}

export function Topbar({
  onToggleSidebar,
  onOpenMobile,
}: {
  onToggleSidebar?: () => void;
  onOpenMobile?: () => void;
}) {
  const pathname = usePathname();
  const { mode, toggleMode } = useTheme();
  const can = useCan();
  const canManageIntegrations = can("integrations.manage");
  const title = TITLES.find((t) => t.match(pathname))?.title ?? "SEO Platform";

  // Watch connected Google accounts so an expired token surfaces right in the
  // topbar (a blinking alert on the Connect button) — no need to open Settings.
  const [gAccounts, setGAccounts] = useState<{ accountEmail: string | null; status?: string }[]>([]);
  useEffect(() => {
    if (!canManageIntegrations) return;
    let alive = true;
    const load = () =>
      api
        .get<{ googleAccounts?: { accountEmail: string | null; status?: string }[] }>("/integrations")
        .then((s) => { if (alive) setGAccounts(s?.googleAccounts ?? []); })
        .catch(() => {});
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.removeEventListener("focus", onFocus); };
  }, [canManageIntegrations]);
  const expiredEmails = gAccounts.filter((a) => a.status && a.status !== "connected").map((a) => a.accountEmail ?? "Connected account");

  // Unread support messages → a badge on the Support button, kept live over the socket.
  const [supportUnread, setSupportUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api.get<{ count: number }>("/support/unread").then((r) => { if (alive) setSupportUnread(r?.count ?? 0); }).catch(() => {});
    load();
    const s = getSupportSocket();
    const bump = () => load();
    s.on("message", bump); s.on("ticket:activity", bump); s.on("ticket:new", bump); s.on("read", bump);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; s.off("message", bump); s.off("ticket:activity", bump); s.off("ticket:new", bump); s.off("read", bump); window.removeEventListener("focus", onFocus); };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center justify-between border-b border-border bg-card/80 px-4 shadow-[0_1px_3px_hsl(var(--foreground)/0.05)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/65 sm:px-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onOpenMobile} aria-label="Open menu" className="rounded-full lg:hidden">
          <Menu className="h-[18px] w-[18px]" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Toggle sidebar" className="hidden rounded-full lg:inline-flex">
          <Menu className="h-[18px] w-[18px]" />
        </Button>
        <h1 className="font-heading text-base font-semibold">{title}</h1>
      </div>

      <div className="flex items-center gap-1.5">
        <TrialPill />
        {/* Primary action — only for roles allowed to create campaigns. */}
        {can("projects.create") && (
          <>
            <Link
              href="/dashboard/projects/new"
              className="hidden h-9 items-center gap-1.5 rounded-full bg-primary pl-3 pr-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:inline-flex"
            >
              <Plus className="h-4 w-4" /> New Campaign
            </Link>
            <Link
              href="/dashboard/projects/new"
              aria-label="New campaign"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:hidden"
            >
              <Plus className="h-[18px] w-[18px]" />
            </Link>
          </>
        )}

        {/* Connect a Google account from anywhere. Gated by "integrations.manage"
            (ADMINs pass via useCan) — no need to open Settings → Integrations. When
            an account's token has expired, a blinking alert appears; hovering lists
            exactly which accounts need reconnecting. */}
        {canManageIntegrations && (
          <div className="group relative hidden sm:block">
            <button
              type="button"
              onClick={() => window.open(`${API}/integrations/google/connect`, "_blank", "noopener,noreferrer")}
              aria-label={expiredEmails.length ? `${expiredEmails.length} Google account(s) expired — reconnect` : "Connect a Google account"}
              className={cn(
                "flex h-9 items-center gap-2 rounded-full border bg-card px-3.5 text-sm font-semibold shadow-sm transition-colors",
                expiredEmails.length
                  ? "border-destructive/40 text-destructive hover:bg-destructive/[0.06]"
                  : "border-input hover:border-primary/40 hover:bg-primary/[0.04]",
              )}
            >
              <FcGoogle className="h-[18px] w-[18px]" />
              <span className="hidden md:inline">Connect Google</span>
              {expiredEmails.length > 0 && (
                <span className="relative flex h-4 w-4 items-center justify-center">
                  <AlertTriangle className="h-4 w-4 animate-pulse text-destructive" />
                </span>
              )}
            </button>

            {/* Hover card: exactly which accounts are expired. */}
            {expiredEmails.length > 0 && (
              <div className="pointer-events-none absolute right-0 top-11 z-50 w-64 -translate-y-1 rounded-xl border border-border bg-popover p-3 text-xs shadow-lg opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
                <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {expiredEmails.length} account{expiredEmails.length > 1 ? "s" : ""} expired
                </p>
                <ul className="space-y-1">
                  {expiredEmails.map((e) => (
                    <li key={e} className="flex items-center gap-1.5 truncate text-foreground">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" /> {e}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-muted-foreground">Click to reconnect and resume live data.</p>
              </div>
            )}
          </div>
        )}

        {/* Contact support — opens the in-app support form. Available to everyone,
            placed just before Upgrade. */}
        <Link
          href="/dashboard/support"
          aria-label="Contact support"
          title="Contact support"
          className="relative hidden h-9 items-center gap-1.5 rounded-full border border-input bg-card px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.04] sm:inline-flex"
        >
          <Headphones className="h-4 w-4 text-primary" />
          Support
          {supportUnread > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {supportUnread > 9 ? "9+" : supportUnread}
            </span>
          )}
        </Link>

        {/* Upgrade → org billing (last). Gated by the billing permission (ADMINs
            always pass via useCan; others need "billing.manage"). */}
        {can("billing.manage") && (
          <Link
            href="/dashboard/settings/billing"
            data-tour="upgrade"
            className="hidden h-9 items-center gap-1.5 rounded-full border border-input bg-card px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.04] md:inline-flex"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Upgrade
          </Link>
        )}

        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <Button variant="ghost" size="icon" onClick={toggleMode} aria-label="Toggle light or dark" className="rounded-full">
          {mode === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </Button>
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const router = useRouter();
  const { user, setUser } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function signOut() {
    setOpen(false);
    try { await api.post("/auth/logout"); } catch { /* clear locally regardless */ }
    setUser?.(null);
    router.replace("/login");
  }

  const items = [
    { label: "Profile", href: "/dashboard/settings/profile", icon: User },
    { label: "Account settings", href: "/dashboard/settings", icon: Settings },
    { label: "Appearance", href: "/dashboard/settings/appearance", icon: Palette },
    { label: "Security", href: "/dashboard/settings/security", icon: KeyRound },
  ];

  return (
    <div className="relative ml-1.5" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className={cn("rounded-full ring-2 ring-primary/20 transition-shadow hover:ring-primary/40", open && "ring-primary/50")}
      >
        <UserAvatar src={user?.avatarUrl} className="h-8 w-8" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center gap-3 border-b border-border p-3">
            <UserAvatar src={user?.avatarUrl} className="h-10 w-10" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{displayName(user)}</div>
              <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
              {user?.role && <div className="mt-0.5 inline-flex rounded bg-secondary px-1.5 text-[10px] font-medium text-muted-foreground">{roleLabel(user.role)}</div>}
            </div>
          </div>

          <div className="p-1">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-secondary/60">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {it.label}
                </Link>
              );
            })}
          </div>

          <div className="border-t border-border p-1">
            <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
