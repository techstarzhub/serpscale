"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus, X, Loader2, Users, Building2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: string;
  roleName?: string;
  avatarUrl?: string | null;
}
interface ClientMember {
  id: string;
  name: string | null;
  email: string;
  owner?: boolean;
  avatarUrl?: string | null;
}
interface Client {
  id: string;
  name: string;
  company: string | null;
  type: string;
  logo?: string | null;
  members?: ClientMember[];
}
type Entry = { key: string; id: string; title: string; sub: string; role: string; kind: "member" | "client"; img?: string | null };

function initialsOf(s: string) {
  const t = (s || "?").trim();
  const parts = t.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : t.slice(0, 2)).toUpperCase();
}
const AV_COLORS = [
  "bg-chart-1/15 text-chart-1",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4",
  "bg-primary/15 text-primary",
];
function colorFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

function Avatar({ e, className }: { e: { id: string; title: string; kind: "member" | "client"; img?: string | null }; className?: string }) {
  if (e.img) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={e.img} alt={e.title} title={e.title} className={cn("shrink-0 rounded-full object-cover ring-2 ring-card", className)} />
    );
  }
  return (
    <span
      title={e.title}
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold ring-2 ring-card", colorFor(e.id), className)}
    >
      {e.kind === "client" ? <Building2 className="h-1/2 w-1/2" /> : initialsOf(e.title)}
    </span>
  );
}

const field =
  "w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none transition-colors focus:border-primary";

