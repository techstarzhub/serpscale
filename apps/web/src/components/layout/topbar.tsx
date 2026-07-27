"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sparkles, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { useCurrentUser } from "@/components/providers/user-provider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
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
    <header className="sticky top-0 z-10 flex h-[var(--topbar-height)] items-center justify-between border-b border-border bg-card px-4 sm:px-6">
      <div className="flex items-center gap-2">
        {/* Mobile: open drawer */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobile}
          aria-label="Open menu"
          className="lg:hidden"
        >
          <Menu className="h-[18px] w-[18px]" />
        </Button>
        {/* Desktop: collapse to icon rail */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="hidden lg:inline-flex"
        >
          <Menu className="h-[18px] w-[18px]" />
        </Button>
        <h1 className="font-heading text-base font-semibold">{title}</h1>
      </div>

      <div className="flex items-center gap-1">
        <Link
          href="/dashboard/settings/billing"
          className="mr-1 hidden items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 sm:inline-flex"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Upgrade
        </Link>
        <Button variant="ghost" size="icon" onClick={toggleMode} aria-label="Toggle light or dark">
          {mode === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </Button>
        <NotificationBell />
        <UserAvatar src={user?.avatarUrl} className="ml-1.5 h-8 w-8 ring-2 ring-primary/20" />
      </div>
    </header>
  );
}
