"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface Plan { id: string; name: string; priceCents: number; currency: string; interval: string; limits: any; features: string[] | null }
interface Subscription { status: string; currentPeriodEnd: string | null; plan: Plan | null }
interface Meter { used: number; limit: number | null }
interface Usage { plan: string | null; status: string | null; projects: Meter; seats: Meter; clients: Meter; keywords: { limit: number | null } }

function UsageBar({ label, m }: { label: string; m: Meter }) {
  const pct = m.limit ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0;
  const over = m.limit != null && m.used >= m.limit;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium", over ? "text-destructive" : "text-foreground")}>
          {m.used}{m.limit != null ? ` / ${m.limit}` : " (unlimited)"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")} style={{ width: `${m.limit ? pct : 6}%` }} />
      </div>
    </div>
  );
}

const money = (c: number, cur = "usd") => c == null || isNaN(c) ? "—" : `${cur === "usd" ? "$" : cur.toUpperCase() + " "}${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function BillingPage() {
  return <Suspense fallback={null}><BillingInner /></Suspense>;
}

function BillingInner() {
  const params = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => Promise.allSettled([
    api.get<Plan[]>("/billing/plans"),
    api.get<Subscription | null>("/billing/subscription"),
    api.get<Usage>("/billing/usage"),
  ]).then(([p, s, u]) => {
    if (p.status === "fulfilled") setPlans(Array.isArray(p.value) ? p.value : []);
    if (s.status === "fulfilled") setSub(s.value);
    if (u.status === "fulfilled") setUsage(u.value);
    setLoading(false);
  });

  useEffect(() => { load(); }, []);

  async function subscribe(planId: string, gateway: string) {
    setBusy(planId + gateway);
    try {
      const res = await api.post<{ url: string }>("/billing/checkout", { planId, gateway });
      if (res.url) { window.location.href = res.url; return; }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not start checkout");
    }
    setBusy(null);
  }

  async function cancel() {
    if (!confirm("Cancel your subscription? Access continues until the period ends.")) return;
    setBusy("cancel");
    try { await api.post("/billing/cancel"); await load(); } catch (e) { alert(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }

  if (loading) return <Card><CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading billing…</CardContent></Card>;

  const canceled = params.get("canceled");
  const activated = params.get("activated");
  const statusTone = (s?: string) => s === "ACTIVE" ? "bg-chart-2/12 text-chart-2" : s === "PAST_DUE" ? "bg-destructive/10 text-destructive" : s === "TRIALING" ? "bg-chart-3/15 text-chart-3" : "bg-muted text-muted-foreground";

  return (
    <div className="space-y-5">
      {canceled && <div className="rounded-lg border border-chart-3/30 bg-chart-3/10 px-4 py-3 text-sm">Checkout was canceled. No charge was made.</div>}
      {activated && <div className="rounded-lg border border-chart-2/30 bg-chart-2/10 px-4 py-3 text-sm">Plan activated. Enjoy!</div>}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Current plan</CardTitle><CardDescription>Your subscription and renewal.</CardDescription></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></span>
              <div>
                <div className="flex items-center gap-2 font-semibold">{sub?.plan?.name ?? "No plan"} {sub && <Badge className={cn("px-1.5 py-0 text-[10px]", statusTone(sub.status))}>{sub.status}</Badge>}</div>
                <div className="text-xs text-muted-foreground">{sub?.currentPeriodEnd ? `Renews ${new Date(sub.currentPeriodEnd).toLocaleDateString()}` : "No active billing period"}</div>
              </div>
            </div>
            {sub && sub.status === "ACTIVE" && <Button variant="outline" size="sm" onClick={cancel} disabled={busy === "cancel"}>{busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel plan"}</Button>}
          </div>
        </CardContent>
      </Card>

      {usage && (usage.projects.limit != null || usage.seats.limit != null || usage.clients.limit != null) && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Usage this plan</CardTitle><CardDescription>What you&apos;ve used against your plan limits.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <UsageBar label="Campaigns" m={usage.projects} />
            <UsageBar label="Team seats" m={usage.seats} />
            <UsageBar label="Clients" m={usage.clients} />
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="mb-2 font-heading text-base font-semibold">Available plans</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => {
            const current = sub?.plan?.id === p.id && sub?.status === "ACTIVE";
            const limits = p.limits ?? {};
            return (
              <Card key={p.id} className={cn(current && "ring-2 ring-primary")}>
                <CardContent className="flex h-full flex-col p-5">
                  <div className="font-heading text-lg font-semibold">{p.name}</div>
                  <div className="mt-1 text-2xl font-bold">{p.priceCents === 0 ? "Free" : money(p.priceCents, p.currency)}<span className="text-sm font-normal text-muted-foreground">{p.priceCents > 0 ? `/${p.interval === "year" ? "yr" : "mo"}` : ""}</span></div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {Number(limits.projects) > 0 && <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-chart-2" /> {limits.projects} projects</li>}
                    {Number(limits.keywords) > 0 && <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-chart-2" /> {limits.keywords} keywords</li>}
                    {Number(limits.seats) > 0 && <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-chart-2" /> {limits.seats} seats</li>}
                    {(Array.isArray(p.features) ? p.features : []).map((f) => <li key={f} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-chart-2" /> {f}</li>)}
                  </ul>
                  <div className="mt-auto pt-4">
                    {current ? (
                      <Button className="w-full" variant="outline" disabled>Current plan</Button>
                    ) : p.priceCents === 0 ? (
                      <Button className="w-full" onClick={() => subscribe(p.id, "manual")} disabled={!!busy}>{busy === p.id + "manual" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Switch to Free"}</Button>
                    ) : (
                      <div className="space-y-1.5">
                        <Button className="w-full" onClick={() => subscribe(p.id, "stripe")} disabled={!!busy}>{busy === p.id + "stripe" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pay with card"}</Button>
                        <Button className="w-full" variant="outline" onClick={() => subscribe(p.id, "paypal")} disabled={!!busy}>{busy === p.id + "paypal" ? <Loader2 className="h-4 w-4 animate-spin" /> : "PayPal"}</Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {plans.length === 0 && <Card className="sm:col-span-2 lg:col-span-3"><CardContent className="py-8 text-center text-sm text-muted-foreground">No plans available yet.</CardContent></Card>}
        </div>
      </div>
    </div>
  );
}
