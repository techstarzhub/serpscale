"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, CreditCard, Building2, Receipt, ScrollText, KeyRound, Users as UsersIcon, Mail, SlidersHorizontal, Plus, Trash2, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCurrentUser } from "@/components/providers/user-provider";

const money = (cents: number, cur = "usd") => cents == null || isNaN(cents) ? "—" : `${cur === "usd" ? "$" : cur.toUpperCase() + " "}${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// Stored secrets come back masked as "__SET__" (never the real value). Show the
// input empty with a "saved" hint; leaving it blank keeps the stored secret.
const secVal = (v: unknown) => (v === "__SET__" ? "" : (v as string) ?? "");
const secPh = (v: unknown, label: string) => (v === "__SET__" ? "•••••• saved — leave blank to keep" : label);

// The gateable-module + limit catalog (server-driven single source of truth).
type Catalog = { modules: { key: string; label: string; group: string }[]; limits: { key: string; label: string }[] };
let _catalog: Catalog | null = null;
function useCatalog(): Catalog | null {
  const [c, setC] = useState<Catalog | null>(_catalog);
  useEffect(() => {
    if (_catalog) return;
    api.get<Catalog>("/admin/feature-catalog").then((d) => { _catalog = d; setC(d); }).catch(() => {});
  }, []);
  return c;
}

type Section = "overview" | "users" | "orgs" | "plans" | "transactions" | "gateways" | "email" | "audit" | "settings";
const ADMIN_SECTIONS: { key: Section; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "users", label: "Users", icon: UsersIcon },
  { key: "orgs", label: "Organizations", icon: Building2 },
  { key: "plans", label: "Plans", icon: CreditCard },
  { key: "transactions", label: "Payments", icon: Receipt },
  { key: "gateways", label: "Payment keys", icon: KeyRound },
  { key: "email", label: "Email / SMTP", icon: Mail },
  { key: "audit", label: "Audit log", icon: ScrollText },
  { key: "settings", label: "Settings", icon: SlidersHorizontal },
];

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminInner />
    </Suspense>
  );
}

function AdminInner() {
  const { user, loading } = useCurrentUser();
  const params = useSearchParams();
  const section = (params.get("s") as Section) || "overview";
  const title = ADMIN_SECTIONS.find((s) => s.key === section)?.label ?? "Overview";

  if (loading) return <div className="space-y-3"><div className="grid gap-2.5 sm:grid-cols-3">{[0, 1, 2].map((i) => <Card key={i}><CardContent className="p-4"><div className="h-14" /></CardContent></Card>)}</div></div>;
  if (user?.role !== "SUPER_ADMIN") {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">This area is for the platform owner only.</CardContent></Card>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">Platform administration — manage the whole software.</p>
      </div>
      {section === "overview" && <Overview />}
      {section === "users" && <UsersSection />}
      {section === "orgs" && <Orgs />}
      {section === "plans" && <Plans />}
      {section === "transactions" && <Transactions />}
      {section === "gateways" && <Gateways />}
      {section === "email" && <SmtpSettings />}
      {section === "audit" && <AuditLog />}
      {section === "settings" && <PlatformSettings />}
    </div>
  );
}

function Overview() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.get("/admin/overview").then(setD).catch(() => setD(null)); }, []);
  const cards = [
    { label: "Organizations", value: d?.orgs ?? "—" },
    { label: "Users", value: d?.users ?? "—" },
    { label: "Active subscriptions", value: d?.activeSubs ?? "—" },
    { label: "Plans", value: d?.plans ?? "—" },
    { label: "MRR", value: d ? money(d.mrrCents) : "—" },
    { label: "Total revenue", value: d ? money(d.revenueCents) : "—" },
  ];
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label}><CardContent className="p-4"><div className="text-2xl font-bold tracking-tight">{c.value}</div><div className="mt-1 text-sm text-muted-foreground">{c.label}</div></CardContent></Card>
      ))}
    </div>
  );
}

const LIMIT_FIELDS = [
  { key: "projects", label: "Campaigns" },
  { key: "keywords", label: "Keywords" },
  { key: "seats", label: "Team members" },
  { key: "clients", label: "Clients" },
  { key: "rankChecksPerDay", label: "Rank checks/day" },
  { key: "crawlPagesPerMonth", label: "Crawl pages/mo" },
];

function Plans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | "new" | null>(null);
  const load = useCallback(() => api.get<any[]>("/admin/plans").then(setPlans).catch(() => setPlans([])), []);
  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div><CardTitle className="text-base">Plans</CardTitle><CardDescription>Pricing tiers &amp; limits (fully dynamic).</CardDescription></div>
        {editing == null && <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New plan</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {editing != null && <PlanEditor plan={editing === "new" ? null : editing} onDone={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Plan</th><th className="px-4 py-2 text-right font-medium">Price</th><th className="px-4 py-2 text-center font-medium">Public</th><th className="px-4 py-2 text-right font-medium">Subs</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{p.name}<span className="ml-2 text-xs text-muted-foreground">{p.slug}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(p.priceCents, p.currency)}<span className="text-muted-foreground">/{p.interval === "year" ? "yr" : "mo"}</span></td>
                  <td className="px-4 py-2 text-center">{p.isPublic ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p._count?.subscriptions ?? 0}</td>
                  <td className="px-4 py-2 text-right"><div className="flex justify-end gap-1.5"><Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button><Button size="sm" variant="outline" className="text-destructive" onClick={async () => { try { await api.del(`/admin/plans/${p.id}`); load(); } catch (e) { alert(e instanceof Error ? e.message : "Could not delete plan"); } }}><Trash2 className="h-4 w-4" /></Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PlanEditor({ plan, onDone, onCancel }: { plan: any | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(plan ? String(plan.priceCents / 100) : "");
  const [interval, setInterval] = useState(plan?.interval ?? "month");
  const [isPublic, setIsPublic] = useState(plan?.isPublic ?? true);
  const [trialDays, setTrialDays] = useState(plan?.trialDays != null ? String(plan.trialDays) : "");
  const catalog = useCatalog();
  const limitFields = catalog?.limits ?? LIMIT_FIELDS;
  const modules = catalog?.modules ?? [];
  const [limits, setLimits] = useState<Record<string, string>>(() => {
    const l = plan?.limits ?? {};
    return Object.fromEntries(LIMIT_FIELDS.map((f) => [f.key, l[f.key] != null ? String(l[f.key]) : ""]));
  });
  // Features are catalog module keys (checkbox-toggled, no free text).
  const [features, setFeatures] = useState<string[]>(Array.isArray(plan?.features) ? plan.features : []);
  const toggleFeature = (key: string) => setFeatures((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  // Keyword→price options for the pricing-page dropdown (empty = fixed-price plan).
  const [tiers, setTiers] = useState<{ keywords: string; price: string }[]>(() =>
    (Array.isArray(plan?.pricingTiers) ? plan.pricingTiers : []).map((t: any) => ({
      keywords: String(t.keywords ?? ""),
      price: String((t.priceCents ?? 0) / 100),
    })),
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        priceCents: Math.round((Number(price) || 0) * 100),
        interval,
        isPublic,
        limits: Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])),
        features,
        trialDays: trialDays === "" ? null : Number(trialDays),
        pricingTiers: tiers
          .filter((t) => t.keywords !== "" && t.price !== "")
          .map((t) => ({ keywords: Number(t.keywords), priceCents: Math.round((Number(t.price) || 0) * 100) }))
          .sort((a, b) => a.keywords - b.keywords),
      };
      if (plan) await api.patch(`/admin/plans/${plan.id}`, body);
      else await api.post("/admin/plans", body);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="grid gap-2.5 sm:grid-cols-4">
        <Input placeholder="Plan name" value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
        <Input placeholder="Price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        <select value={interval} onChange={(e) => setInterval(e.target.value)} className="h-9 rounded-md border border-border bg-card px-2 text-sm"><option value="month">/ month</option><option value="year">/ year</option></select>
      </div>
      <div className="mt-3 max-w-[200px]">
        <label className="text-xs text-muted-foreground">Free trial (days) <span className="opacity-70">— 0 / blank = no trial</span></label>
        <Input type="number" placeholder="0" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-5">
        {limitFields.map((f) => (
          <div key={f.key}><label className="text-xs text-muted-foreground">{f.label}</label><Input type="number" placeholder="∞" value={limits[f.key] ?? ""} onChange={(e) => setLimits((s) => ({ ...s, [f.key]: e.target.value }))} /></div>
        ))}
      </div>
      <div className="mt-3">
        <label className="text-xs text-muted-foreground">Features <span className="opacity-70">— tick what this plan unlocks. These flow to the plan&apos;s users automatically.</span></label>
        <div className="mt-1.5 grid gap-1.5 rounded-md border border-border bg-card p-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <label key={m.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={features.includes(m.key)} onChange={() => toggleFeature(m.key)} />
              <span className="truncate" title={m.label}>{m.label}</span>
            </label>
          ))}
          {modules.length === 0 && <p className="text-xs text-muted-foreground">Loading feature catalog…</p>}
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Keyword pricing tiers <span className="opacity-70">— dropdown on the pricing page. Leave empty for a fixed-price plan (e.g. Starter).</span></label>
          <Button variant="outline" size="sm" onClick={() => setTiers((s) => [...s, { keywords: "", price: "" }])}>+ Tier</Button>
        </div>
        <div className="mt-2 space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input type="number" placeholder="Keywords (e.g. 250)" value={t.keywords} onChange={(e) => setTiers((s) => s.map((x, j) => (j === i ? { ...x, keywords: e.target.value } : x)))} />
              <span className="shrink-0 text-xs text-muted-foreground">→ $</span>
              <Input type="number" placeholder="Price" value={t.price} onChange={(e) => setTiers((s) => s.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
              <button onClick={() => setTiers((s) => s.filter((_, j) => j !== i))} className="shrink-0 text-muted-foreground transition-colors hover:text-destructive" title="Remove tier"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {tiers.length === 0 && <p className="text-xs text-muted-foreground">No tiers — this plan shows a single fixed price (from the Price field above).</p>}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Show on pricing page</label>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button><Button size="sm" onClick={save} disabled={saving || !name.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save plan"}</Button></div>
      </div>
    </div>
  );
}

function Orgs() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = useConfirm();
  const load = useCallback(() => api.get<any[]>("/admin/orgs").then(setOrgs).catch(() => setOrgs([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get<any[]>("/admin/plans").then(setPlans).catch(() => setPlans([])); }, []);

  // Assign / change / clear a plan for an org (no payment). Its features + limits
  // then flow to that org's users automatically via /auth/me entitlements.
  async function assignPlan(orgId: string, planId: string) {
    setBusy(orgId);
    try { await api.patch(`/admin/orgs/${orgId}`, { planId }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Could not change plan"); }
    finally { setBusy(null); }
  }

  // Restore / suspend access without changing the plan. Access is revoked the
  // instant status leaves ACTIVE (e.g. a failed recurring charge), and stays off
  // until the admin sets it back to ACTIVE here (or a payment succeeds).
  async function setStatus(orgId: string, status: string) {
    setBusy(orgId);
    try { await api.patch(`/admin/orgs/${orgId}`, { status }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Could not change status"); }
    finally { setBusy(null); }
  }

  // Permanently wipe a workspace and all its data (users, projects, billing…).
  // Irreversible, so require a typed-confirm and warn about the scope.
  async function removeOrg(o: any) {
    if (!(await confirm({
      title: `Delete “${o.name}”?`,
      description: `This permanently deletes the organization along with its ${o.users} user${o.users === 1 ? "" : "s"}, ${o.projects} campaign${o.projects === 1 ? "" : "s"}, and all billing history. This can't be undone.`,
      confirmText: "Delete organization",
      destructive: true,
    }))) return;
    setBusy(o.id);
    try { await api.del(`/admin/orgs/${o.id}`); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Could not delete organization"); }
    finally { setBusy(null); }
  }

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Organizations</CardTitle><CardDescription>Assign any plan to any workspace — its features unlock for that org&apos;s users instantly.</CardDescription></CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Organization</th><th className="px-4 py-2 font-medium">Admin</th><th className="px-4 py-2 font-medium">Plan</th><th className="px-4 py-2 text-right font-medium">Users</th><th className="px-4 py-2 text-right font-medium">Projects</th><th className="px-4 py-2 text-center font-medium">Status</th><th className="px-4 py-2" /></tr></thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{o.name}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{o.admin?.email ?? "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={o.planId ?? ""}
                      disabled={busy === o.id}
                      onChange={(e) => assignPlan(o.id, e.target.value)}
                      className="h-8 rounded-md border border-border bg-card px-2 text-sm disabled:opacity-50"
                    >
                      <option value="">— No plan —</option>
                      {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {o.planId && (
                      <select
                        value={o.status ?? "ACTIVE"}
                        disabled={busy === o.id}
                        onChange={(e) => setStatus(o.id, e.target.value)}
                        title="Subscription status — anything other than Active pauses access"
                        className={cn(
                          "h-8 rounded-md border px-2 text-xs disabled:opacity-50",
                          o.status === "ACTIVE" || o.status === "TRIALING"
                            ? "border-border bg-card text-muted-foreground"
                            : "border-destructive/40 bg-destructive/10 font-semibold text-destructive",
                        )}
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="TRIALING">Trialing</option>
                        <option value="PAST_DUE">Past due (paused)</option>
                        <option value="CANCELED">Canceled (paused)</option>
                      </select>
                    )}
                    {busy === o.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{o.users}</td>
                <td className="px-4 py-2 text-right tabular-nums">{o.projects}</td>
                <td className="px-4 py-2 text-center"><span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", o.isActive ? "bg-chart-2/12 text-chart-2" : "bg-muted text-muted-foreground")}>{o.isActive ? "Active" : "Suspended"}</span></td>
                <td className="px-4 py-2 text-right"><div className="flex justify-end gap-1.5"><Button size="sm" variant="outline" disabled={busy === o.id} onClick={async () => { try { await api.patch(`/admin/orgs/${o.id}`, { isActive: !o.isActive }); load(); } catch (e) { alert(e instanceof Error ? e.message : "Failed"); } }}>{o.isActive ? "Suspend" : "Activate"}</Button><Button size="sm" variant="outline" className="text-destructive" disabled={busy === o.id} title="Delete organization" onClick={() => removeOrg(o)}><Trash2 className="h-4 w-4" /></Button></div></td>
              </tr>
            ))}
            {orgs.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No organizations yet.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Transactions() {
  const [txns, setTxns] = useState<any[]>([]);
  useEffect(() => { api.get<any[]>("/admin/transactions").then(setTxns).catch(() => setTxns([])); }, []);
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Transactions</CardTitle><CardDescription>All payments across the platform.</CardDescription></CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Organization</th><th className="px-4 py-2 text-right font-medium">Amount</th><th className="px-4 py-2 text-center font-medium">Status</th><th className="px-4 py-2 font-medium">Gateway</th><th className="px-4 py-2 font-medium">Date</th></tr></thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{t.organization?.name ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(t.amountCents, t.currency)}</td>
                <td className="px-4 py-2 text-center"><span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", t.status === "succeeded" ? "bg-chart-2/12 text-chart-2" : t.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{t.status}</span></td>
                <td className="px-4 py-2 capitalize">{t.gateway}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
            {txns.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No transactions yet.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AuditLog() {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => { api.get<any[]>("/admin/audit?limit=200").then(setLogs).catch(() => setLogs([])); }, []);
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Audit log</CardTitle><CardDescription>Who did what, across all tenants.</CardDescription></CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 font-medium">Action</th><th className="px-4 py-2 font-medium">User</th><th className="px-4 py-2 font-medium">Target</th><th className="px-4 py-2 font-medium">When</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{l.action}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{l.userEmail ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{l.target ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{l.createdAt ? new Date(l.createdAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Normalize a gateway config into { mode, testKeys, liveKeys }, migrating legacy
// flat keys (and PayPal's old `live` boolean) so nothing already saved is lost.
function normGw(gw: any): { mode: string; testKeys: any; liveKeys: any } {
  if (!gw) return { mode: "test", testKeys: {}, liveKeys: {} };
  if (gw.testKeys || gw.liveKeys) return { mode: gw.mode === "live" ? "live" : "test", testKeys: gw.testKeys || {}, liveKeys: gw.liveKeys || {} };
  const { live, ...keys } = gw; // strip legacy live flag
  const isLive = live === true;
  return { mode: isLive ? "live" : "test", testKeys: isLive ? {} : keys, liveKeys: isLive ? keys : {} };
}

function Gateways() {
  const [cfg, setCfg] = useState<any>({ active: "", stripe: normGw(null), paypal: normGw(null) });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.get<any>("/admin/settings/gateways").then((v) => {
      if (v) setCfg({ active: v.active || "", stripe: normGw(v.stripe), paypal: normGw(v.paypal) });
    }).catch(() => {});
  }, []);
  async function save() { setSaving(true); try { await api.put("/admin/settings/gateways", cfg); setSaved(true); setTimeout(() => setSaved(false), 2000); } finally { setSaving(false); } }
  const slot = (gw: string) => (cfg[gw]?.mode === "live" ? "liveKeys" : "testKeys");
  const updKey = (gw: string, k: string, v: any) => setCfg((c: any) => ({ ...c, [gw]: { ...c[gw], [slot(gw)]: { ...c[gw][slot(gw)], [k]: v } } }));
  const setMode = (gw: string, m: string) => setCfg((c: any) => ({ ...c, [gw]: { ...c[gw], mode: m } }));

  const ModeToggle = ({ gw }: { gw: string }) => (
    <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
      {["test", "live"].map((m) => (
        <button key={m} type="button" onClick={() => setMode(gw, m)}
          className={cn("px-3 py-1 font-medium capitalize transition-colors", cfg[gw]?.mode === m ? (m === "live" ? "bg-chart-2/15 text-chart-2" : "bg-chart-3/15 text-chart-3") : "text-muted-foreground hover:bg-secondary/60")}>
          {m}
        </button>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Payment gateways</CardTitle><CardDescription>Store <b>Test</b> and <b>Live</b> keys separately, then switch the mode per gateway. The active mode&apos;s keys are used for checkout &amp; webhooks.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Stripe</div>
            <ModeToggle gw="stripe" />
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Input placeholder={`Publishable key (${cfg.stripe?.mode})`} value={cfg.stripe?.[slot("stripe")]?.publicKey ?? ""} onChange={(e) => updKey("stripe", "publicKey", e.target.value)} />
            <Input placeholder={secPh(cfg.stripe?.[slot("stripe")]?.secretKey, "Secret key")} type="password" value={secVal(cfg.stripe?.[slot("stripe")]?.secretKey)} onChange={(e) => updKey("stripe", "secretKey", e.target.value)} />
            <Input placeholder={secPh(cfg.stripe?.[slot("stripe")]?.webhookSecret, "Webhook secret")} type="password" value={secVal(cfg.stripe?.[slot("stripe")]?.webhookSecret)} onChange={(e) => updKey("stripe", "webhookSecret", e.target.value)} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Editing <b className="capitalize">{cfg.stripe?.mode}</b> keys. Toggle to fill the other set.</p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">PayPal</div>
            <ModeToggle gw="paypal" />
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Input placeholder={`Client ID (${cfg.paypal?.mode})`} value={cfg.paypal?.[slot("paypal")]?.clientId ?? ""} onChange={(e) => updKey("paypal", "clientId", e.target.value)} />
            <Input placeholder="Client secret" type="password" value={cfg.paypal?.[slot("paypal")]?.clientSecret ?? ""} onChange={(e) => updKey("paypal", "clientSecret", e.target.value)} />
            <Input placeholder="Webhook ID" value={cfg.paypal?.[slot("paypal")]?.webhookId ?? ""} onChange={(e) => updKey("paypal", "webhookId", e.target.value)} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Editing <b className="capitalize">{cfg.paypal?.mode}</b> keys — <b>Test</b> uses PayPal sandbox, <b>Live</b> uses production.</p>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-4">
          <label className="flex items-center gap-2 text-sm">Active gateway:
            <select value={cfg.active ?? ""} onChange={(e) => setCfg((c: any) => ({ ...c, active: e.target.value }))} className="h-9 rounded-md border border-border bg-card px-2 text-sm"><option value="">None</option><option value="stripe">Stripe</option><option value="paypal">PayPal</option></select>
          </label>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? "Saved" : "Save keys"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UsersSection() {
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const load = useCallback(() => api.get<any[]>("/admin/users").then(setUsers).catch(() => setUsers([])), []);
  useEffect(() => { load(); }, [load]);
  const filtered = q.trim() ? users.filter((u) => (u.email + (u.name ?? "") + (u.org ?? "")).toLowerCase().includes(q.toLowerCase())) : users;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Users</CardTitle><CardDescription>Everyone across every organization ({users.length}).</CardDescription></CardHeader>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 max-w-xs" />
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground"><tr className="border-b border-border"><th className="px-4 py-2 font-medium">User</th><th className="px-4 py-2 font-medium">Organization</th><th className="px-4 py-2 font-medium">Role</th><th className="px-4 py-2 font-medium">Last login</th><th className="px-4 py-2 text-center font-medium">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2"><div className="font-medium">{u.name || u.email.split("@")[0]}</div><div className="text-xs text-muted-foreground">{u.email}</div></td>
                  <td className="px-4 py-2">{u.org ?? "—"}</td>
                  <td className="px-4 py-2"><span className="capitalize">{u.role === "SUPER_ADMIN" ? "Super admin" : u.roleName || u.role.toLowerCase()}</span></td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "never"}</td>
                  <td className="px-4 py-2 text-center"><span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", u.isActive ? "bg-chart-2/12 text-chart-2" : "bg-muted text-muted-foreground")}>{u.isActive ? "Active" : "Disabled"}</span></td>
                  <td className="px-4 py-2 text-right">{u.role !== "SUPER_ADMIN" && <Button size="sm" variant="outline" onClick={async () => { try { await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive }); load(); } catch (e) { alert(e instanceof Error ? e.message : "Failed"); } }}>{u.isActive ? "Disable" : "Enable"}</Button>}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SmtpSettings() {
  const [cfg, setCfg] = useState<any>({ host: "", port: "587", user: "", pass: "", fromEmail: "", fromName: "", secure: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.get<any>("/admin/settings/smtp").then((v) => v && setCfg((c: any) => ({ ...c, ...v }))).catch(() => {}); }, []);
  const upd = (k: string, v: any) => setCfg((c: any) => ({ ...c, [k]: v }));
  async function save() { setSaving(true); try { await api.put("/admin/settings/smtp", cfg); setSaved(true); setTimeout(() => setSaved(false), 2000); } finally { setSaving(false); } }
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Email / SMTP</CardTitle><CardDescription>Used to send invites, password resets and scheduled reports.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div><label className="text-xs text-muted-foreground">SMTP host</label><Input placeholder="smtp.gmail.com" value={cfg.host ?? ""} onChange={(e) => upd("host", e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Port</label><Input placeholder="587" value={cfg.port ?? ""} onChange={(e) => upd("port", e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Username</label><Input value={cfg.user ?? ""} onChange={(e) => upd("user", e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Password</label><Input type="password" value={cfg.pass ?? ""} onChange={(e) => upd("pass", e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">From email</label><Input placeholder="noreply@yourbrand.com" value={cfg.fromEmail ?? ""} onChange={(e) => upd("fromEmail", e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">From name</label><Input placeholder="Your Brand" value={cfg.fromName ?? ""} onChange={(e) => upd("fromName", e.target.value)} /></div>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={!!cfg.secure} onChange={(e) => upd("secure", e.target.checked)} /> Use SSL/TLS (port 465)</label>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? "Saved" : "Save SMTP"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PlatformSettings() {
  const [cfg, setCfg] = useState<any>({ brandName: "", supportEmail: "", signupsOpen: true, defaultTrialDays: 14, maintenanceMode: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.get<any>("/admin/settings/platform").then((v) => v && setCfg((c: any) => ({ ...c, ...v }))).catch(() => {}); }, []);
  const upd = (k: string, v: any) => setCfg((c: any) => ({ ...c, [k]: v }));
  async function save() { setSaving(true); try { await api.put("/admin/settings/platform", cfg); setSaved(true); setTimeout(() => setSaved(false), 2000); } finally { setSaving(false); } }
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Platform settings</CardTitle><CardDescription>Global configuration for the whole software.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div><label className="text-xs text-muted-foreground">Brand name</label><Input placeholder="Your SEO Platform" value={cfg.brandName ?? ""} onChange={(e) => upd("brandName", e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Support email</label><Input placeholder="support@yourbrand.com" value={cfg.supportEmail ?? ""} onChange={(e) => upd("supportEmail", e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Default trial (days)</label><Input type="number" value={cfg.defaultTrialDays ?? ""} onChange={(e) => upd("defaultTrialDays", Number(e.target.value))} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={!!cfg.signupsOpen} onChange={(e) => upd("signupsOpen", e.target.checked)} /> Allow new signups</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={!!cfg.maintenanceMode} onChange={(e) => upd("maintenanceMode", e.target.checked)} /> Maintenance mode (block customer logins)</label>
        <div className="flex justify-end"><Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? "Saved" : "Save settings"}</Button></div>
      </CardContent>
    </Card>
  );
}
