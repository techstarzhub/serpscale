"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus, ShieldCheck, Copy, Check, KeyRound, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/components/providers/user-provider";

interface Campaign {
  id: string;
  name: string;
  domain: string;
}

interface Member {
  id: string;
  email: string;
  name: string | null;
  clientOwner: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  clientAllCampaigns?: boolean;
  assignedProjects?: { id: string }[];
}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";

// Manage a client's portal members. Used both by the agency (in the client modal)
// and by a client owner (in their portal "My team" page).
export function ClientMembers({ clientId }: { clientId: string }) {
  const { user } = useCurrentUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ email: string; name: string; owner: boolean; password: string; allCampaigns: boolean; projectIds: string[] }>({
    email: "",
    name: "",
    owner: false,
    password: "",
    allCampaigns: true,
    projectIds: [],
  });
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () =>
    api
      .get<Member[]>(`/clients/${clientId}/members`)
      .then((m) => setMembers(Array.isArray(m) ? m : []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.get<Campaign[]>(`/clients/${clientId}/campaigns`).then((c) => setCampaigns(Array.isArray(c) ? c : [])).catch(() => setCampaigns([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function add() {
    setAdding(true);
    setErr(null);
    setCreated(null);
    try {
      const payload = {
        email: form.email,
        name: form.name,
        owner: form.owner,
        password: form.password,
        allCampaigns: form.owner ? true : form.allCampaigns,
        projectIds: form.owner || form.allCampaigns ? [] : form.projectIds,
      };
      const r = await api.post<{ email: string; tempPassword: string }>(`/clients/${clientId}/members`, payload);
      setCreated({ email: r.email, tempPassword: r.tempPassword });
      setForm({ email: "", name: "", owner: false, password: "", allCampaigns: true, projectIds: [] });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add member.");
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this member's access?")) return;
    try {
      await api.del(`/clients/${clientId}/members/${id}`);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove.");
    }
  }

  async function resetPw(m: Member) {
    if (!confirm(`Reset password for ${m.name || m.email}? A new password will be generated and emailed.`)) return;
    setErr(null);
    try {
      const r = await api.post<{ email: string; tempPassword: string }>(`/clients/${clientId}/members/${m.id}/reset-password`, {});
      setCreated({ email: r.email, tempPassword: r.tempPassword });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reset password.");
    }
  }

  function toggleFormProject(id: string) {
    setForm((f) => ({
      ...f,
      projectIds: f.projectIds.includes(id) ? f.projectIds.filter((x) => x !== id) : [...f.projectIds, id],
    }));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        People here can log in to a read-only portal and see only this client&apos;s campaigns and reports.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-1.5">
          {members.filter((m) => m.isActive).length === 0 && <p className="text-sm text-muted-foreground">No members yet.</p>}
          {members
            .filter((m) => m.isActive)
            .map((m) => {
              const isSelf = !!user && (m.email === user.email || m.id === user.id);
              const allAccess = m.clientOwner || m.clientAllCampaigns !== false;
              const assignedCount = m.assignedProjects?.length ?? 0;
              return (
                <div key={m.id} className="rounded-lg border border-border">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <UserAvatar className="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{m.name || m.email}</span>
                        {isSelf && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">You</span>}
                        {m.clientOwner && (
                          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            <ShieldCheck className="h-3 w-3" /> Owner
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.email}
                        {!m.clientOwner && (
                          <span className="ml-2 text-muted-foreground/80">
                            · {allAccess ? "All campaigns" : `${assignedCount} campaign${assignedCount === 1 ? "" : "s"}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!m.clientOwner && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                          title="Campaign access"
                        >
                          <ListChecks className="h-3.5 w-3.5" /> Campaigns
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => resetPw(m)} title="Reset password">
                        <KeyRound className="h-3.5 w-3.5" /> Reset
                      </Button>
                      {/* You can't remove yourself; the account owner can't be removed either. */}
                      {!isSelf && !m.clientOwner && (
                        <Button variant="outline" size="sm" onClick={() => remove(m.id)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  {editingId === m.id && (
                    <MemberCampaigns
                      clientId={clientId}
                      memberId={m.id}
                      onSaved={() => {
                        setEditingId(null);
                        load();
                      }}
                    />
                  )}
                </div>
              );
            })}
        </div>
      )}

      {created && (
        <div className="rounded-lg border border-chart-2/30 bg-chart-2/10 p-3 text-sm">
          <p className="font-medium">Member added — share these credentials:</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="rounded bg-background px-2 py-1 text-xs">{created.email}</code>
            <code className="rounded bg-background px-2 py-1 text-xs">{created.tempPassword}</code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(`${created.email} / ${created.tempPassword}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="h-4 w-4 text-chart-2" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Add member */}
      <div className="rounded-xl border border-border p-3">
        <div className="mb-2 text-sm font-medium">Add member</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={field} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={field} placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <input className={cn(field, "mt-2")} type="text" placeholder="Password (optional — leave blank to auto-generate & email)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <p className="mt-1 text-xs text-muted-foreground">Blank rakho to system khud ek password bana ke member ko email kar dega.</p>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.checked })} />
          Make this member an owner (can manage other members)
        </label>

        {/* Campaign access — owners always see everything, so hide it for them. */}
        {!form.owner && (
          <div className="mt-3 rounded-lg border border-border p-2.5">
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Campaign access</div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="cAccess" checked={form.allCampaigns} onChange={() => setForm({ ...form, allCampaigns: true })} />
                All campaigns of this client
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="cAccess" checked={!form.allCampaigns} onChange={() => setForm({ ...form, allCampaigns: false })} />
                Only specific campaigns
              </label>
            </div>
            {!form.allCampaigns && (
              <div className="mt-2 max-h-44 space-y-1 overflow-auto rounded-lg border border-border bg-background p-2">
                {campaigns.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-muted-foreground">This client has no campaigns yet.</p>
                ) : (
                  campaigns.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-secondary">
                      <input type="checkbox" checked={form.projectIds.includes(c.id)} onChange={() => toggleFormProject(c.id)} />
                      <span className="truncate">{c.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{c.domain}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
        <Button className="mt-3" onClick={add} disabled={adding || !form.email.trim() || (!form.owner && !form.allCampaigns && form.projectIds.length === 0)}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add member
        </Button>
      </div>
    </div>
  );
}

// Inline editor for an existing member's campaign access.
function MemberCampaigns({ clientId, memberId, onSaved }: { clientId: string; memberId: string; onSaved: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [allCampaigns, setAllCampaigns] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    api
      .get<{ allCampaigns: boolean; assignedIds: string[]; campaigns: Campaign[] }>(`/clients/${clientId}/members/${memberId}/campaigns`)
      .then((r) => {
        setAllCampaigns(r.allCampaigns);
        setSelected(r.assignedIds ?? []);
        setCampaigns(r.campaigns ?? []);
      })
      .catch(() => setErr("Could not load campaigns."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, memberId]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await api.patch(`/clients/${clientId}/members/${memberId}/campaigns`, {
        allCampaigns,
        projectIds: allCampaigns ? [] : selected,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border bg-secondary/30 p-3">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Campaign access</div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={allCampaigns} onChange={() => setAllCampaigns(true)} />
              All campaigns of this client
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={!allCampaigns} onChange={() => setAllCampaigns(false)} />
              Only specific campaigns
            </label>
          </div>
          {!allCampaigns && (
            <div className="mt-2 max-h-44 space-y-1 overflow-auto rounded-lg border border-border bg-background p-2">
              {campaigns.length === 0 ? (
                <p className="px-1 py-1 text-xs text-muted-foreground">This client has no campaigns yet.</p>
              ) : (
                campaigns.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-secondary">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                    <span className="truncate">{c.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{c.domain}</span>
                  </label>
                ))
              )}
            </div>
          )}
          {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" onClick={save} disabled={saving || (!allCampaigns && selected.length === 0)}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save access
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
