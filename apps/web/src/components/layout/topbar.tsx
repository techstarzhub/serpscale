"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Moon, Sparkles, Sun, User, Settings, Palette, LogOut, KeyRound, Plus, Clock } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { useCurrentUser, displayName, roleLabel, trialDaysLeft } from "@/components/providers/user-provider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";

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
  const { user } = useCurrentUser();
  const title = TITLES.find((t) => t.match(pathname))?.title ?? "SEO Platform";

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
        {/* Primary action — always one click from anywhere */}
        <Link
          href="/dashboard/projects/new"
          className="hidden items-center gap-2 rounded-full bg-gradient-to-r from-primary to-primary/85 py-1.5 pl-2 pr-4 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-lg active:translate-y-0 sm:inline-flex"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20">
            <Plus className="h-4 w-4" />
          </span>
          New Campaign
        </Link>
        <Link
          href="/dashboard/projects/new"
          aria-label="New campaign"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-glow transition-all hover:shadow-glow-lg sm:hidden"
        >
          <Plus className="h-[18px] w-[18px]" />
        </Link>

        {/* Upgrade → org billing. Only the organization admin manages the plan. */}
        {user?.role === "ADMIN" && (
          <Link
            href="/dashboard/settings/billing"
            className="sheen relative hidden items-center gap-1.5 overflow-hidden rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary ring-1 ring-inset ring-white/5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/15 hover:shadow-glow md:inline-flex"
          >
            <Sparkles className="h-3.5 w-3.5" />
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
