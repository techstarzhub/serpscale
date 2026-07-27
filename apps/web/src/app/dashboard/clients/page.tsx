"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Loader2, Contact, X, Trash2, Check, Upload, Building2, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useCan } from "@/components/providers/user-provider";
import { useProjects } from "@/components/providers/projects-provider";
import { ClientMembers } from "@/components/clients/client-members";

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  type: string;
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="h-28 animate-pulse p-5" />
            </Card>
          ))}
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <button key={c.id} onClick={() => setOpen(c.id)} className="text-left">
              <Card className="h-full transition-colors hover:border-ring/40">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      {c.type === "AGENCY" ? <Building2 className="h-5 w-5" /> : <Contact className="h-5 w-5" />}
                    </span>
                    {c.type === "AGENCY" && <Badge variant="primary">Agency</Badge>}
                  </div>
                  <div className="mt-3 truncate font-semibold">{c.name}</div>
                  {c.company && <div className="truncate text-sm text-muted-foreground">{c.company}</div>}
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{c._count.projects} campaigns</span>
                    {c.type === "AGENCY" && <span>{c._count.members} members</span>}
                    {c.status === "PAUSED" && <Badge className="bg-muted text-muted-foreground">Paused</Badge>}
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-muted-foreground">No clients match your search.</p>}
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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailOk = /\S+@\S+\.\S+/.test(f.email.trim());
  const ready = !!f.name.trim() && emailOk && f.password.trim().length >= 6;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await api.post("/clients", { ...f, sendInvite });
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
                <label className={lbl}>Password</label>
                <input type="text" className={field} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="min 6 characters" />
              </div>
            </div>
            <div>
              <label className={lbl}>Notes (optional)</label>
              <textarea className={cn(field, "min-h-[70px] resize-none")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </div>

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

  // editable state
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", notes: "", status: "ACTIVE" });
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
      setF({ name: d.name, company: d.company ?? "", email: d.email ?? "", phone: d.phone ?? "", notes: d.notes ?? "", status: d.status });
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
    { key: "members", label: "Members", show: can("clients.manage_agency") && c?.type === "AGENCY" },
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
                  {can("clients.edit") && (
                    <Button onClick={saveDetails} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save details
                    </Button>
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
