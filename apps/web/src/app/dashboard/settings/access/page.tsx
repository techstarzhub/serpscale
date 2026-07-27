"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, X, KeyRound, LayoutGrid, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useCan, useCurrentUser } from "@/components/providers/user-provider";
import { Combobox } from "@/components/ui/combobox";
import { CampaignRequestInput } from "@/components/access/campaign-request-input";
import { ReviewerPicker } from "@/components/access/reviewer-picker";

interface Options {
  permissions: { key: string; label: string; group: string }[];
}
interface MyReq { id: string; type: string; target: string; targetLabel: string; status: string; note: string | null; createdAt: string }
interface Pending { id: string; type: string; targetLabel: string; note: string | null; createdAt: string; requester: { name: string | null; email: string } }

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";

function StatusBadge({ s }: { s: string }) {
  const tone = s === "APPROVED" ? "bg-chart-2/12 text-chart-2" : s === "DENIED" ? "bg-destructive/10 text-destructive" : "bg-chart-3/15 text-chart-3";
  return <Badge className={cn("px-1.5 py-0 text-[10px]", tone)}>{s === "PENDING" ? "Pending" : s === "APPROVED" ? "Approved" : "Declined"}</Badge>;
}

export default function AccessRequestPage() {
  const can = useCan();
  const { user } = useCurrentUser();
  const isReviewer = can("team.manage");
  // Admins / super-admins already have full access — they review requests, they
  // don't make them. Hide the request form + "my requests" for them.
  const hasFullAccess = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";

  const [opts, setOpts] = useState<Options>({ permissions: [] });
  const [mine, setMine] = useState<MyReq[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState<"permission" | "project">("permission");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function loadMine() {
    return Promise.all([
      api.get<Options>("/access-requests/options").then(setOpts).catch(() => {}),
      api.get<MyReq[]>("/access-requests/mine").then((r) => setMine(Array.isArray(r) ? r : [])).catch(() => {}),
      isReviewer ? api.get<Pending[]>("/access-requests/pending").then((r) => setPending(Array.isArray(r) ? r : [])).catch(() => {}) : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }

  useEffect(() => {
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!target) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await api.post("/access-requests", { type, target, note: note.trim() || undefined, recipientIds: recipients });
      setTarget(""); setNote(""); setRecipients([]);
      setMsg("Request sent to your admins.");
      await loadMine();
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not send request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(id: string, approve: boolean) {
    setPending((p) => p.filter((x) => x.id !== id));
    try {
      await api.post(`/access-requests/${id}/decide`, { approve });
    } catch {
      loadMine();
    }
  }

  const permOptions = opts.permissions.map((p) => ({ value: p.key, label: p.label, hint: p.group }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">{hasFullAccess ? "Access requests" : "Request access"}</h2>
        <p className="text-sm text-muted-foreground">
          {hasFullAccess
            ? "Review and approve access requests from your team. You already have full access."
            : "Ask your admins for a campaign or a permission you don't have yet."}
        </p>
      </div>

      {loading ? (
        <Card><CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</CardContent></Card>
      ) : (
        <>
          {/* Reviewer: pending requests */}
          {isReviewer && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4 text-primary" /> Pending requests {pending.length > 0 && <Badge variant="primary">{pending.length}</Badge>}</CardTitle>
                <CardDescription>Approve to grant the access, or decline.</CardDescription>
              </CardHeader>
              <CardContent>
                {pending.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">No pending requests.</p>
                ) : (
                  <div className="space-y-2">
                    {pending.map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="text-sm">
                            <span className="font-medium">{r.requester.name || r.requester.email}</span> wants{" "}
                            {r.type === "project" ? "campaign" : "permission"} <span className="font-medium">“{r.targetLabel}”</span>
                          </div>
                          {r.note && <div className="text-xs text-muted-foreground">“{r.note}”</div>}
                        </div>
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={() => decide(r.id, true)}><Check className="h-4 w-4" /> Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => decide(r.id, false)}><X className="h-4 w-4" /> Decline</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Request form — hidden for admins/super-admins (they have full access) */}
          {!hasFullAccess && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">New request</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <button onClick={() => { setType("permission"); setTarget(""); }} className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm", type === "permission" ? "border-primary bg-primary/10 text-primary" : "border-border")}>
                  <KeyRound className="h-4 w-4" /> Permission
                </button>
                <button onClick={() => { setType("project"); setTarget(""); }} className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm", type === "project" ? "border-primary bg-primary/10 text-primary" : "border-border")}>
                  <LayoutGrid className="h-4 w-4" /> Campaign
                </button>
              </div>

              {type === "permission" ? (
                <>
                  {permOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">You already have every permission.</p>
                  ) : (
                    <Combobox value={target} onChange={setTarget} options={permOptions} placeholder="Search a permission…" searchPlaceholder="Search permissions…" className="w-full" icon={<KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />} />
                  )}
                  <ReviewerPicker value={recipients} onChange={setRecipients} />
                  <textarea className={cn(field, "min-h-[64px] resize-none")} placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                  {msg && <p className="text-sm text-chart-2">{msg}</p>}
                  <Button onClick={submit} disabled={submitting || !target || recipients.length === 0}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send request</Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Type the website you need access to. Matching campaigns appear as you type.</p>
                  <CampaignRequestInput onDone={loadMine} />
                </>
              )}
            </CardContent>
          </Card>
          )}

          {/* My requests — only relevant to non-admins who actually request access */}
          {!hasFullAccess && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">My requests</CardTitle></CardHeader>
            <CardContent>
              {mine.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">You haven&apos;t requested anything yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {mine.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm"><span className="text-muted-foreground">{r.type === "project" ? "Campaign" : "Permission"}:</span> <span className="font-medium">{r.targetLabel}</span></div>
                        {r.note && <div className="truncate text-xs text-muted-foreground">“{r.note}”</div>}
                      </div>
                      <StatusBadge s={r.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </>
      )}
    </div>
  );
}
