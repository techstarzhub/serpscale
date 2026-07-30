"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { useCurrentUser, accessPaused } from "@/components/providers/user-provider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// Paths that stay reachable while access is paused, so the user can actually
// fix billing or leave. Everything else is blocked behind the upgrade wall.
const ALLOWED = ["/dashboard/settings/billing"];

/** Wraps the dashboard content. When the org's trial has ended (or a payment
 *  failed / was canceled), it replaces the page with a full upgrade wall so the
 *  product can't be used until they subscribe. Sidebar + topbar stay visible so
 *  the user can reach billing or sign out. */
export function DashboardGate({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const pathname = usePathname();
  const paused = accessPaused(user);
  const allowed = ALLOWED.some((p) => pathname.startsWith(p));

  if (!paused || allowed) return <>{children}</>;

  const status = user?.entitlements?.status;
  const noPlan = !user?.entitlements?.planName; // never subscribed
  const canceled = status === "CANCELED";
  const trialing = status === "TRIALING";
  const title = noPlan
    ? "Subscribe to get started"
    : trialing
      ? "Your free trial has ended"
      : canceled
        ? "Your subscription was canceled"
        : "Your subscription is paused";
  const message = noPlan
    ? "Choose a plan and complete payment to activate your account and start using SerpScale."
    : trialing
      ? "Upgrade to a paid plan to keep using your campaigns, audits and reports."
      : "A recent payment didn't go through. Upgrade or update billing to restore access.";
  return (
    <div className="flex min-h-[calc(100vh-var(--topbar-height)-2rem)] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-6 w-6" />
        </span>
        <h2 className="mt-4 font-heading text-xl font-bold">{title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{message}</p>
        <Link href="/dashboard/settings/billing" className={cn(buttonVariants(), "mt-6 w-full")}>
          {noPlan ? "Choose a plan" : "Upgrade to continue"}
        </Link>
        <button
          type="button"
          onClick={async () => { await api.post("/auth/logout").catch(() => {}); window.location.href = "/login"; }}
          className="mt-3 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
