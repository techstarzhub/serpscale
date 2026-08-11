"use client";

import { Suspense, Fragment, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, CreditCard, Building2, Receipt, ScrollText, KeyRound, Users as UsersIcon, Mail, SlidersHorizontal, Plus, Trash2, Loader2, MessageSquare, AtSign, Globe, Check, X, ChevronDown, Power, LogIn, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { api } from "@/lib/api";
import { toast } from "sonner";
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

type Section = "overview" | "team" | "users" | "orgs" | "plans" | "transactions" | "gateways" | "contacts" | "subscribers" | "seo" | "email" | "audit" | "settings";
// Each section maps to the platform permission that unlocks it (so delegated
// platform staff only reach the sections they were granted).
const SECTION_PERM: Record<Section, string> = {
  overview: "platform.orgs.view", team: "platform.staff.manage", users: "platform.orgs.view",
  orgs: "platform.orgs.view", plans: "platform.plans.manage", transactions: "platform.transactions.view",
  gateways: "platform.gateways.manage", contacts: "platform.orgs.view", subscribers: "platform.orgs.view",
  seo: "platform.settings.manage", email: "platform.settings.manage", audit: "platform.audit.view", settings: "platform.settings.manage",
};
const ADMIN_SECTIONS: { key: Section; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "team", label: "Team", icon: UsersIcon },
  { key: "users", label: "Users", icon: UsersIcon },
  { key: "orgs", label: "Organizations", icon: Building2 },
  { key: "plans", label: "Plans", icon: CreditCard },
  { key: "transactions", label: "Payments", icon: Receipt },
  { key: "gateways", label: "Payment keys", icon: KeyRound },
  { key: "contacts", label: "Contact messages", icon: MessageSquare },
  { key: "subscribers", label: "Subscribers", icon: AtSign },
  { key: "seo", label: "SEO / head tags", icon: Globe },
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
  const isPlatform = user?.role === "SUPER_ADMIN" || !!user?.isSuperAdminTeam;
  if (!isPlatform) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">This area is for the platform team only.</CardContent></Card>;
  }
  // Delegated staff only reach sections their permissions allow.
  const allowed = user?.role === "SUPER_ADMIN" || (user?.permissions ?? []).includes(SECTION_PERM[section]);
  if (!allowed) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">You don&apos;t have access to this section.</CardContent></Card>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">Platform administration — manage the whole software.</p>
      </div>
      {section === "overview" && <Overview />}
      {section === "team" && <TeamSection />}
      {section === "users" && <UsersSection />}
      {section === "orgs" && <Orgs />}
      {section === "plans" && <Plans />}
      {section === "transactions" && <Transactions />}
      {section === "gateways" && <Gateways />}
      {section === "contacts" && <ContactMessages />}
      {section === "subscribers" && <Subscribers />}
      {section === "seo" && <SeoSettings />}
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
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Plan</th><th className="px-4 py-2 text-right font-medium">Price</th><th className="px-4 py-2 text-center font-medium">Public</th><th className="px-4 py-2 text-right font-medium">Subs</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{p.name}<span className="ml-2 text-xs text-muted-foreground">{p.slug}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(p.priceCents, p.currency)}<span className="text-muted-foreground">/{p.interval === "year" ? "yr" : "mo"}</span></td>
                  <td className="px-4 py-2 text-center">{p.isPublic ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p._count?.subscriptions ?? 0}</td>
                  <td className="px-4 py-2 text-right"><div className="flex justify-end gap-1.5"><Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button><Button size="sm" variant="outline" className="text-destructive" onClick={async () => { try { await api.del(`/admin/plans/${p.id}`); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete plan"); } }}><Trash2 className="h-4 w-4" /></Button></div></td>
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
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const confirm = useConfirm();

  async function toggleActive(o: any) {
    setBusy(o.id);
    try { await api.patch(`/admin/orgs/${o.id}`, { isActive: !o.isActive }); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }
  const load = useCallback(() => api.get<any[]>("/admin/orgs").then(setOrgs).catch(() => setOrgs([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get<any[]>("/admin/plans").then(setPlans).catch(() => setPlans([])); }, []);

  // Assign / change / clear a plan for an org (no payment). Its features + limits
  // then flow to that org's users automatically via /auth/me entitlements.
  async function assignPlan(orgId: string, planId: string) {
    setBusy(orgId);
    try { await api.patch(`/admin/orgs/${orgId}`, { planId }); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not change plan"); }
    finally { setBusy(null); }
  }

  // Restore / suspend access without changing the plan. Access is revoked the
  // instant status leaves ACTIVE (e.g. a failed recurring charge), and stays off
  // until the admin sets it back to ACTIVE here (or a payment succeeds).
  async function setStatus(orgId: string, status: string) {
    setBusy(orgId);
    try { await api.patch(`/admin/orgs/${orgId}`, { status }); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not change status"); }
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
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete organization"); }
    finally { setBusy(null); }
  }

  async function loginAsOrg(o: any) {
    const adminId = o.admin?.id;
    if (!adminId) { toast.error("This org has no admin user to log in as."); return; }
    setBusy(o.id);
    try {
      await api.post("/auth/impersonate", { userId: adminId });
      window.location.href = "/dashboard";
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not impersonate"); }
    finally { setBusy(null); }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Organizations</CardTitle>
            <CardDescription>Assign any plan to any workspace — its features unlock for that org&apos;s users instantly.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowNew((v) => !v)} className="gap-1.5"><Plus className="h-4 w-4" /> New organization</Button>
        </div>
      </CardHeader>
      <CardContent>
        {showNew && <NewOrgForm plans={plans} onDone={() => { setShowNew(false); load(); }} onCancel={() => setShowNew(false)} />}
        <div className="overflow-x-auto rounded-xl border border-border shadow-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Users</th>
                <th className="px-4 py-3 text-right">Campaigns</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => {
                const av = accentVar(o.id);
                const pv = accentVar(o.plan || o.planId || "none");
                const ss = statusStyle(o.status);
                const isOpen = expandedId === o.id;
                return (
                <Fragment key={o.id}>
                  <tr className={cn("border-b border-border transition-colors hover:bg-secondary/20", isOpen && "bg-secondary/20")}>
                    {/* Organization */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold" style={{ backgroundColor: tint(av, 0.15), color: solid(av) }}>
                          {(o.name?.[0] ?? "?").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{o.name}</span>
                            {!o.isActive && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: tint("--destructive", 0.14), color: solid("--destructive") }}>Suspended</span>}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{o.admin?.email ?? "—"}</div>
                        </div>
                      </div>
                    </td>

                    {/* Plan (read-only badge + keyword cap) */}
                    <td className="px-4 py-2.5">
                      {o.plan ? (
                        <div>
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: tint(pv, 0.15), color: solid(pv) }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: solid(pv) }} />
                            {o.plan}
                          </span>
                          {o.keywords != null && <div className="mt-1 text-[11px] font-medium text-muted-foreground">{o.keywords.toLocaleString()} keywords</div>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">No plan</span>}
                    </td>

                    {/* Status (read-only pill + trial) */}
                    <td className="px-4 py-2.5">
                      {o.planId ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: tint(ss.v, 0.14), color: solid(ss.v) }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: solid(ss.v) }} />
                            {ss.label}
                          </span>
                          <TrialBadge status={o.status} trialEndsAt={o.trialEndsAt} />
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>

                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{o.users}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{o.projects}</td>

                    {/* Actions */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {busy === o.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        <Button size="sm" variant={isOpen ? "default" : "outline"} className="gap-1" onClick={() => setExpandedId(isOpen ? null : o.id)}>
                          Manage <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                        </Button>
                        <DropdownMenu items={[
                          { label: "Login as org", icon: <LogIn className="h-4 w-4" />, onClick: () => loginAsOrg(o) },
                          { label: o.isActive ? "Suspend workspace" : "Activate workspace", icon: <Power className="h-4 w-4" />, onClick: () => toggleActive(o) },
                          { label: "Delete organization", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => removeOrg(o) },
                        ]} />
                      </div>
                    </td>
                  </tr>

                  {/* Expandable manage panel — all editing lives here so the table stays clean */}
                  {isOpen && (
                    <tr className="border-b border-border bg-secondary/10">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid gap-4 rounded-lg border border-border bg-card p-3 md:grid-cols-3">
                          <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">Plan</div>
                            <select value={o.planId ?? ""} disabled={busy === o.id} onChange={(e) => assignPlan(o.id, e.target.value)} className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm disabled:opacity-50">
                              <option value="">— No plan —</option>
                              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">Subscription status</div>
                            <select value={o.status ?? "ACTIVE"} disabled={busy === o.id || !o.planId} onChange={(e) => setStatus(o.id, e.target.value)} className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm disabled:opacity-50">
                              <option value="ACTIVE">Active</option>
                              <option value="TRIALING">Trialing</option>
                              <option value="PAST_DUE">Past due (paused)</option>
                              <option value="CANCELED">Canceled (paused)</option>
                            </select>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">Grant trial</div>
                            <TrialGranter org={o} plans={plans} onDone={load} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );})}
              {orgs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No organizations yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Deterministic accent color (theme chart tokens) so an org / plan always maps to
// the same hue. We build colors as inline CSS from the CSS vars so they always
// render regardless of which Tailwind color utilities are generated.
const CHART_VARS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];
const tint = (v: string, a: number) => `hsl(var(${v}) / ${a})`;
const solid = (v: string) => `hsl(var(${v}))`;
function accentVar(key: string): string {
  let h = 0;
  for (const c of key || "?") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CHART_VARS[h % CHART_VARS.length];
}
// Subscription-status → semantic color var + label.
function statusStyle(status?: string | null): { v: string; label: string } {
  if (status === "ACTIVE") return { v: "--chart-2", label: "Active" };
  if (status === "TRIALING") return { v: "--chart-3", label: "Trialing" };
  return { v: "--destructive", label: status === "PAST_DUE" ? "Past due" : "Canceled" };
}

// A plan's keyword tiers (sorted low→high). Empty = fixed-price plan (no picker).
type Tier = { keywords: number; priceCents: number };
const tiersOf = (p: any): Tier[] => (p && Array.isArray(p.pricingTiers) ? [...p.pricingTiers].sort((a: Tier, b: Tier) => a.keywords - b.keywords) : []);

// Create a new org + first admin from the platform panel. Choose a plan and,
// optionally, grant it as an N-day trial. The admin gets a sign-in invite email.
function NewOrgForm({ plans, onDone, onCancel }: { plans: any[]; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [planId, setPlanId] = useState("");
  const [trial, setTrial] = useState(false);
  const [trialDays, setTrialDays] = useState(14);
  const [tierIdx, setTierIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const selPlan = plans.find((p) => p.id === planId);
  const tiers = tiersOf(selPlan);
  async function submit() {
    if (!name.trim()) { toast.error("Organization name is required."); return; }
    if (!adminEmail.trim()) { toast.error("Admin email is required."); return; }
    if (trial && !planId) { toast.error("Pick a plan to grant a trial on."); return; }
    setBusy(true);
    try {
      const body: any = { name: name.trim(), adminEmail: adminEmail.trim(), adminName: adminName.trim() || undefined, planId: planId || undefined };
      if (planId && tiers.length) body.keywords = tiers[Math.min(tierIdx, tiers.length - 1)]?.keywords;
      if (planId && trial) { body.trial = true; body.trialDays = trialDays; }
      const res = await api.post<{ emailed?: boolean }>("/admin/orgs", body);
      onDone();
      toast.success("Organization created", {
        description: res?.emailed
          ? `A sign-in invite was emailed to ${adminEmail.trim()}.`
          : "No invite email was sent (SMTP not configured).",
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create organization"); }
    finally { setBusy(false); }
  }
  return (
    <div className="mb-3 rounded-xl border border-border bg-secondary/30 p-3">
      <div className="mb-2 text-sm font-medium">New organization</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="Organization name" className="h-9 rounded-md border border-border bg-card px-3 text-sm" />
        <input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} disabled={busy} type="email" placeholder="Admin email" className="h-9 rounded-md border border-border bg-card px-3 text-sm" />
        <input value={adminName} onChange={(e) => setAdminName(e.target.value)} disabled={busy} placeholder="Admin name (optional)" className="h-9 rounded-md border border-border bg-card px-3 text-sm" />
        <select value={planId} onChange={(e) => { setPlanId(e.target.value); setTierIdx(0); if (!e.target.value) setTrial(false); }} disabled={busy} className="h-9 rounded-md border border-border bg-card px-2 text-sm">
          <option value="">No plan</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {tiers.length > 0 && (
          <select value={Math.min(tierIdx, tiers.length - 1)} onChange={(e) => setTierIdx(Number(e.target.value))} disabled={busy} title="Keywords to track" className="h-9 rounded-md border border-border bg-card px-2 text-sm sm:col-span-2">
            {tiers.map((t, i) => <option key={i} value={i}>{t.keywords.toLocaleString()} keywords — {money(t.priceCents, selPlan.currency)}</option>)}
          </select>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className={cn("flex items-center gap-1.5 text-sm", !planId && "opacity-50")}>
          <input type="checkbox" checked={trial} disabled={busy || !planId} onChange={(e) => setTrial(e.target.checked)} />
          Give as trial
        </label>
        {trial && planId && (
          <>
            <input type="number" min={1} max={365} value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} disabled={busy} className="h-8 w-16 rounded-md border border-border bg-card px-2 text-sm" />
            <span className="text-xs text-muted-foreground">days, then must subscribe</span>
          </>
        )}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create & invite"}</Button>
        </div>
      </div>
    </div>
  );
}

// Small pill showing where a trial stands. Only meaningful while TRIALING.
function TrialBadge({ status, trialEndsAt }: { status?: string | null; trialEndsAt?: string | null }) {
  if (status !== "TRIALING" || !trialEndsAt) return null;
  const daysLeft = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000);
  const expired = daysLeft <= 0;
  const v = expired ? "--destructive" : "--chart-4";
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: tint(v, 0.14), color: solid(v) }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: solid(v) }} />
      {expired ? "Trial expired" : `${daysLeft}d left`}
    </span>
  );
}

// Pick a plan + number of days and grant the org a trial. On success the org
// admin gets a sign-in email with credentials, and access auto-expires after N days.
function TrialGranter({ org, plans, onDone }: { org: any; plans: any[]; onDone: () => void }) {
  const [planId, setPlanId] = useState<string>(org.planId ?? "");
  const [days, setDays] = useState<number>(14);
  const [tierIdx, setTierIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const selPlan = plans.find((p) => p.id === planId);
  const tiers = tiersOf(selPlan);
  async function grant() {
    if (!planId) { toast.error("Pick a plan for the trial."); return; }
    if (!days || days < 1) { toast.error("Enter the trial length in days (min 1)."); return; }
    setBusy(true);
    try {
      const keywords = tiers.length ? tiers[Math.min(tierIdx, tiers.length - 1)]?.keywords : undefined;
      const res = await api.post<{ emailed?: boolean }>(`/admin/orgs/${org.id}/grant-trial`, { planId, days, keywords });
      onDone();
      toast.success("Trial granted", {
        description: res?.emailed
          ? `A sign-in email was sent to ${org.admin?.email ?? "the org admin"}.`
          : "No email sent (SMTP not configured, or the org has no admin).",
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not grant trial"); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <select value={planId} onChange={(e) => { setPlanId(e.target.value); setTierIdx(0); }} disabled={busy} className="h-8 rounded-md border border-border bg-card px-2 text-sm disabled:opacity-50">
        <option value="">Trial plan…</option>
        {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {tiers.length > 0 && (
        <select value={Math.min(tierIdx, tiers.length - 1)} onChange={(e) => setTierIdx(Number(e.target.value))} disabled={busy} title="Keyword tier" className="h-8 rounded-md border border-border bg-card px-2 text-sm disabled:opacity-50">
          {tiers.map((t, i) => <option key={i} value={i}>{t.keywords.toLocaleString()} keywords — {money(t.priceCents, selPlan.currency)}</option>)}
        </select>
      )}
      <div className="flex items-center gap-1.5">
        <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={busy} title="Trial length in days" className="h-8 w-16 rounded-md border border-border bg-card px-2 text-sm disabled:opacity-50" />
        <span className="text-xs text-muted-foreground">days</span>
        <Button size="sm" variant="outline" disabled={busy} onClick={grant} className="ml-auto">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Grant"}
        </Button>
      </div>
    </div>
  );
}

function Transactions() {
  const [txns, setTxns] = useState<any[]>([]);
  useEffect(() => { api.get<any[]>("/admin/transactions").then(setTxns).catch(() => setTxns([])); }, []);
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Transactions</CardTitle><CardDescription>All payments across the platform.</CardDescription></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
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
        </div>
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
          <table className="w-full min-w-[560px] text-sm">
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
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = useConfirm();
  const { user: me } = useCurrentUser();
  const load = useCallback(() => api.get<any[]>("/admin/users").then(setUsers).catch(() => setUsers([])), []);
  useEffect(() => { load(); }, [load]);
  const filtered = q.trim() ? users.filter((u) => (u.email + (u.name ?? "") + (u.org ?? "")).toLowerCase().includes(q.toLowerCase())) : users;

  async function toggleActive(u: any) {
    setBusy(u.id);
    try { await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive }); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }

  // Permanently delete a user account (any tenant). Irreversible → confirm first.
  async function removeUser(u: any) {
    if (!(await confirm({
      title: "Delete user?",
      description: `Permanently delete ${u.name || u.email} and their account across the platform. This can't be undone.`,
      confirmText: "Delete user",
      destructive: true,
    }))) return;
    setBusy(u.id);
    try { await api.del(`/admin/users/${u.id}`); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete user"); }
    finally { setBusy(null); }
  }

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Users</CardTitle><CardDescription>Everyone across every organization ({users.length}).</CardDescription></CardHeader>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 max-w-xs" />
        </div>
        <div className="max-h-[560px] divide-y divide-border overflow-auto">
          {filtered.map((u) => {
            const isSelf = me?.id === u.id;
            const canManage = u.role !== "SUPER_ADMIN" && !isSelf;
            return (
              <div key={u.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
                {/* Identity */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{u.name || u.email.split("@")[0]}</span>
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", u.isActive ? "bg-chart-2/12 text-chart-2" : "bg-muted text-muted-foreground")}>{u.isActive ? "Active" : "Disabled"}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="truncate">{u.org ?? "—"}</span>
                    <span className="capitalize">{u.role === "SUPER_ADMIN" ? "Super admin" : u.roleName || u.role.toLowerCase()}</span>
                    <span>Last login: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "never"}</span>
                  </div>
                </div>

                {/* Actions */}
                {canManage && (
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    {busy === u.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    <Button size="sm" variant="outline" disabled={busy === u.id} onClick={() => toggleActive(u)}>{u.isActive ? "Disable" : "Enable"}</Button>
                    <Button size="sm" variant="outline" className="text-destructive" disabled={busy === u.id} title="Delete user" onClick={() => removeUser(u)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <div className="px-4 py-6 text-center text-muted-foreground">No users found.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function ContactMessages() {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const confirm = useConfirm();
  const load = useCallback(() => api.get<any[]>("/admin/contact-messages").then(setMsgs).catch(() => setMsgs([])), []);
  useEffect(() => { load(); }, [load]);

  async function toggleHandled(m: any) {
    setBusy(m.id);
    try { await api.patch(`/admin/contact-messages/${m.id}`, { handled: !m.handled }); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }
  async function remove(m: any) {
    if (!(await confirm({ title: "Delete message?", description: `Message from ${m.name} (${m.email}) will be permanently deleted.`, confirmText: "Delete", destructive: true }))) return;
    setBusy(m.id);
    try { await api.del(`/admin/contact-messages/${m.id}`); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); }
    finally { setBusy(null); }
  }

  const unhandled = msgs.filter((m) => !m.handled).length;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Contact messages</CardTitle><CardDescription>Submissions from the marketing site contact form ({msgs.length}{unhandled ? ` · ${unhandled} new` : ""}).</CardDescription></CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[600px] divide-y divide-border overflow-auto">
          {msgs.map((m) => (
            <div key={m.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.name}</span>
                  {!m.handled && <span className="rounded-md bg-chart-3/15 px-2 py-0.5 text-[10px] font-medium text-chart-3">New</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{m.email}{m.company ? ` · ${m.company}` : ""} · {new Date(m.createdAt).toLocaleString()}</div>
                <div className={cn("mt-1 text-sm text-muted-foreground", open === m.id ? "whitespace-pre-wrap" : "line-clamp-1")}>{m.message}</div>
              </button>
              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                {busy === m.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <a href={`mailto:${m.email}`} className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-secondary/60">Reply</a>
                <Button size="sm" variant="outline" onClick={() => toggleHandled(m)} disabled={busy === m.id}>{m.handled ? "Mark new" : "Mark done"}</Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove(m)} disabled={busy === m.id}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          {msgs.length === 0 && <div className="px-4 py-6 text-center text-muted-foreground">No contact messages yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function Subscribers() {
  const [subs, setSubs] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const confirm = useConfirm();
  const load = useCallback(() => api.get<any[]>("/admin/subscribers").then(setSubs).catch(() => setSubs([])), []);
  useEffect(() => { load(); }, [load]);

  async function remove(s: any) {
    if (!(await confirm({ title: "Remove subscriber?", description: `${s.email} will be removed from the newsletter list.`, confirmText: "Remove", destructive: true }))) return;
    setBusy(s.id);
    try { await api.del(`/admin/subscribers/${s.id}`); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove"); }
    finally { setBusy(null); }
  }
  function copyAll() {
    navigator.clipboard?.writeText(subs.map((s) => s.email).join(", "));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div><CardTitle className="text-base">Subscribers</CardTitle><CardDescription>Newsletter signups from the marketing site ({subs.length}).</CardDescription></div>
        {subs.length > 0 && <Button size="sm" variant="outline" onClick={copyAll}>{copied ? "Copied!" : "Copy all emails"}</Button>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[600px] divide-y divide-border overflow-auto">
          {subs.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.email}</div>
                <div className="text-xs text-muted-foreground">{s.source ?? "—"} · {new Date(s.createdAt).toLocaleDateString()}</div>
              </div>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => remove(s)} disabled={busy === s.id}>{busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button>
            </div>
          ))}
          {subs.length === 0 && <div className="px-4 py-6 text-center text-muted-foreground">No subscribers yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function SeoSettings() {
  const [cfg, setCfg] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.get<any>("/admin/settings/seo").then((v) => v && setCfg(v)).catch(() => {}); }, []);
  const upd = (k: string, v: any) => setCfg((c: any) => ({ ...c, [k]: v }));
  async function save() { setSaving(true); try { await api.put("/admin/settings/seo", cfg); setSaved(true); setTimeout(() => setSaved(false), 2000); } finally { setSaving(false); } }
  const taCls = "w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-mono";
  const field = (label: string, key: string, ph?: string) => (
    <div><label className="text-xs text-muted-foreground">{label}</label><Input placeholder={ph} value={cfg[key] ?? ""} onChange={(e) => upd(key, e.target.value)} /></div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Default meta</CardTitle><CardDescription>Homepage title, description &amp; keywords for the marketing site. Leave blank to use the built-in defaults. Changes go live within a minute (no redeploy).</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {field("Meta title", "metaTitle", "SerpScale — The All-in-One SEO Tool")}
          <div><label className="text-xs text-muted-foreground">Meta description</label><textarea rows={2} className={taCls.replace(" font-mono", "")} value={cfg.metaDescription ?? ""} onChange={(e) => upd("metaDescription", e.target.value)} /></div>
          {field("Meta keywords", "metaKeywords", "seo tools, rank tracker, backlink checker")}
          {field("Default OG/share image URL", "ogImage", "https://…/og.png")}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={cfg.robotsIndex === false} onChange={(e) => upd("robotsIndex", e.target.checked ? false : true)} /> Discourage search engines (noindex, nofollow)</label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Site verification</CardTitle><CardDescription>Paste only the token/content value from each provider&apos;s verification meta tag (not the whole tag).</CardDescription></CardHeader>
        <CardContent className="grid gap-2.5 sm:grid-cols-2">
          {field("Google (google-site-verification)", "googleVerification")}
          {field("Bing (msvalidate.01)", "bingVerification")}
          {field("Yandex (yandex-verification)", "yandexVerification")}
          {field("Pinterest (p:domain_verify)", "pinterestVerification")}
          {field("Facebook (facebook-domain-verification)", "facebookDomainVerification")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Analytics</CardTitle><CardDescription>Just the IDs — the correct script tags are injected for you.</CardDescription></CardHeader>
        <CardContent className="grid gap-2.5 sm:grid-cols-2">
          {field("Google Analytics 4 (Measurement ID)", "ga4Id", "G-XXXXXXXXXX")}
          {field("Google Tag Manager ID", "gtmId", "GTM-XXXXXXX")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Custom scripts</CardTitle><CardDescription>Inline JavaScript injected into the marketing site. Paste JavaScript only (no <code>&lt;script&gt;</code> wrapper) — e.g. pixels or chat widgets.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div><label className="text-xs text-muted-foreground">Head script (runs in &lt;head&gt;)</label><textarea rows={3} className={taCls} placeholder="// e.g. fbq('init', '...');" value={cfg.customHeadScript ?? ""} onChange={(e) => upd("customHeadScript", e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Body script (runs at end of &lt;body&gt;)</label><textarea rows={3} className={taCls} value={cfg.customBodyScript ?? ""} onChange={(e) => upd("customBodyScript", e.target.value)} /></div>
        </CardContent>
      </Card>

      <div className="flex justify-end"><Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? "Saved" : "Save SEO settings"}</Button></div>
    </div>
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

// ===========================================================================
// Platform Team — the super admin's own staff + their access (mirrors the org
// team page). Add staff, grant platform permissions, manage them.
// ===========================================================================
type PermGroup = { group: string; items: { key: string; label: string; description?: string }[] };
type Staff = { id: string; email: string; name: string | null; isActive: boolean; lastLoginAt: string | null; avatarUrl: string | null; extraPermissions: string[]; createdAt: string };

function PermissionPicker({ groups, value, onChange }: { groups: PermGroup[]; value: Set<string>; onChange: (v: Set<string>) => void }) {
  const toggle = (k: string) => { const n = new Set(value); n.has(k) ? n.delete(k) : n.add(k); onChange(n); };
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.group}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {g.items.map((it) => {
              const on = value.has(it.key);
              return (
                <button key={it.key} type="button" onClick={() => toggle(it.key)}
                  className={cn("flex items-start gap-2 rounded-lg border p-2 text-left transition-colors", on ? "border-primary/50 bg-primary/[0.06]" : "border-border hover:bg-secondary/50")}>
                  <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{it.label}</span>
                    {it.description && <span className="block text-[11px] text-muted-foreground">{it.description}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamSection() {
  const confirm = useConfirm();
  const [groups, setGroups] = useState<PermGroup[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [editing, setEditing] = useState<Staff | null>(null);

  const load = useCallback(async () => {
    const [g, s] = await Promise.all([
      api.get<PermGroup[]>("/admin/staff/permissions").catch(() => [] as PermGroup[]),
      api.get<Staff[]>("/admin/staff").catch(() => [] as Staff[]),
    ]);
    setGroups(g || []); setStaff(s || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function invite() {
    if (!email.includes("@")) { setErr("Enter a valid email."); return; }
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ email: string; tempPassword: string }>("/admin/staff", { email: email.trim(), name: name.trim() || undefined, permissions: [...perms] });
      setCreated(r); setEmail(""); setName(""); setPerms(new Set()); setShowInvite(false);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not add the member."); } finally { setBusy(false); }
  }
  async function toggleActive(s: Staff) {
    await api.patch(`/admin/staff/${s.id}`, { isActive: !s.isActive }).catch(() => {});
    await load();
  }
  async function resetPw(s: Staff) {
    const r = await api.post<{ tempPassword: string }>(`/admin/staff/${s.id}/reset-password`, {}).catch(() => null);
    if (r) setCreated({ email: s.email, tempPassword: r.tempPassword });
  }
  async function remove(s: Staff) {
    if (!(await confirm({ title: "Remove team member?", description: `${s.name || s.email} will lose all access.`, confirmText: "Remove", destructive: true }))) return;
    await api.del(`/admin/staff/${s.id}`).catch(() => {});
    await load();
  }

  if (loading) return <Card><CardContent className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <div className="space-y-4">
      {created && (
        <Card className="border-success/40 bg-success/[0.06]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="text-sm">
              <p className="font-semibold">Temporary password for {created.email}</p>
              <p className="text-muted-foreground">Share it securely — they&apos;ll set their own on first login.</p>
            </div>
            <code className="rounded-md border border-border bg-card px-3 py-1.5 font-mono text-sm">{created.tempPassword}</code>
            <button onClick={() => setCreated(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Platform team</CardTitle>
            <CardDescription>Staff who access this dashboard — each sees only what you allow.</CardDescription>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => { setShowInvite((v) => !v); setErr(""); }}><Plus className="h-4 w-4" /> Add member</Button>
        </CardHeader>
        {showInvite && (
          <CardContent className="space-y-3 border-t border-border pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Email *</label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Access — pick what this member can do</p>
              <PermissionPicker groups={groups} value={perms} onChange={setPerms} />
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowInvite(false)}>Cancel</Button>
              <Button size="sm" className="gap-1.5" onClick={invite} disabled={busy || !email.includes("@")}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to team</Button>
            </div>
          </CardContent>
        )}
        <CardContent className={cn(showInvite && "border-t border-border pt-4")}>
          {staff.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No team members yet. Add someone to help you run the platform.</p>
          ) : (
            <div className="divide-y divide-border">
              {staff.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                  <UserAvatar src={s.avatarUrl} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.name || s.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.email} · {s.extraPermissions.length} permission{s.extraPermissions.length === 1 ? "" : "s"}</p>
                  </div>
                  {!s.isActive && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Inactive</span>}
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setEditing(s)}>Edit access</Button>
                    <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => resetPw(s)}><KeyRound className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => toggleActive(s)}>{s.isActive ? "Deactivate" : "Activate"}</Button>
                    <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={() => remove(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EditAccessModal member={editing} groups={groups} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function EditAccessModal({ member, groups, onClose, onSaved }: { member: Staff; groups: PermGroup[]; onClose: () => void; onSaved: () => void }) {
  const [perms, setPerms] = useState<Set<string>>(new Set(member.extraPermissions));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await api.patch(`/admin/staff/${member.id}`, { permissions: [...perms] }); onSaved(); }
    catch { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div><p className="text-sm font-semibold">Edit access</p><p className="text-xs text-muted-foreground">{member.name || member.email}</p></div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4"><PermissionPicker groups={groups} value={perms} onChange={setPerms} /></div>
        <div className="flex justify-end gap-2 border-t border-border p-3">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save access"}</Button>
        </div>
      </div>
    </div>
  );
}
