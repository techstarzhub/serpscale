"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Palette, Lock, CreditCard, Users, Plug, Building2, Mail, Bell, KeyRound, Search, History, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/providers/user-provider";

// Profile / Notifications / Appearance / Security are personal — everyone sees them.
// The rest are gated by the same permission their pages require.
const nav: { label: string; href: string; icon: LucideIcon; soon?: boolean; perm?: string }[] = [
  { label: "Profile", href: "/dashboard/settings/profile", icon: User },
  { label: "Notifications", href: "/dashboard/settings/notifications", icon: Bell },
  { label: "Appearance", href: "/dashboard/settings/appearance", icon: Palette },
  { label: "Security", href: "/dashboard/settings/security", icon: Lock },
  { label: "Request access", href: "/dashboard/settings/access", icon: KeyRound },
  { label: "Billing", href: "/dashboard/settings/billing", icon: CreditCard, perm: "billing.view" },
  { label: "Integrations", href: "/dashboard/settings/integrations", icon: Plug, perm: "integrations.manage" },
  { label: "Agency", href: "/dashboard/settings/agency", icon: Building2, perm: "settings.manage" },
  { label: "Email", href: "/dashboard/settings/email", icon: Mail, perm: "settings.manage" },
  { label: "Team", href: "/dashboard/settings/team", icon: Users, perm: "team.view" },
  { label: "Search activity", href: "/dashboard/settings/search-activity", icon: Search, perm: "team.manage" },
  { label: "Activity log", href: "/dashboard/settings/activity", icon: History, perm: "team.manage" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const can = useCan();
  const items = nav.filter((i) => !i.perm || can(i.perm));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <h2 className="font-heading text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage your account, profile, and preferences.
        </p>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Settings sub-nav */}
        <nav className="shrink-0 lg:w-56">
          <div className="space-y-0.5 rounded-xl border border-border bg-card p-2 shadow-card lg:sticky lg:top-24">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              const base = "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors";
              const chip = (
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border bg-card text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
              );
              const text = (
                <span
                  className={cn(
                    "flex-1 truncate text-sm",
                    active ? "font-semibold text-foreground" : "font-medium text-foreground",
                  )}
                >
                  {item.label}
                </span>
              );
              if (item.soon) {
                return (
                  <span key={item.label} className={cn(base, "cursor-default opacity-60")}>
                    {chip}
                    {text}
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Soon
                    </span>
                  </span>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(base, active ? "bg-secondary" : "hover:bg-secondary")}
                >
                  {chip}
                  {text}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
