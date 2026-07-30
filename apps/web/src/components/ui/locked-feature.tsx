import Link from "next/link";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

/** Shown in place of a feature the current plan doesn't include. Points the user
 *  to the billing page to upgrade. Fully generic — the caller passes what's locked. */
export function LockedFeature({ title, description }: { title: string; description?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Lock className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">{title} isn&apos;t in your plan</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {description ?? "Upgrade your plan to unlock this feature."}
          </p>
        </div>
        <Link href="/dashboard/settings/billing" className={buttonVariants({ size: "sm" })}>
          Upgrade to unlock
        </Link>
      </CardContent>
    </Card>
  );
}
