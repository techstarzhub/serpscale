"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, Clock, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useCan } from "@/components/providers/user-provider";

interface Activity {
  id: string;
  kind: string;
  term: string;
  createdAt: string;
  user: { name: string; email: string; avatarUrl: string | null };
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
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

export default function SearchActivityPage() {
  const can = useCan();
  const allowed = can("team.manage");
  const [rows, setRows] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    api
      .get<Activity[]>("/projects/search-activity/all")
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [allowed]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) => r.term.toLowerCase().includes(needle) || r.user.name.toLowerCase().includes(needle) || r.user.email.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const uniqueUsers = useMemo(() => new Set(rows.map((r) => r.user.email)).size, [rows]);

  if (!allowed) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">You do not have permission to view search activity.</CardContent></Card>;
  }
  if (loading) {
    return <Card><CardContent className="flex items-center gap-3 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading activity…</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-base font-semibold">Search activity</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Every keyword and SERP lookup your team has run, newest first. Re-running an existing search reuses the cached result, so it costs nothing.
        </p>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { label: "Total searches", value: String(rows.length) },
          { label: "Team members", value: String(uniqueUsers) },
          { label: "Unique terms", value: String(new Set(rows.map((r) => r.term.toLowerCase())).size) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums leading-none">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="relative">
        <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Filter by term, name or email…" className="h-10 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No searches yet. Once your team uses the SERP Explorer, their searches will appear here." : "No searches match your filter."}
          </CardContent>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                {r.user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.user.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(r.user.name)}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.user.name}</span>
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize", r.kind === "serp" ? "bg-chart-1/12 text-chart-1" : "bg-secondary text-muted-foreground")}>{r.kind === "serp" ? "SERP" : "Keyword"}</span>
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    searched <span className="font-medium text-foreground">&ldquo;{r.term}&rdquo;</span>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{ago(r.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
