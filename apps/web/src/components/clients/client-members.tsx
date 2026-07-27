"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus, ShieldCheck, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { api } from "@/lib/api";

interface Member {
  id: string;
  email: string;
  name: string | null;
  clientOwner: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";

// Manage a client's portal members. Used both by the agency (in the client modal)
// and by a client owner (in their portal "My team" page).
export function ClientMembers({ clientId }: { clientId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: "", name: "", owner: false });
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () =>
    api
      .get<Member[]>(`/clients/${clientId}/members`)
      .then((m) => setMembers(Array.isArray(m) ? m : []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function add() {
    setAdding(true);
    setErr(null);
    setCreated(null);
    try {
      const r = await api.post<{ email: string; tempPassword: string }>(`/clients/${clientId}/members`, form);
      setCreated({ email: r.email, tempPassword: r.tempPassword });
      setForm({ email: "", name: "", owner: false });
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
            .map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <UserAvatar className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{m.name || m.email}</span>
                    {m.clientOwner && (
                      <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        <ShieldCheck className="h-3 w-3" /> Owner
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => remove(m.id)}>
                  Remove
                </Button>
              </div>
            ))}
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
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.checked })} />
          Make this member an owner (can manage other members)
        </label>
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
        <Button className="mt-3" onClick={add} disabled={adding || !form.email.trim()}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add member
        </Button>
      </div>
    </div>
  );
}
