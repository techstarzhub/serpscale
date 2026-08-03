"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Loader2, Clock, Filter, Users, UserCircle, Layers, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { Pagination } from "@/components/ui/pagination";
import { api } from "@/lib/api";
import { useCan } from "@/components/providers/user-provider";

interface Actor {
  id: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  avatarUrl: string | null;
  clientId: string | null;
  clientName: string | null;
}
interface ActivityRow {
  id: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  scope: "team" | "client";
  actor: Actor;
}

function initials(name?: string | null) {
  return (name || "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

function ago(iso: string) {
  const d = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Turn an "entity.verb" action key into a human sentence. Falls back to a
// prettified version of the raw key so new actions still read sensibly.
const VERBS: Record<string, string> = {
  "auth.login": "signed in",
  "client.create": "created a client",
  "client.update": "updated a client",
  "client.delete": "deleted a client",
  "client.branding.update": "updated client branding",
  "client.campaigns.assign": "assigned campaigns to a client",
  "client.agency.update": "updated client agency settings",
  "client.member.add": "added a client member",
  "client.member.campaigns": "changed a client member's campaigns",
  "client.member.remove": "removed a client member",
  "client.member.password.reset": "reset a client member's password",
  "client.password.reset": "reset a client's password",
  "user.invite": "invited a team member",
  "user.update": "updated a team member",
  "user.delete": "removed a team member",
  "user.password.reset": "reset a member's password",
  "user.projects.assign": "changed a member's campaign access",
  "user.profile.update": "updated their profile",
  "user.password.change": "changed their password",
  "user.onboarding.complete": "completed onboarding",
  "user.avatar.update": "updated their photo",
  "user.avatar.remove": "removed their photo",
  "role.create": "created a role",
  "role.update": "updated a role",
  "role.delete": "deleted a role",
  "org.branding.update": "updated agency branding",
  "org.smtp.update": "updated agency email settings",
  "project.create": "created a campaign",
  "project.update": "updated a campaign",
  "project.archive": "archived a campaign",
  "project.restore": "restored a campaign",
  "project.delete": "deleted a campaign",
  "project.share.create": "created a public share link",
  "project.share.revoke": "revoked a public share link",
  "project.keyword.add": "added a tracked keyword",
  "project.keyword.remove": "removed a tracked keyword",
  "project.audit.run": "started a site audit",
  "project.report.send": "sent a report",
  "project.member.assign": "assigned a member to a campaign",
  "project.member.unassign": "removed a member from a campaign",
  "project.client.attach": "linked a client to a campaign",
  "project.client.detach": "unlinked a client from a campaign",
  "content.blog.generate": "generated a blog with AI",
  "content.blog.save": "saved a blog draft",
  "content.blog.delete": "deleted a blog draft",
  "content.image.generate": "generated an AI image",
  "content.keyword.save": "saved a keyword",
  "content.keyword.remove": "removed a saved keyword",
  "integration.google.disconnect": "disconnected a Google account",
  "github.connect": "connected a GitHub repo",
  "github.disconnect": "disconnected a GitHub repo",
  "autofix.pr.open": "opened an auto-fix pull request",
  "access.request": "requested access",
  "access.approve": "approved an access request",
  "access.deny": "denied an access request",
  "billing.checkout": "started checkout for a plan",
  "billing.trial.start": "started a trial",
  "billing.confirm": "confirmed a subscription",
  "billing.cancel": "cancelled the subscription",
  "billing.change.schedule": "scheduled a plan change",
  "billing.change.cancel": "cancelled a scheduled plan change",
  "auth.impersonate.start": "started viewing as another user",
  "auth.impersonate.stop": "stopped viewing as another user",
};

function describe(action: string): string {
  return VERBS[action] || action.replace(/[._]/g, " ");
}

// Group an action key into a broad category for the category filter.
const CATEGORY_LABELS: Record<string, string> = {
  campaigns: "Campaigns",
  content: "Content",
  clients: "Clients",
  team: "Team & roles",
  billing: "Billing",
  access: "Access requests",
  security: "Security",
  integrations: "Integrations",
  other: "Other",
};
function categoryOf(action: string): string {
  const p = action.split(".")[0];
  if (p === "project") return "campaigns";
  if (p === "content") return "content";
  if (p === "client") return "clients";
  if (p === "user" || p === "role" || p === "org") return "team";
  if (p === "billing") return "billing";
  if (p === "access") return "access";
  if (p === "auth") return "security";
  if (p === "integration" || p === "github") return "integrations";
  return "other";
}

export default function ActivityLogPage() {
  const can = useCan();
  const allowed = can("team.manage");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "team" | "client">("all");
  const [category, setCategory] = useState("all");
  const [actor, setActor] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    api
      .get<{ logs: ActivityRow[] }>("/team/activity?limit=500")
      .then((r) => setRows(Array.isArray(r?.logs) ? r.logs : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [allowed]);

  // Any filter change resets to the first page.
  useEffect(() => { setPage(1); }, [q, scope, category, actor, pageSize]);

  // Category options — only those actually present, plus an "All" default.
  const categoryOptions = useMemo<ComboOption[]>(() => {
    const present = new Set(rows.map((r) => categoryOf(r.action)));
    const opts: ComboOption[] = [{ value: "all", label: "All activity" }];
    for (const key of Object.keys(CATEGORY_LABELS)) {
      if (present.has(key)) opts.push({ value: key, label: CATEGORY_LABELS[key] });
    }
    return opts;
  }, [rows]);

  // Actor options — one per unique person in the feed.
  const actorOptions = useMemo<ComboOption[]>(() => {
    const map = new Map<string, ComboOption>();
    for (const r of rows) {
      const key = r.actor.id || r.actor.email;
      if (!key || map.has(key)) continue;
      map.set(key, {
        value: key,
        label: r.actor.name || r.actor.email || "Unknown",
        hint: r.scope === "client" ? (r.actor.clientName || "Client") : "Team",
      });
    }
    return [{ value: "all", label: "All people" }, ...[...map.values()].sort((a, b) => a.label.localeCompare(b.label))];
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope !== "all" && r.scope !== scope) return false;
      if (category !== "all" && categoryOf(r.action) !== category) return false;
      if (actor !== "all" && (r.actor.id || r.actor.email) !== actor) return false;
      if (!needle) return true;
      const hay = [
        describe(r.action),
        r.action,
        r.target || "",
        r.actor.name || "",
        r.actor.email || "",
        r.actor.clientName || "",
      ].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, scope, category, actor]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const uniqueActors = useMemo(() => new Set(rows.map((r) => r.actor.email).filter(Boolean)).size, [rows]);
  const clientEvents = useMemo(() => rows.filter((r) => r.scope === "client").length, [rows]);

  if (!allowed) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">You do not have permission to view the activity log.</CardContent></Card>;
  }
  if (loading) {
    return <Card><CardContent className="flex items-center gap-3 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading activity…</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-base font-semibold">Activity log</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Everything your team and clients have done — sign-ins, member and role changes, client updates and more, newest first. Read-only actions aren&apos;t recorded, so this stays a clean audit trail.
        </p>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { label: "Total events", value: String(rows.length) },
          { label: "People", value: String(uniqueActors) },
          { label: "Client actions", value: String(clientEvents) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums leading-none">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by action, name, email or client…" className="h-10 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex shrink-0 rounded-lg border border-border bg-card p-0.5">
            {([
              { key: "all", label: "All" },
              { key: "team", label: "Team" },
              { key: "client", label: "Clients" },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setScope(t.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  scope === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Combobox
            value={category}
            onChange={setCategory}
            options={categoryOptions}
            placeholder="All activity"
            searchPlaceholder="Filter categories…"
            icon={<Layers className="h-4 w-4 text-muted-foreground" />}
            className="sm:w-56"
          />
          <Combobox
            value={actor}
            onChange={setActor}
            options={actorOptions}
            placeholder="All people"
            searchPlaceholder="Search people…"
            icon={<UserIcon className="h-4 w-4 text-muted-foreground" />}
            className="sm:w-64"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No activity yet. As your team and clients work, their actions will appear here." : "No events match your filters."}
          </CardContent>
        ) : (
          <>
          <div className="divide-y divide-border">
            {paged.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                {r.actor.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.actor.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(r.actor.name || r.actor.email)}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.actor.name || r.actor.email || "Unknown"}</span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
                        r.scope === "client" ? "bg-chart-1/12 text-chart-1" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {r.scope === "client" ? <UserCircle className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                      {r.scope === "client" ? (r.actor.clientName || "Client") : "Team"}
                    </span>
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {describe(r.action)}
                    {r.target ? <span className="font-medium text-foreground"> — {r.target}</span> : null}
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{ago(r.createdAt)}</span>
              </div>
            ))}
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            label="events"
          />
          </>
        )}
      </Card>
    </div>
  );
}
