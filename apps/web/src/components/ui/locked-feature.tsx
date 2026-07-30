import Link from "next/link";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown in place of a feature the current plan doesn't include. Points the user
 *  to the billing page to upgrade. Fully generic — the caller passes what's locked.
 *  `canUpgrade` (default true) gates the button: users who can't change billing
 *  (members without billing permission, client-portal users) get an
 *  "ask your admin" note instead of a dead upgrade link. */
export function LockedFeature({
  title,
  description,
  canUpgrade = true,
  compact = false,
}: {
  title: string;
  description?: string;
  canUpgrade?: boolean;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardContent className={cn("flex flex-col items-center gap-3 text-center", compact ? "py-8" : "py-12")}>
        <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Lock className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">{title} isn&apos;t in your plan</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {description ?? "Upgrade your plan to unlock this feature."}
          </p>
        </div>
        {canUpgrade ? (
          <Link href="/dashboard/settings/billing" className={buttonVariants({ size: "sm" })}>
            Upgrade to unlock
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">Ask your account admin to upgrade the plan.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Small inline lock glyph for a tab / menu label whose feature is plan-gated. */
export function LockPip({ className }: { className?: string }) {
  return <Lock className={cn("h-3 w-3 shrink-0 opacity-70", className)} aria-label="Locked — upgrade to unlock" />;
}