export function CampaignMembers({
  projectId,
  canManageMembers,
  canManageClients,
}: {
  projectId: string;
  canManageMembers: boolean;
  canManageClients: boolean;
}) {
  const [members, setMembers] = useState<{ assigned: Member[]; assignable: Member[] }>({ assigned: [], assignable: [] });
  const [admins, setAdmins] = useState<Member[]>([]);
  const [clients, setClients] = useState<{ assigned: Client[]; assignable: Client[] }>({ assigned: [], assignable: [] });
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [tab, setTab] = useState<"team" | "clients">(canManageMembers ? "team" : "clients");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const readOnly = !canManageMembers && !canManageClients;

  const load = useCallback(() => {
    setLoading(true);
    const tasks: Promise<unknown>[] = [];
    if (readOnly) {
      // Client / viewer: one read-only call returns just the assigned team.
      tasks.push(
        api
          .get<{ admins: Member[]; members: Member[]; clients: Client[] }>(`/projects/${projectId}/team`)
          .then((r) => { setAdmins(r.admins || []); setMembers({ assigned: r.members || [], assignable: [] }); setClients({ assigned: r.clients || [], assignable: [] }); })
          .catch(() => {}),
      );
    } else {
      if (canManageMembers)
        tasks.push(
          api
            .get<{ admins: Member[]; assigned: Member[]; assignable: Member[] }>(`/projects/${projectId}/members`)
            .then((r) => { setAdmins(r.admins || []); setMembers({ assigned: r.assigned || [], assignable: r.assignable || [] }); })
            .catch(() => {}),
        );
      if (canManageClients)
        tasks.push(
          api
            .get<{ assigned: Client[]; assignable: Client[] }>(`/projects/${projectId}/clients`)
            .then((r) => setClients({ assigned: r.assigned || [], assignable: r.assignable || [] }))
            .catch(() => {}),
        );
    }
    Promise.all(tasks).finally(() => setLoading(false));
  }, [projectId, canManageMembers, canManageClients, readOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleMember(id: string, add: boolean) {
    setBusy(id);
    try {
      if (add) await api.post(`/projects/${projectId}/members`, { userId: id });
      else await api.del(`/projects/${projectId}/members/${id}`);
      load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }
  async function toggleClient(id: string, add: boolean) {
    setBusy(id);
    try {
      if (add) await api.post(`/projects/${projectId}/clients`, { clientId: id });
      else await api.del(`/projects/${projectId}/clients/${id}`);
      load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  const clientRole = (c: Client) => (c.type === "AGENCY" ? "Agency" : "Client");

  // Entries for the avatar cluster + hover preview (members then clients).
  const assignedEntries: Entry[] = useMemo(
    () => [
      ...admins.map((m) => ({ key: "a" + m.id, id: m.id, title: m.name || m.email, sub: m.email, role: m.roleName || roleLabel(m.role), img: m.avatarUrl, kind: "member" as const })),
      ...members.assigned.map((m) => ({ key: "m" + m.id, id: m.id, title: m.name || m.email, sub: m.email, role: m.roleName || roleLabel(m.role), img: m.avatarUrl, kind: "member" as const })),
      ...clients.assigned.map((c) => ({ key: "c" + c.id, id: c.id, title: c.name, sub: c.company || "", role: clientRole(c), img: c.logo, kind: "client" as const })),
    ],
    [admins, members.assigned, clients.assigned],
  );

  // Read-only viewers (clients) only see the cluster if there's a team to show.
  if (readOnly && assignedEntries.length === 0) return null;

  const shown = assignedEntries.slice(0, 4);
  const extra = assignedEntries.length - shown.length;

  // Active tab's assigned + assignable, filtered by the search query.
  const needle = q.trim().toLowerCase();
  const match = (e: Entry) => !needle || e.title.toLowerCase().includes(needle) || e.sub.toLowerCase().includes(needle);
  const teamAssigned: Entry[] = members.assigned.map((m) => ({ key: "m" + m.id, id: m.id, title: m.name || m.email, sub: m.email, role: m.roleName || roleLabel(m.role), img: m.avatarUrl, kind: "member" }));
  const teamAssignable: Entry[] = members.assignable.map((m) => ({ key: "m" + m.id, id: m.id, title: m.name || m.email, sub: m.email, role: m.roleName || roleLabel(m.role), img: m.avatarUrl, kind: "member" }));
  const clientAssigned: Entry[] = clients.assigned.map((c) => ({ key: "c" + c.id, id: c.id, title: c.name, sub: c.company || "", role: clientRole(c), img: c.logo, kind: "client" }));
  const clientAssignable: Entry[] = clients.assignable.map((c) => ({ key: "c" + c.id, id: c.id, title: c.name, sub: c.company || "", role: clientRole(c), img: c.logo, kind: "client" }));

  const activeAssigned = (tab === "team" ? teamAssigned : clientAssigned).filter(match);
  const activeAssignable = (tab === "team" ? teamAssignable : clientAssignable).filter(match);
  const add = (id: string) => (tab === "team" ? toggleMember(id, true) : toggleClient(id, true));
  const remove = (id: string) => (tab === "team" ? toggleMember(id, false) : toggleClient(id, false));

  function TabBtn({ id, label, icon: Icon, count }: { id: "team" | "clients"; label: string; icon: typeof Users; count: number }) {
    return (
      <button
        onClick={() => { setTab(id); setQ(""); }}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
          tab === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary",
        )}
      >
        <Icon className="h-4 w-4" /> {label}
        <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", tab === id ? "bg-primary/15" : "bg-secondary")}>{count}</span>
      </button>
    );
  }

  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" onClick={() => !readOnly && setOpen(true)} className={cn("flex items-center -space-x-2", readOnly && "cursor-default")} title={readOnly ? "Campaign team" : "Manage campaign access"}>
        {shown.map((e) => (
          <Avatar key={e.key} e={e} className="h-8 w-8 text-[10px]" />
        ))}
        {extra > 0 && (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
            +{extra}
          </span>
        )}
        {!readOnly && (
          <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-border bg-card text-muted-foreground ring-2 ring-card transition-colors hover:border-primary hover:text-primary">
            <UserPlus className="h-4 w-4" />
          </span>
        )}
      </button>

      {/* Hover preview — Team (org admins + members) and Clients (each client,
          agency or not, with its own portal people). */}
      {hover && !open && (admins.length > 0 || members.assigned.length > 0 || clients.assigned.length > 0) && (
        <div className="absolute right-0 z-40 mt-2 w-72 space-y-2 rounded-xl border border-border bg-card p-2 shadow-lg">
          {(admins.length > 0 || members.assigned.length > 0) && (
            <PreviewSection label="Team">
              {admins.map((m) => (
                <PreviewRow
                  key={"a" + m.id}
                  e={{ id: m.id, title: m.name || m.email, kind: "member", img: m.avatarUrl }}
                  role={m.roleName || roleLabel(m.role)}
                />
              ))}
              {members.assigned.map((m) => (
                <PreviewRow
                  key={"m" + m.id}
                  e={{ id: m.id, title: m.name || m.email, kind: "member", img: m.avatarUrl }}
                  role={m.roleName || roleLabel(m.role)}
                />
              ))}
            </PreviewSection>
          )}

          {clients.assigned.length > 0 && (
            <PreviewSection label="Clients">
              {clients.assigned.map((c) => (
                <ClientPreview key={"c" + c.id} c={c} />
              ))}
            </PreviewSection>
          )}
        </div>
      )}

      {/* Manage dialog — separate tabs for Team and Clients, each searchable */}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="copilot-pop w-full max-w-md rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-heading text-base font-semibold">Campaign access</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-3 pt-3">
              {canManageMembers && <TabBtn id="team" label="Team" icon={Users} count={members.assigned.length} />}
              {canManageClients && <TabBtn id="clients" label="Clients" icon={Building2} count={clients.assigned.length} />}
            </div>

            {/* Search */}
            <div className="px-3 pt-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  className={field}
                  placeholder={tab === "team" ? "Search team members…" : "Search clients…"}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>

            {/* List */}
            <div className="max-h-[50vh] overflow-y-auto p-3">
              {loading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="space-y-1">
                  {activeAssigned.length === 0 && activeAssignable.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {needle ? "No matches." : tab === "team" ? "No team members yet." : "No clients yet."}
                    </p>
                  )}
                  {activeAssigned.map((e) => (
                    <Row key={"a" + e.key} e={e} state="assigned" busy={busy === e.id} onClick={() => remove(e.id)} />
                  ))}
                  {activeAssignable.length > 0 && (
                    <div className="px-1 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Add {tab === "team" ? "member" : "client"}
                    </div>
                  )}
                  {activeAssignable.map((e) => (
                    <Row key={"b" + e.key} e={e} state="add" busy={busy === e.id} onClick={() => add(e.id)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- hover preview building blocks ----

function PreviewSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function PreviewRow({
  e,
  role,
  indent,
}: {
  e: { id: string; title: string; kind: "member" | "client"; img?: string | null };
  role: string;
  indent?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg px-1.5 py-1", indent && "pl-4")}>
      <Avatar e={e} className={indent ? "h-5 w-5 text-[8px]" : "h-6 w-6 text-[9px]"} />
      <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{role}</span>
    </div>
  );
}

// A client (agency or normal) shown as a small group label, followed by its own
// portal people. Every portal person is a client — badged by the client's type:
// an agency's people are "Agency client", a normal client's are "Client".
function ClientPreview({ c }: { c: Client }) {
  const isAgency = c.type === "AGENCY";
  const memberBadge = isAgency ? "Agency client" : "Client";
  return (
    <div>
      <div className="flex items-center gap-2 px-1.5 pb-0.5 pt-1">
        <Avatar e={{ id: c.id, title: c.name, kind: "client", img: c.logo }} className="h-5 w-5 text-[8px]" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{c.name}</span>
        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{isAgency ? "Agency" : "Client"}</span>
      </div>
      {(c.members ?? []).map((m) => (
        <PreviewRow
          key={m.id}
          e={{ id: m.id, title: m.name || m.email, kind: "member", img: m.avatarUrl }}
          role={memberBadge}
          indent
        />
      ))}
    </div>
  );
}

function Row({
  e,
  state,
  busy,
  onClick,
}: {
  e: Entry;
  state: "assigned" | "add";
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-secondary"
    >
      <Avatar e={e} className="h-8 w-8 text-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{e.title}</div>
        {e.sub && <div className="truncate text-xs text-muted-foreground">{e.sub}</div>}
      </div>
      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{e.role}</span>
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-md",
          state === "assigned" ? "text-muted-foreground group-hover:bg-destructive/10 group-hover:text-destructive" : "text-primary",
        )}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : state === "assigned" ? (
          <X className="h-3.5 w-3.5" />
        ) : (
          <UserPlus className="h-3.5 w-3.5" />
        )}
      </span>
    </button>
  );
}
