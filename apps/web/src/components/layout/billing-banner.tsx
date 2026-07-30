"use client";

import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { useCurrentUser, trialDaysLeft } from "@/components/providers/user-provider";

/** Dashboard-wide billing notice:
 *  - while on an active free trial: a friendly countdown (days left)
 *  - when the plan is paused (trial ended / payment failed / canceled): a warning
 *    with a link to fix billing (the DashboardGate also blocks the app).
 */
export function BillingBanner() {
  const { user } = useCurrentUser();
  const ent = user?.entitlements;
  if (!ent || user?.role === "SUPER_ADMIN") return null;

  const days = trialDaysLeft(user);
  // Active trial → countdown.
  if (ent.active && days != null) {
    return (
      <div className="mb-3.5 flex flex-col items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0" />
          {days > 0
            ? `${days} day${days === 1 ? "" : "s"} left in your ${ent.planName} trial.`
            : `Your ${ent.planName} trial ends today.`}
        </span>
        <Link href="/dashboard/settings/billing" className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          Upgrade now
        </Link>
      </div>
    );
  }

  // Paused (only shows where the gate lets it through, e.g. the billing page).
  if (!ent.active && ent.planName) {
    const canceled = ent.status === "CANCELED";
    const trial = ent.status === "TRIALING";
    return (
      <div className="mb-3.5 flex flex-col items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {trial
            ? "Your free trial has ended — upgrade to continue."
            : canceled
              ? "Your subscription was canceled — paid features are paused."
              : "A recent payment didn't go through — paid features are paused until it clears."}
        </span>
        <Link href="/dashboard/settings/billing" className="shrink-0 rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground">
          Fix billing
        </Link>
      </div>
    );
  }
  return null;
}
