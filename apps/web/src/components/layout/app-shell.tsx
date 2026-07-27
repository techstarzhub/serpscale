"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children, initialCollapsed = false }: { children: React.ReactNode; initialCollapsed?: boolean }) {
  // Seeded from the server-read cookie, so the first render already matches the
  // saved state — no hydration mismatch and no layout shift on reload.
  const [collapsed, setCollapsed] = useState(initialCollapsed); // desktop icon-rail
  const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer

  // Persist to a cookie (readable by the server on the next load) so the choice
  // survives reloads and the next paint stays put.
  const changeCollapsed = (next: boolean) => {
    setCollapsed(next);
    document.cookie = `sidebar-collapsed=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onExpand={() => changeCollapsed(false)}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-foreground/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <div
        className={cn(
          "transition-[padding] duration-200",
          collapsed ? "lg:pl-[var(--sidebar-collapsed-width)]" : "lg:pl-[var(--sidebar-width)]",
        )}
      >
        <Topbar
          onToggleSidebar={() => changeCollapsed(!collapsed)}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="p-3.5 lg:p-4">{children}</main>
      </div>
    </div>
  );
}
