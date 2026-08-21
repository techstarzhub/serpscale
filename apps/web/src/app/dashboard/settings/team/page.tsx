"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shield, Users, Plus, Trash2, Loader2, Check, UserPlus, Copy, KeyRound, Eye, Megaphone, Power, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useCan, useCurrentUser, useLimit } from "@/components/providers/user-provider";
import { LockedFeature } from "@/components/ui/locked-feature";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Pagination } from "@/components/ui/pagination";

interface PermItem { key: string; label: string }
interface PermGroup { group: string; items: PermItem[] }
interface Role { id: string; name: string; description: string | null; permissions: string[]; _count?: { users: number } }
interface Member { id: string; email: string; name: string | null; role: string; isActive: boolean; avatarUrl: string | null; customRole: { id: string; name: string } | null }

export default function TeamPage() {
  const limit = useLimit();
  const can = useCan();
  const seats = limit("seats");
  // A team needs more than the single owner seat. Solo plans stay visible but
  // show an upgrade prompt instead of the members/roles UI.
  if (!(seats == null || seats > 1)) {
    return <LockedFeature title="Team management" description="Invite teammates and assign roles. Upgrade to a plan with more than one seat to unlock." canUpgrade={can("billing.manage")} />;
  }
  return <TeamInner />;
}

