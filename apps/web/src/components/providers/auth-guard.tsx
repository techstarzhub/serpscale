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
    // Calm app-shell skeleton while the session resolves — no spinner.
    return (
      <div className="flex min-h-screen bg-background">
        <div className="hidden w-60 shrink-0 space-y-4 border-r border-border p-4 lg:block">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-9 w-full" />
          <div className="space-y-2 pt-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
