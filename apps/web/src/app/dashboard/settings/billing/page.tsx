"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, CreditCard, Download, Receipt } from "lucide-react";
import { FaPaypal } from "react-icons/fa";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface Tier { keywords: number; priceCents: number }
interface Plan { id: string; name: string; priceCents: number; currency: string; interval: string; limits: any; features: string[] | null; featureLabels?: string[]; pricingTiers?: Tier[] | null; trialDays?: number | null }
interface Subscription { status: string; currentPeriodEnd: string | null; plan: Plan | null; pendingPlan?: { id: string; name: string } | null }
interface Meter { used: number; limit: number | null }
interface Usage { plan: string | null; status: string | null; projects: Meter; seats: Meter; clients: Meter; keywords: { limit: number | null } }
interface Txn { id: string; planName: string | null; amountCents: number; currency: string; status: string; gateway: string; createdAt: string }

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
  const [gateway, setGateway] = useState<string>(""); // active gateway set by super admin
  const [txns, setTxns] = useState<Txn[]>([]);
  const [tierIdx, setTierIdx] = useState<Record<string, number>>({}); // selected keyword tier per plan
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Keyword pricing tiers (like the marketing page): pick a keyword count and the
  // price follows. Plans without tiers are fixed-price.
  const tiersOf = (p: Plan) => (Array.isArray(p.pricingTiers) ? [...p.pricingTiers].sort((a, b) => a.keywords - b.keywords) : []);
  const selTier = (p: Plan): Tier | null => { const t = tiersOf(p); return t.length ? t[Math.min(tierIdx[p.id] ?? 0, t.length - 1)] : null; };
  const planPrice = (p: Plan) => selTier(p)?.priceCents ?? p.priceCents;
  const planKeywords = (p: Plan) => selTier(p)?.keywords ?? (p.limits?.keywords ?? null);
  // "Unlimited" when a limit key is absent or effectively boundless.
  const limLabel = (v: any) => { const n = Number(v); return v == null || !Number.isFinite(n) || n >= 100000 ? "Unlimited" : n.toLocaleString(); };

  const load = () => Promise.allSettled([
    api.get<Plan[]>("/billing/plans"),
    api.get<Subscription | null>("/billing/subscription"),
    api.get<Usage>("/billing/usage"),
    api.get<{ active: string }>("/billing/gateway"),
    api.get<Txn[]>("/billing/transactions"),
  ]).then(([p, s, u, g, t]) => {
    if (p.status === "fulfilled") setPlans(Array.isArray(p.value) ? p.value : []);
    if (s.status === "fulfilled") setSub(s.value);
    if (u.status === "fulfilled") setUsage(u.value);
    if (g.status === "fulfilled") setGateway(g.value?.active ?? "");
    if (t.status === "fulfilled") setTxns(Array.isArray(t.value) ? t.value : []);
    setLoading(false);
  });

  async function downloadInvoice(id: string) {
    setBusy("inv" + id);
    try {
      const blob = await api.download(`/billing/transactions/${id}/invoice`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${id.slice(-8).toUpperCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not download invoice");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => { load(); }, []);

  async function startTrial(planId: string) {
    setBusy("trial" + planId);
    try {
      await api.post("/billing/trial", { planId });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not start trial");
    } finally {
      setBusy(null);
    }
  }

  async function subscribe(planId: string, gateway: string, keywords?: number | null) {
    setBusy(planId + gateway);
    try {
      const res = await api.post<{ url: string }>("/billing/checkout", { planId, gateway, keywords: keywords ?? undefined });
      if (res.url) { window.location.href = res.url; return; }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not start checkout");
    }
    setBusy(null);
  }

  async function cancel() {
    if (!confirm("Cancel your subscription? Access continues until the period ends, and no further payments will be taken.")) return;
    setBusy("cancel");
    try { await api.post("/billing/cancel"); await load(); } catch (e) { alert(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }

  // Downgrade → scheduled at the next renewal (current plan keeps running; no extra charge).
  async function scheduleDowngrade(planId: string, planName: string, keywords?: number | null) {
    const when = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "your next renewal";
    if (!confirm(`Downgrade to ${planName}?\n\nYour current plan stays active until ${when}. After that you'll move to ${planName}. You won't be charged anything extra.`)) return;
    setBusy("sched" + planId);
    try { await api.post("/billing/schedule-change", { planId, keywords: keywords ?? undefined }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Could not schedule the change"); }
    finally { setBusy(null); }
  }

  async function cancelScheduled() {
    setBusy("cancelsched");
    try { await api.post("/billing/cancel-scheduled-change"); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
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
                <div className="text-xs text-muted-foreground">{sub?.currentPeriodEnd ? `${sub.status === "TRIALING" ? "Trial ends" : "Renews"} ${new Date(sub.currentPeriodEnd).toLocaleDateString()}` : sub && (sub.status === "ACTIVE" || sub.status === "TRIALING") ? "Renews automatically" : "No active billing period"}</div>
              </div>
            </div>
            {sub && sub.status === "ACTIVE" && <Button variant="outline" size="sm" onClick={cancel} disabled={busy === "cancel"}>{busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel plan"}</Button>}
          </div>
          {sub?.pendingPlan && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-chart-3/30 bg-chart-3/10 px-3.5 py-2.5 text-sm">
              <span>Scheduled: switches to <b>{sub.pendingPlan.name}</b> {sub.currentPeriodEnd ? `on ${new Date(sub.currentPeriodEnd).toLocaleDateString()}` : "at your next renewal"}. No extra charge.</span>
              <Button variant="outline" size="sm" onClick={cancelScheduled} disabled={busy === "cancelsched"}>{busy === "cancelsched" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Keep current plan"}</Button>
            </div>
          )}
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

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-4 w-4" /> Payment history</CardTitle><CardDescription>Your transactions and downloadable invoices.</CardDescription></CardHeader>
        {txns.length === 0 ? (
          <CardContent className="py-8 text-center text-sm text-muted-foreground">No payments yet — transactions and invoices will appear here after your first payment.</CardContent>
        ) : (
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Plan</th><th className="px-4 py-2 font-medium">Method</th><th className="px-4 py-2 text-right font-medium">Amount</th><th className="px-4 py-2 text-center font-medium">Status</th><th className="px-4 py-2 text-right font-medium">Invoice</th></tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-4 py-2 whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-2">{t.planName ?? "—"}</td>
                      <td className="px-4 py-2">
                        {t.gateway === "paypal" ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-[#003087]"><FaPaypal className="h-4 w-4 text-[#009cde]" />Pay<span className="-ml-1 text-[#009cde]">Pal</span></span>
                        ) : t.gateway === "stripe" ? (
                          <span className="inline-flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Card</span>
                        ) : (
                          <span className="capitalize">{t.gateway}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(t.amountCents, t.currency)}</td>
                      <td className="px-4 py-2 text-center"><Badge className={cn("px-1.5 py-0 text-[10px]", t.status === "succeeded" ? "bg-chart-2/12 text-chart-2" : t.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-chart-3/15 text-chart-3")}>{t.status}</Badge></td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadInvoice(t.id)} disabled={busy === "inv" + t.id}>
                          {busy === "inv" + t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Invoice
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        )}
      </Card>

      <div>
        <h3 className="mb-2 font-heading text-base font-semibold">Available plans</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = sub?.plan?.id === p.id; // the plan you're on, any status
            const current = isCurrent && sub?.status === "ACTIVE"; // active + paying
            // Upgrade vs downgrade, relative to the current active/trialing plan.
            const hasActivePlan = !!sub && (sub.status === "ACTIVE" || sub.status === "TRIALING") && !!sub.plan;
            const isDowngrade = hasActivePlan && !isCurrent && p.priceCents < sub!.plan!.priceCents;
            const isUpgrade = hasActivePlan && !isCurrent && p.priceCents > sub!.plan!.priceCents;
            const limits = p.limits ?? {};
            return (
              <Card key={p.id} className={cn(isCurrent && "ring-2 ring-primary")}>
                <CardContent className="flex h-full flex-col p-5">
                  <div className="flex items-center gap-2">
                    <div className="font-heading text-lg font-semibold">{p.name}</div>
                    {isCurrent && (
                      <Badge className={cn("px-1.5 py-0 text-[10px]", statusTone(sub?.status))}>
                        {current ? "Current plan" : `Current · ${sub?.status}`}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-2xl font-bold">{p.priceCents === 0 ? "Free" : money(planPrice(p), p.currency)}<span className="text-sm font-normal text-muted-foreground">{p.priceCents > 0 ? `/${p.interval === "year" ? "yr" : "mo"}` : ""}</span></div>
                  {tiersOf(p).length > 0 && (
                    <div className="mt-2.5">
                      <label className="mb-1 block text-xs text-muted-foreground">Keywords to track</label>
                      <select
                        value={Math.min(tierIdx[p.id] ?? 0, tiersOf(p).length - 1)}
                        disabled={!!busy}
                        onChange={(e) => setTierIdx((s) => ({ ...s, [p.id]: Number(e.target.value) }))}
                        className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm disabled:opacity-50"
                      >
                        {tiersOf(p).map((t, i) => <option key={i} value={i}>{t.keywords.toLocaleString()} keywords — {money(t.priceCents, p.currency)}/{p.interval === "year" ? "yr" : "mo"}</option>)}
                      </select>
                    </div>
                  )}
                  <ul className="mt-3 space-y-1.5 text-sm">
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-chart-2" /> {limLabel(limits.projects)} campaigns</li>
                    {planKeywords(p) != null && <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-chart-2" /> {Number(planKeywords(p)).toLocaleString()} keywords tracked</li>}
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-chart-2" /> {limLabel(limits.seats)} team seats</li>
                    {(limits.clients == null || Number(limits.clients) > 0) && <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-chart-2" /> {limLabel(limits.clients)} clients</li>}
                    {(p.featureLabels ?? (Array.isArray(p.features) ? p.features : [])).map((f) => <li key={f} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-chart-2" /> {f}</li>)}
                  </ul>
                  <div className="mt-auto space-y-1.5 pt-4">
                    {!sub && (p.trialDays ?? 0) > 0 && (
                      <Button className="w-full gap-2" onClick={() => startTrial(p.id)} disabled={!!busy}>{busy === "trial" + p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : `Start ${p.trialDays}-day free trial`}</Button>
                    )}
                    {current ? (
                      <Button className="w-full" variant="outline" disabled>Current plan</Button>
                    ) : isDowngrade ? (
                      <Button className="w-full" variant="outline" onClick={() => scheduleDowngrade(p.id, p.name, selTier(p)?.keywords)} disabled={!!busy}>{busy === "sched" + p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : `Downgrade to ${p.name}`}</Button>
                    ) : p.priceCents === 0 ? (
                      <Button className="w-full" onClick={() => subscribe(p.id, "manual")} disabled={!!busy}>{busy === p.id + "manual" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Switch to Free"}</Button>
                    ) : gateway === "stripe" ? (
                      <Button className="w-full gap-2" onClick={() => subscribe(p.id, "stripe", selTier(p)?.keywords)} disabled={!!busy}>{busy === p.id + "stripe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CreditCard className="h-4 w-4" /> {isUpgrade ? "Upgrade — card" : "Pay with card"}</>}</Button>
                    ) : gateway === "paypal" ? (
                      <Button className="w-full gap-2 bg-[#003087] text-white hover:bg-[#00256b]" onClick={() => subscribe(p.id, "paypal", selTier(p)?.keywords)} disabled={!!busy}>{busy === p.id + "paypal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FaPaypal className="h-4 w-4 text-[#009cde]" /> <span>{isUpgrade ? "Upgrade · " : ""}Pay<span className="text-[#009cde]">Pal</span></span></>}</Button>
                    ) : (
                      <Button className="w-full" variant="outline" disabled>Payments not available</Button>
                    )}
                    {isUpgrade && <p className="text-center text-[11px] text-muted-foreground">Takes effect immediately · old plan auto-canceled</p>}
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
