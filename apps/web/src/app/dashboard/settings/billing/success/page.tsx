"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/components/providers/user-provider";

export default function BillingSuccessPage() {
  const [active, setActive] = useState(false);
  const [tries, setTries] = useState(0);
  const { refresh } = useCurrentUser();

  useEffect(() => {
    let alive = true;
    let n = 0;
    // Once the payment is confirmed, refresh the global user/entitlements so the
    // dashboard doesn't briefly show the "Subscribe to get started" lock before
    // a manual reload picks up the new active plan.
    const activate = async () => { await refresh().catch(() => {}); if (alive) setActive(true); };
    const poll = async () => {
      try {
        // Fallback for when webhooks aren't configured yet: verify + activate.
        const c = await api.post<{ active: boolean }>("/billing/confirm").catch(() => null);
        if (alive && c?.active) { await activate(); return; }
        const sub = await api.get<{ status: string } | null>("/billing/subscription");
        if (alive && sub?.status === "ACTIVE") { await activate(); return; }
      } catch { /* keep polling */ }
      n += 1;
      if (alive && n < 12) { setTries(n); setTimeout(poll, 2500); }
    };
    poll();
    return () => { alive = false; };
  }, [refresh]);

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          {active ? (
            <>
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-chart-2/12 text-chart-2"><CheckCircle2 className="h-8 w-8" /></span>
              <div>
                <h2 className="font-heading text-lg font-semibold">Payment successful</h2>
                <p className="mt-1 text-sm text-muted-foreground">Your subscription is now active. Recurring billing is set up automatically.</p>
              </div>
              <Link href="/dashboard" className={buttonVariants()}>Go to dashboard</Link>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div>
                <h2 className="font-heading text-lg font-semibold">Confirming your payment…</h2>
                <p className="mt-1 text-sm text-muted-foreground">This can take a few seconds while the gateway confirms.{tries >= 8 ? " Taking longer than usual — you can safely return to billing." : ""}</p>
              </div>
              <Link href="/dashboard/settings/billing" className={buttonVariants({ variant: "outline" })}>Back to billing</Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
