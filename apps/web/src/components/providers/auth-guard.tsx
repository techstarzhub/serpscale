"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "./user-provider";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Gates the dashboard. While the session is being resolved we show a loader;
 * once resolved, an unauthenticated visitor is sent to /login (preserving where
 * they were headed) instead of rendering a broken "Guest" shell.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const next = pathname && pathname !== "/dashboard" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [loading, user, pathname, router]);

  if (loading || !user) {
    // App-shell skeleton that mirrors the REAL layout (sidebar brand + nav +
    // projects, topbar, content) so when the session resolves and the real shell
    // + page skeleton swap in, nothing visibly jumps — it reads as one load.
    return (
      <div className="flex min-h-screen bg-background">
        {/* Sidebar silhouette */}
        <div className="hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r border-border bg-card lg:flex">
          <div className="flex h-[var(--topbar-height)] items-center gap-3 border-b border-border px-5">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-4 w-28 rounded-md" />
          </div>
          <div className="flex-1 space-y-2 p-3">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
            <div className="pb-1 pt-3"><Skeleton className="h-2.5 w-20 rounded-full" /></div>
            <Skeleton className="h-9 rounded-full" />
            <Skeleton className="h-10 rounded-xl" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 py-1" style={{ opacity: 1 - i * 0.15 }}>
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 rounded-full" style={{ width: `${68 - (i % 3) * 12}%` }} />
                  <Skeleton className="h-2 rounded-full" style={{ width: `${48 - (i % 2) * 10}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Content silhouette */}
        <div className="min-w-0 flex-1">
          <div className="flex h-[var(--topbar-height)] items-center justify-between border-b border-border px-6">
            <Skeleton className="h-5 w-28 rounded-md" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-32 rounded-full" />
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
          </div>
          <div className="space-y-4 p-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