function TeamInner() {
  const can = useCan();
  const limit = useLimit();
  const seatLimit = limit("seats");
  const allowed = can("team.view") || can("roles.manage");
  const [groups, setGroups] = useState<PermGroup[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [g, r, m] = await Promise.allSettled([
      api.get<{ groups: PermGroup[] }>("/team/permissions"),
      api.get<Role[]>("/team/roles"),
      api.get<Member[]>("/team/members"),
    ]);
    if (g.status === "fulfilled") setGroups(g.value.groups);
    if (r.status === "fulfilled") setRoles(r.value);
    if (m.status === "fulfilled") setMembers(m.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
  }, [allowed, load]);

  if (!allowed) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">You do not have permission to manage the team.</CardContent></Card>;
  }
  if (loading) {
    return <Card><CardContent className="flex items-center gap-3 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading team…</CardContent></Card>;
  }

  return (
    <div className="space-y-5">
      <RolesSection groups={groups} roles={roles} onChange={load} canManage={can("roles.manage")} />
      <MembersSection members={members} roles={roles} onChange={load} canManage={can("team.manage")} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
function RolesSection({ groups, roles, onChange, canManage }: { groups: PermGroup[]; roles: Role[]; onChange: () => void; canManage: boolean }) {
  const [editing, setEditing] = useState<Role | "new" | null>(null);

  return (
    <Card data-tour="setup-roles">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /><CardTitle className="text-base">Roles &amp; permissions</CardTitle></div>
          <CardDescription>Create roles and choose exactly what each can do.</CardDescription>
        </div>
        {canManage && editing == null && (
          <Button data-tour="new-role" size="sm" className="gap-1.5" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New role</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {editing != null && (
          <RoleEditor groups={groups} role={editing === "new" ? null : editing} onDone={() => { setEditing(null); onChange(); }} onCancel={() => setEditing(null)} />
        )}
        {roles.length === 0 && editing == null && <p className="text-sm text-muted-foreground">No custom roles yet. Create one to control access.</p>}
        {roles.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl border border-border p-3">
            <div className="min-w-0">
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-muted-foreground">{r.permissions.length} permissions · {r._count?.users ?? 0} members{r.description ? ` · ${r.description}` : ""}</div>
            </div>
            {canManage && (
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Edit</Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={async () => { try { await api.del(`/team/roles/${r.id}`); onChange(); } catch (e) { alert(e instanceof Error ? e.message : "Could not delete role"); } }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RoleEditor({ groups, role, onDone, onCancel }: { groups: PermGroup[]; role: Role | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [desc, setDesc] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [saving, setSaving] = useState(false);

  const toggle = (k: string) => setPerms((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleGroup = (items: PermItem[], on: boolean) => setPerms((s) => { const n = new Set(s); items.forEach((i) => (on ? n.add(i.key) : n.delete(i.key))); return n; });

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), description: desc, permissions: [...perms] };
      if (role) await api.patch(`/team/roles/${role.id}`, body);
      else await api.post("/team/roles", body);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Input placeholder="Role name (e.g. Analyst)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="mt-4 space-y-4">
        {groups.map((g) => {
          const allOn = g.items.every((i) => perms.has(i.key));
          return (
            <div key={g.group}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</span>
                <button className="text-xs text-primary hover:underline" onClick={() => toggleGroup(g.items, !allOn)}>{allOn ? "Clear" : "Select all"}</button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((i) => {
                  const on = perms.has(i.key);
                  return (
                    <button key={i.key} onClick={() => toggle(i.key)} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors", on ? "border-primary bg-primary/10" : "border-border hover:bg-secondary")}>
                      <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded", on ? "bg-primary text-primary-foreground" : "border border-border")}>{on && <Check className="h-3 w-3" />}</span>
                      <span className="truncate">{i.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !name.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save role"}</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
function MembersSection({ members, roles, onChange, canManage }: { members: Member[]; roles: Role[]; onChange: () => void; canManage: boolean }) {
  const { user } = useCurrentUser();
  const confirm = useConfirm();
  // Only a real admin (not already viewing as someone) can "view as" a member.
  const canImpersonate = (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") && !user?.impersonating;
  const isAdmin = user?.role === "ADMIN"; // only a full admin can create/promote admins
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [tempPw, setTempPw] = useState<{ email: string; pw: string } | null>(null);
  const [orgProjects, setOrgProjects] = useState<{ id: string; name: string; domain: string }[]>([]);
  const [campMember, setCampMember] = useState<Member | null>(null);
  const [campIds, setCampIds] = useState<Set<string>>(new Set());
  const [campSaving, setCampSaving] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => { api.get<typeof orgProjects>("/team/projects").then(setOrgProjects).catch(() => {}); }, []);

  useEffect(() => { setPage(1); }, [q, pageSize, members.length]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((m) =>
      [m.name || "", m.email || "", m.role, m.customRole?.name || ""].join(" ").toLowerCase().includes(needle),
    );
  }, [members, q]);
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  async function openCampaigns(m: Member) {
    setCampMember(m);
    setCampIds(new Set());
    try {
      const ids = await api.get<string[]>(`/team/members/${m.id}/projects`);
      setCampIds(new Set(ids));
    } catch { /* none */ }
  }
  async function saveCampaigns() {
    if (!campMember) return;
    setCampSaving(true);
    try {
      await api.put(`/team/members/${campMember.id}/projects`, { projectIds: [...campIds] });
      setCampMember(null);
      onChange();
    } finally {
      setCampSaving(false);
    }
  }

  async function invite() {
    if (!email.trim()) return;
    setInviteErr(null);
    setSaving(true);
    try {
      const base = roleId === "ADMIN"
        ? { email: email.trim(), name: name.trim() || undefined, role: "ADMIN" }
        : { email: email.trim(), name: name.trim() || undefined, customRoleId: roleId || undefined };
      const payload = pw.trim() ? { ...base, password: pw.trim() } : base;
      const res = await api.post<{ email: string; tempPassword: string }>("/team/members", payload);
      setTempPw({ email: res.email, pw: res.tempPassword });
      setEmail(""); setName(""); setRoleId(""); setPw(""); setInviting(false);
      onChange();
    } catch (e) {
      setInviteErr(e instanceof Error ? e.message : "Could not send invite.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    {campMember && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setCampMember(null)}>
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="text-base font-semibold">Assign campaigns</div>
          <div className="text-sm text-muted-foreground">{campMember.name || campMember.email} will only see the campaigns you tick.</div>
          <div className="mt-3 max-h-[320px] space-y-1 overflow-auto">
            {orgProjects.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No campaigns in this organization yet.</p>}
            {orgProjects.map((p) => {
              const on = campIds.has(p.id);
              return (
                <button key={p.id} onClick={() => setCampIds((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} className={cn("flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors", on ? "border-primary bg-primary/10" : "border-border hover:bg-secondary")}>
                  <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded", on ? "bg-primary text-primary-foreground" : "border border-border")}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="block truncate text-xs text-muted-foreground">{p.domain}</span></span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setCampMember(null)}>Cancel</Button>
            <Button size="sm" onClick={saveCampaigns} disabled={campSaving}>{campSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save access"}</Button>
          </div>
        </div>
      </div>
    )}
    <Card data-tour="setup-members">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><CardTitle className="text-base">Team members</CardTitle></div>
          <CardDescription>
            Invite people, assign roles and campaigns.
            {seatLimit != null && <span className={cn("ml-2 font-medium", members.length >= seatLimit ? "text-destructive" : "text-muted-foreground")}>{members.length} / {seatLimit} seats used</span>}
          </CardDescription>
        </div>
        {canManage && !inviting && (
          seatLimit != null && members.length >= seatLimit ? (
            <Button size="sm" variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => window.location.href = "/dashboard/settings/billing"}>
              <UserPlus className="h-4 w-4" /> Upgrade to invite
            </Button>
          ) : (
            <Button data-tour="invite-member" size="sm" className="gap-1.5" onClick={() => { setInviteErr(null); setInviting(true); }}><UserPlus className="h-4 w-4" /> Invite</Button>
          )
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {tempPw && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 p-3 text-sm">
            <div><b>{tempPw.email}</b> invited. Temp password: <code className="rounded bg-secondary px-1.5 py-0.5 font-mono">{tempPw.pw}</code> — share it; they reset on first login.</div>
            <button onClick={() => navigator.clipboard?.writeText(tempPw.pw)} className="shrink-0 text-muted-foreground hover:text-foreground"><Copy className="h-4 w-4" /></button>
          </div>
        )}
        {inviting && (
          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <div className="grid gap-2.5 sm:grid-cols-3">
              <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="h-9 rounded-md border border-border bg-card px-2 text-sm">
                <option value="">Default (Member)</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                {isAdmin && <option value="ADMIN">Admin (full access)</option>}
              </select>
            </div>
            <div className="mt-2.5">
              <Input
                type="password"
                placeholder="Set a password (optional — leave blank to auto-generate)"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
              />
              {pw.trim().length > 0 && pw.trim().length < 8 && (
                <p className="mt-1 text-xs text-destructive">Password must be at least 8 characters.</p>
              )}
            </div>
            {inviteErr && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <span className="shrink-0">⚠</span>
                {inviteErr}
                {/plan|limit|upgrade|seat/i.test(inviteErr) && <a href="/dashboard/settings/billing" className="ml-1 font-semibold underline underline-offset-2">Upgrade</a>}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setInviting(false); setInviteErr(null); }}>Cancel</Button>
              <Button size="sm" onClick={invite} disabled={saving || !email.trim() || (pw.trim().length > 0 && pw.trim().length < 8)}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invite"}</Button>
            </div>
          </div>
        )}
        {members.length > 5 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search members by name, email or role…" className="h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-border">
        <div className="divide-y divide-border">
          {paged.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No members match your search.</div>
          )}
          {paged.map((m) => (
            <div key={m.id} className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:gap-4">
              {/* Member identity */}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <UserAvatar src={m.avatarUrl} className="h-9 w-9" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name || (m.email ?? "").split("@")[0] || "Member"}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
              </div>

              {/* Role + status */}
              <div className="flex flex-wrap items-center gap-2">
                {canManage && m.id !== user?.id && (m.role !== "ADMIN" || isAdmin) ? (
                  <select
                    value={m.role === "ADMIN" ? "ADMIN" : m.customRole?.id ?? ""}
                    onChange={async (e) => {
                      const v = e.target.value;
                      try {
                        // Only send a role-level change (needs admin) when actually promoting/demoting.
                        if (v === "ADMIN") await api.patch(`/team/members/${m.id}`, { role: "ADMIN" });
                        else if (m.role === "ADMIN") await api.patch(`/team/members/${m.id}`, { role: "MEMBER", customRoleId: v || null });
                        else await api.patch(`/team/members/${m.id}`, { customRoleId: v || null });
                        onChange();
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Could not update role");
                        onChange();
                      }
                    }}
                    className="h-8 rounded-md border border-border bg-card px-2 text-xs"
                  >
                    <option value="">Member (default)</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    {isAdmin && <option value="ADMIN">Admin (full access)</option>}
                  </select>
                ) : (
                  <span className="text-xs text-muted-foreground">{m.role === "ADMIN" ? "Admin" : m.customRole?.name ?? "Member"}</span>
                )}
                <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", m.isActive ? "bg-chart-2/12 text-chart-2" : "bg-muted text-muted-foreground")}>{m.isActive ? "Active" : "Inactive"}</span>
              </div>

              {/* Actions — collapsed into a single ⋮ menu */}
              {canManage && (
                <div className="flex justify-start lg:justify-end">
                  <DropdownMenu
                    items={[
                      {
                        label: "Login as",
                        icon: <Eye className="h-4 w-4" />,
                        hidden: !(canImpersonate && m.id !== user?.id && m.role !== "ADMIN"),
                        onClick: async () => { if (!(await confirm({ title: "Login as this member?", description: `You'll browse the dashboard as ${m.name || m.email}. A banner lets you return to your own account anytime.`, confirmText: "Login as" }))) return; try { await api.post("/auth/impersonate", { userId: m.id }); window.location.href = "/dashboard"; } catch (e) { alert(e instanceof Error ? e.message : "Could not view as this user"); } },
                      },
                      {
                        label: "Reset password",
                        icon: <KeyRound className="h-4 w-4" />,
                        onClick: async () => { if (!(await confirm({ title: "Reset password?", description: `A new password will be generated for ${m.name || m.email} and emailed to them.`, confirmText: "Reset password" }))) return; try { const r = await api.post<{ email: string; tempPassword: string }>(`/team/members/${m.id}/reset-password`, {}); setTempPw({ email: r.email, pw: r.tempPassword }); } catch (e) { alert(e instanceof Error ? e.message : "Could not reset password"); } },
                      },
                      {
                        label: "Campaigns",
                        icon: <Megaphone className="h-4 w-4" />,
                        hidden: m.role === "ADMIN",
                        onClick: () => openCampaigns(m),
                      },
                      {
                        label: m.isActive ? "Deactivate" : "Activate",
                        icon: <Power className="h-4 w-4" />,
                        hidden: m.role === "ADMIN",
                        onClick: async () => { try { await api.patch(`/team/members/${m.id}`, { isActive: !m.isActive }); onChange(); } catch (e) { alert(e instanceof Error ? e.message : "Could not update member"); } },
                      },
                      {
                        label: "Delete",
                        icon: <Trash2 className="h-4 w-4" />,
                        destructive: true,
                        hidden: !(m.id !== user?.id && (m.role !== "ADMIN" || isAdmin)),
                        onClick: async () => { if (!(await confirm({ title: "Delete member?", description: `Permanently delete ${m.name || m.email}. This removes their account and access and cannot be undone.`, confirmText: "Delete", destructive: true }))) return; try { await api.del(`/team/members/${m.id}`); onChange(); } catch (e) { alert(e instanceof Error ? e.message : "Could not delete member"); } },
                      },
                    ]}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[10, 25, 50]}
          label="members"
        />
        </div>
      </CardContent>
    </Card>
    </>
  );
}
