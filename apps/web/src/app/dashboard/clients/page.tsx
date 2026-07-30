"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Loader2, Contact, X, Trash2, Check, Upload, Building2, Search, Send, KeyRound, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useCan, useFeature } from "@/components/providers/user-provider";
import { useProjects } from "@/components/providers/projects-provider";
import { ClientMembers } from "@/components/clients/client-members";
import { LockedFeature } from "@/components/ui/locked-feature";

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  type: string;
  allowTeam: boolean;
  notes: string | null;
  branding: any;
  _count: { projects: number; members: number };
}
interface ClientDetail extends Client {
  projects: { id: string; name: string; domain: string }[];
}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";
const lbl = "mb-1 block text-xs font-medium text-muted-foreground";

export default function ClientsPage() {
  const hasFeature = useFeature();
  const can = useCan();
  // Client dashboards are an agency capability. The page stays reachable but
  // shows an upgrade prompt on plans that don't include it.
  if (!hasFeature("client_dashboards")) {
    return <LockedFeature title="Client dashboards" description="Give each client their own branded portal and reports. Upgrade to an agency plan to unlock." canUpgrade={can("billing.manage")} />;
  }
  return <ClientsInner />;
}

function ClientsInner() {
  const can = useCan();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | "new" | null>(null);

  const load = () =>
    api
      .get<Client[]>("/clients")
      .then((c) => setClients(Array.isArray(c) ? c : []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const filtered = clients.filter(
    (c) => c.name.toLowerCase().includes(q.toLowerCase()) || (c.company ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight">Clients</h2>
          <p className="text-sm text-muted-foreground">Your customers and the campaigns you run for them.</p>
        </div>
        {can("clients.create") && (
          <Button onClick={() => setOpen("new")}>
            <Plus className="h-4 w-4" /> Add client
          </Button>
        )}
      </div>

      {!loading && clients.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…" className={cn(field, "pl-9")} />
        </div>
      )}

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="h-11 bg-muted" />
          {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse border-t border-border bg-card" />)}
        </div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
              <Contact className="h-7 w-7" />
            </span>
            <div>
              <p className="font-medium">No clients yet</p>
              <p className="text-sm text-muted-foreground">Add your first client and assign their campaigns.</p>
            </div>
            {can("clients.create") && (
              <Button onClick={() => setOpen("new")}>
                <Plus className="h-4 w-4" /> Add client
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Campaigns</th>
                  <th className="px-4 py-3 text-right">Members</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} onClick={() => setOpen(c.id)} className="group cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-secondary/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {c.branding?.logoDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.branding.logoDataUrl} alt={c.name} className="h-9 w-9 shrink-0 rounded-lg object-contain" style={c.branding.logoBg ? { backgroundColor: c.branding.logoBg } : undefined} />
                        ) : (
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            {c.type === "AGENCY" ? <Building2 className="h-4 w-4" /> : <Contact className="h-4 w-4" />}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-semibold group-hover:text-primary">
                            {c.type === "AGENCY" && c.branding?.agencyName ? c.branding.agencyName : c.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {c.type === "AGENCY" && c.branding?.agencyName ? c.name : c.company || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.type === "AGENCY" ? "primary" : "outline"}>{c.type === "AGENCY" ? "Agency" : "Client"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", c.status === "PAUSED" ? "text-muted-foreground" : "text-chart-2")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", c.status === "PAUSED" ? "bg-muted-foreground/40" : "bg-chart-2")} />
                        {c.status === "PAUSED" ? "Paused" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c._count.projects}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c._count.members}</td>
                    <td className="px-4 py-3">
                      {c.allowTeam
                        ? <span className="inline-flex items-center gap-1 rounded-md bg-chart-2/15 px-1.5 py-0.5 text-[10px] font-semibold text-chart-2">Enabled</span>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="truncate text-xs text-muted-foreground">{c.email || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">Manage →</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">No clients match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{filtered.length} of {clients.length} clients</div>
        </div>
      )}

      {open === "new" && <CreateModal onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
      {open && open !== "new" && (
        <DetailModal id={open} onClose={() => setOpen(null)} onChanged={load} />
      )}
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="copilot-pop w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", notes: "", password: "" });
  const [sendInvite, setSendInvite] = useState(true);
  const [allowTeam, setAllowTeam] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailOk = /\S+@\S+\.\S+/.test(f.email.trim());
  const pwOk = !f.password.trim() || f.password.trim().length >= 6;
  const ready = !!f.name.trim() && emailOk && pwOk;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await api.post("/clients", { ...f, sendInvite, allowTeam });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create client.");
      setSaving(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-base font-semibold">Add client</h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className={lbl}>Client name</label>
              <input autoFocus className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Acme Corp" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={lbl}>Company (optional)</label>
                <input className={field} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
              </div>
              <div>
                <label className={lbl}>Phone (optional)</label>
                <input className={field} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={lbl}>Login email</label>
                <input type="email" className={field} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="client@company.com" />
              </div>
              <div>
                <label className={lbl}>Password (optional)</label>
                <input type="text" className={field} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="blank = auto-generate & email" />
              </div>
            </div>
            <div>
              <label className={lbl}>Notes (optional)</label>
              <textarea className={cn(field, "min-h-[70px] resize-none")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </div>

            {/* Can this client invite their own portal team members? */}
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <span className="flex flex-col">
                <span className="text-sm font-medium">Can add team members</span>
                <span className="text-xs text-muted-foreground">Lets this client invite people to their own read-only portal (My team).</span>
              </span>
              <button type="button" role="switch" aria-checked={allowTeam} onClick={() => setAllowTeam((v) => !v)} className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", allowTeam ? "bg-primary" : "bg-secondary")}>
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", allowTeam ? "translate-x-4" : "translate-x-0.5")} />
              </button>
            </label>

            {/* Send the login details to the client by email (on by default). */}
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <span className="flex flex-col">
                <span className="text-sm font-medium">Send invite email</span>
                <span className="text-xs text-muted-foreground">Emails the client their login (email, password &amp; portal link).</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={sendInvite}
                onClick={() => setSendInvite((v) => !v)}
                className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", sendInvite ? "bg-primary" : "bg-secondary")}
              >
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", sendInvite ? "translate-x-4" : "translate-x-0.5")} />
              </button>
            </label>

            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={save} disabled={saving || !ready}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create client
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Overlay>
  );
}

function DetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const can = useCan();
  const { projects } = useProjects();
  const [c, setC] = useState<ClientDetail | null>(null);
  const [tab, setTab] = useState<"details" | "campaigns" | "agency" | "members">("details");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState<{ email: string; tempPassword: string } | null>(null);

  // editable state
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", notes: "", status: "ACTIVE", allowTeam: false });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [type, setType] = useState("CLIENT");
  const [brand, setBrand] = useState<{ agencyName: string; email: string; logoDataUrl: string | null; logoBg: string | null; whiteLabel: boolean }>({
    agencyName: "",
    email: "",
    logoDataUrl: null,
    logoBg: null,
    whiteLabel: true,
  });
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<ClientDetail>(`/clients/${id}`).then((d) => {
      setC(d);
      setF({ name: d.name, company: d.company ?? "", email: d.email ?? "", phone: d.phone ?? "", notes: d.notes ?? "", status: d.status, allowTeam: !!d.allowTeam });
      setSelected(new Set((d.projects ?? []).map((p) => p.id)));
      setType(d.type);
      const b = d.branding ?? {};
      setBrand({ agencyName: b.agencyName ?? "", email: b.email ?? "", logoDataUrl: b.logoDataUrl ?? null, logoBg: b.logoBg ?? null, whiteLabel: b.whiteLabel !== false });
    });
  }, [id]);

  function flash(t: string) {
    setMsg(t);
    setTimeout(() => setMsg(null), 1800);
  }

  async function saveDetails() {
    setBusy(true);
    try {
      await api.patch(`/clients/${id}`, f);
      flash("Saved");
      onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function saveCampaigns() {
    setBusy(true);
    try {
      await api.put(`/clients/${id}/campaigns`, { projectIds: [...selected] });
      flash("Campaigns updated");
      onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function saveAgency() {
    setBusy(true);
    try {
      await api.patch(`/clients/${id}/agency`, { type, branding: type === "AGENCY" ? brand : undefined });
      flash("Saved");
      onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  const [sending, setSending] = useState<string | null>(null);
  async function sendReport(pid: string) {
    setSending(pid);
    try {
      const r = await api.post<{ sent: number; total: number }>(`/projects/${pid}/send-report`, { clientId: id });
      flash(r.sent > 0 ? `Report sent to ${r.sent} recipient(s)` : "No recipients received it (check SMTP)");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(null);
    }
  }
  async function resetLoginPw() {
    if (!confirm("Reset this client's login password? A new one will be generated and emailed to them.")) return;
    setBusy(true);
    setResetPw(null);
    try {
      const r = await api.post<{ email: string; tempPassword: string }>(`/clients/${id}/reset-password`, {});
      setResetPw(r);
      flash("Password reset");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function del() {
    if (!confirm("Remove this client? Their campaigns stay, only the link is removed.")) return;
    setBusy(true);
    try {
      await api.del(`/clients/${id}`);
      onChanged();
      onClose();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  function pickLogo(file: File) {
    if (file.size > 500 * 1024) return flash("Logo must be under 500 KB");
    const r = new FileReader();
    r.onload = () => setBrand((p) => ({ ...p, logoDataUrl: String(r.result) }));
    r.readAsDataURL(file);
  }

  const tabs: { key: typeof tab; label: string; show: boolean }[] = [
    { key: "details", label: "Details", show: true },
    { key: "campaigns", label: "Campaigns", show: can("clients.assign_campaigns") },
    { key: "agency", label: "Agency & white-label", show: can("clients.manage_agency") },
    { key: "members", label: "Members", show: can("clients.manage_agency") && !!c?.allowTeam },
  ];

  return (
    <Overlay onClose={onClose}>
      <Card>
        <CardContent className="p-0">
          {/* header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-heading text-base font-semibold">{c?.name ?? "Client"}</h3>
                {type === "AGENCY" && <Badge variant="primary">Agency</Badge>}
              </div>
              {c?.company && <p className="truncate text-xs text-muted-foreground">{c.company}</p>}
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* tabs */}
          <div className="flex gap-1 border-b border-border px-3 py-2">
            {tabs.filter((t) => t.show).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {!c ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto p-5">
              {tab === "details" && (
                <div className="space-y-3">
                  <div>
                    <label className={lbl}>Client name</label>
                    <input className={field} value={f.name} disabled={!can("clients.edit")} onChange={(e) => setF({ ...f, name: e.target.value })} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={lbl}>Company</label>
                      <input className={field} value={f.company} disabled={!can("clients.edit")} onChange={(e) => setF({ ...f, company: e.target.value })} />
                    </div>
                    <div>
                      <label className={lbl}>Phone</label>
                      <input className={field} value={f.phone} disabled={!can("clients.edit")} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                    </div>
                    <div>
                      <label className={lbl}>Email</label>
                      <input className={field} value={f.email} disabled={!can("clients.edit")} onChange={(e) => setF({ ...f, email: e.target.value })} />
                    </div>
                    <div>
                      <label className={lbl}>Status</label>
                      <select className={field} value={f.status} disabled={!can("clients.edit")} onChange={(e) => setF({ ...f, status: e.target.value })}>
                        <option value="ACTIVE">Active</option>
                        <option value="PAUSED">Paused</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Notes</label>
                    <textarea className={cn(field, "min-h-[70px] resize-none")} value={f.notes} disabled={!can("clients.edit")} onChange={(e) => setF({ ...f, notes: e.target.value })} />
                  </div>
                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2.5">
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">Can add team members</span>
                      <span className="text-xs text-muted-foreground">Lets this client invite people to their own read-only portal (My team).</span>
                    </span>
                    <button type="button" role="switch" aria-checked={f.allowTeam} disabled={!can("clients.edit")} onClick={() => setF({ ...f, allowTeam: !f.allowTeam })} className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", f.allowTeam ? "bg-primary" : "bg-secondary")}>
                      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", f.allowTeam ? "translate-x-4" : "translate-x-0.5")} />
                    </button>
                  </label>
                  {can("clients.edit") && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={saveDetails} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save details
                      </Button>
                      <Button variant="outline" onClick={resetLoginPw} disabled={busy}>
                        <KeyRound className="h-4 w-4" /> Reset login password
                      </Button>
                    </div>
                  )}
                  {resetPw && (
                    <div className="rounded-lg border border-chart-2/40 bg-chart-2/5 p-3 text-sm">
                      <p className="mb-1 font-medium text-chart-2">New password set &amp; emailed</p>
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-background px-2 py-1 text-xs">{resetPw.email}</code>
                        <code className="rounded bg-background px-2 py-1 text-xs">{resetPw.tempPassword}</code>
                        <button onClick={() => navigator.clipboard?.writeText(`${resetPw.email} / ${resetPw.tempPassword}`)} className="text-muted-foreground hover:text-foreground"><Copy className="h-4 w-4" /></button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "campaigns" && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Select the campaigns this client owns. A campaign can belong to several clients.</p>
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                    {projects.length === 0 && <p className="p-2 text-sm text-muted-foreground">No campaigns available.</p>}
                    {projects.map((p) => {
                      const on = selected.has(p.id);
                      return (
                        <label key={p.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-secondary">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setSelected((prev) => {
                                const n = new Set(prev);
                                on ? n.delete(p.id) : n.add(p.id);
                                return n;
                              })
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{p.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{p.domain}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <Button onClick={saveCampaigns} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save campaigns ({selected.size})
                  </Button>

                  {can("clients.send_reports") && (c.projects ?? []).length > 0 && (
                    <div className="rounded-xl border border-border p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                        <Send className="h-4 w-4 text-primary" /> Email a report
                      </div>
                      <p className="mb-2 text-xs text-muted-foreground">Sends the white-label PDF to this client&apos;s members and contact.</p>
                      <div className="space-y-1.5">
                        {(c.projects ?? []).map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                            <span className="min-w-0">
                              <span className="block truncate text-sm">{p.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">{p.domain}</span>
                            </span>
                            <Button variant="outline" size="sm" onClick={() => sendReport(p.id)} disabled={sending === p.id}>
                              {sending === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "agency" && (
                <div className="space-y-4">
                  <label className="flex items-center gap-2.5 rounded-lg border border-border p-3">
                    <input type="checkbox" checked={type === "AGENCY"} onChange={(e) => setType(e.target.checked ? "AGENCY" : "CLIENT")} />
                    <span>
                      <span className="block text-sm font-medium">Mark as agency client (white-label)</span>
                      <span className="block text-xs text-muted-foreground">Gives this client its own branding, team members and white-label reports.</span>
                    </span>
                  </label>

                  {type === "AGENCY" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border" style={{ backgroundColor: brand.logoBg || "hsl(var(--card))" }}>
                          {brand.logoDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={brand.logoDataUrl} alt="Logo" className="h-full w-full object-contain" />
                          ) : (
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                          )}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => e.target.files?.[0] && pickLogo(e.target.files[0])} />
                          <Button type="button" variant="outline" size="sm" onClick={() => logoRef.current?.click()}>
                            <Upload className="h-4 w-4" /> Logo
                          </Button>
                          {brand.logoDataUrl && (
                            <Button type="button" variant="outline" size="sm" onClick={() => setBrand((p) => ({ ...p, logoDataUrl: null }))}>
                              <Trash2 className="h-4 w-4" /> Remove
                            </Button>
                          )}
                          <input type="color" value={brand.logoBg || "#4f46e5"} onChange={(e) => setBrand((p) => ({ ...p, logoBg: e.target.value }))} className="h-9 w-10 cursor-pointer rounded-lg border border-border bg-background p-1" title="Logo background" />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={lbl}>Agency name (on reports)</label>
                          <input className={field} value={brand.agencyName} onChange={(e) => setBrand((p) => ({ ...p, agencyName: e.target.value }))} placeholder="Client's agency name" />
                        </div>
                        <div>
                          <label className={lbl}>Reports email</label>
                          <input className={field} value={brand.email} onChange={(e) => setBrand((p) => ({ ...p, email: e.target.value }))} placeholder="reports@theiragency.com" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={brand.whiteLabel} onChange={(e) => setBrand((p) => ({ ...p, whiteLabel: e.target.checked }))} />
                        Send fully white-label reports (their branding, not yours)
                      </label>
                    </div>
                  )}

                  <Button onClick={saveAgency} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
                  </Button>
                </div>
              )}

              {tab === "members" && <ClientMembers clientId={id} />}
            </div>
          )}

          {/* footer */}
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <span className={cn("text-sm", msg ? "text-chart-2" : "text-transparent")}>{msg ?? "."}</span>
            {can("clients.delete") && (
              <Button variant="outline" size="sm" onClick={del} disabled={busy} className="text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" /> Remove client
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </Overlay>
  );
}
