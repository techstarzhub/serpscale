"use client";

import { Building2, FolderOpen, User, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CampaignsTable, type CampaignRow } from "./campaigns-table";

export type GroupBy = "none" | "client" | "member" | "health";

interface ClientInfo {
  id: string;
  name: string;
  type: string;
  branding?: { agencyName?: string | null; logoDataUrl?: string | null; logoBg?: string | null } | null;
  projectIds: string[];
}

interface Group { key: string; label: string; kind: GroupBy; badge?: string; branding?: ClientInfo["branding"]; rows: CampaignRow[] }

// Build the section list for the chosen grouping. A campaign can appear in more
// than one client/member group; anything without a value falls into "Unassigned".
function buildGroups(groupBy: GroupBy, rows: CampaignRow[], clients: ClientInfo[]): Group[] {
  if (groupBy === "client") {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const seen = new Set<string>();
    const groups: Group[] = clients
      .map((c) => {
        const rs = c.projectIds.map((id) => byId.get(id)).filter((r): r is CampaignRow => !!r);
        rs.forEach((r) => seen.add(r.id));
        return { key: c.id, label: c.branding?.agencyName || c.name, kind: "client" as const, badge: c.type, branding: c.branding, rows: rs };
      })
      .filter((g) => g.rows.length);
    const un = rows.filter((r) => !seen.has(r.id));
    if (un.length) groups.push({ key: "__un", label: "Unassigned", kind: "client", rows: un });
    return groups;
  }
  if (groupBy === "member") {
    const map = new Map<string, { label: string; rows: CampaignRow[] }>();
    const none: CampaignRow[] = [];
    for (const r of rows) {
      const ms = r.members ?? [];
      if (!ms.length) { none.push(r); continue; }
      for (const m of ms) {
        if (!map.has(m.id)) map.set(m.id, { label: m.name || m.email, rows: [] });
        map.get(m.id)!.rows.push(r);
      }
    }
    const groups: Group[] = [...map.entries()].map(([id, v]) => ({ key: id, label: v.label, kind: "member", rows: v.rows }));
    if (none.length) groups.push({ key: "__un", label: "No members assigned", kind: "member", rows: none });
    return groups;
  }
  if (groupBy === "health") {
    const bands: { key: string; label: string; test: (h: number | null) => boolean }[] = [
      { key: "good", label: "Good (80+)", test: (h) => h != null && h >= 80 },
      { key: "ok", label: "Needs work (50–79)", test: (h) => h != null && h >= 50 && h < 80 },
      { key: "poor", label: "Poor (<50)", test: (h) => h != null && h < 50 },
      { key: "none", label: "No audit", test: (h) => h == null },
    ];
    return bands
      .map((b) => ({ key: b.key, label: b.label, kind: "health" as const, rows: rows.filter((r) => b.test(r.metrics.audit?.healthScore ?? null)) }))
      .filter((g) => g.rows.length);
  }
  return [];
}

function GroupIcon({ kind, branding }: { kind: GroupBy; branding?: ClientInfo["branding"] }) {
  if (kind === "client") {
    if (branding?.logoDataUrl) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={branding.logoDataUrl} alt="" className="h-8 w-8 rounded-lg object-contain" style={branding.logoBg ? { backgroundColor: branding.logoBg } : undefined} />;
    }
    return <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span>;
  }
  const Icon = kind === "member" ? User : kind === "health" ? Gauge : FolderOpen;
  return <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-muted-foreground"><Icon className="h-4 w-4" /></span>;
}

export function GroupedCampaigns({
  groupBy,
  rows,
  clients,
  clientsById,
  showClient = false,
  days = 28,
}: {
  groupBy: GroupBy;
  rows: CampaignRow[];
  clients: ClientInfo[];
  clientsById?: Map<string, { name: string; type: string }>;
  showClient?: boolean;
  days?: number;
}) {
  const groups = buildGroups(groupBy, rows, clients);
  if (!groups.length) return <CampaignsTable rows={rows} clientsById={clientsById} showClient={showClient} days={days} />;

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <GroupIcon kind={g.kind} branding={g.branding} />
            <h3 className="font-heading text-base font-semibold">{g.label}</h3>
            {g.badge && <Badge variant={g.badge === "AGENCY" ? "primary" : "outline"}>{g.badge === "AGENCY" ? "Agency" : "Client"}</Badge>}
            <span className="text-sm text-muted-foreground">{g.rows.length} campaign{g.rows.length === 1 ? "" : "s"}</span>
          </div>
          <CampaignsTable rows={g.rows} clientsById={clientsById} showClient={groupBy !== "client" && showClient} days={days} />
        </section>
      ))}
    </div>
  );
}
