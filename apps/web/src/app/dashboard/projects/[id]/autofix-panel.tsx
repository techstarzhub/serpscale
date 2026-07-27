"use client";

import { useEffect, useState } from "react";
import { Github, Loader2, CheckCircle2, GitPullRequest, Unlink, Wrench, ExternalLink, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ConnStatus {
  connected: boolean;
  owner?: string;
  repo?: string;
  defaultBranch?: string | null;
}
interface FileChange { path: string; action: string; reason: string }
interface ManualItem { code: string; note: string }
interface Plan { domain: string; files: FileChange[]; manual: ManualItem[] }
interface PrResult { url: string; number: number; branch: string; plan: Plan }

function useConnection(projectId: string) {
  const [status, setStatus] = useState<ConnStatus | null>(null);
  useEffect(() => {
    api.get<ConnStatus>(`/projects/${projectId}/github`).then(setStatus).catch(() => setStatus({ connected: false }));
  }, [projectId]);
  return [status, setStatus] as const;
}

/* ─────────────────────────────────────────────────────────────
   Settings tab: connect / manage the GitHub repo for this campaign.
   ───────────────────────────────────────────────────────────── */
export function GithubConnectCard({ projectId }: { projectId: string }) {
  const [status, setStatus] = useConnection(projectId);
  const [form, setForm] = useState({ owner: "", repo: "", token: "", defaultBranch: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function connect() {
    setErr(null); setBusy(true);
    try {
      const s = await api.post<ConnStatus>(`/projects/${projectId}/github`, {
        owner: form.owner.trim(),
        repo: form.repo.trim(),
        token: form.token.trim(),
        defaultBranch: form.defaultBranch.trim() || undefined,
      });
      setStatus(s);
      setForm((f) => ({ ...f, token: "" }));
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to connect"); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setErr(null);
    try { await api.del(`/projects/${projectId}/github`); setStatus({ connected: false }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  const canConnect = form.owner.trim() && form.repo.trim() && form.token.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Github className="h-4 w-4" /> GitHub connection</CardTitle>
        <CardDescription>
          Connect this site&apos;s repo once to enable one-click audit auto-fix pull requests. The token is stored encrypted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status === null ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</div>
        ) : status.connected ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/20 px-2.5 py-1.5 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-chart-2" /> {status.owner}/{status.repo}
                {status.defaultBranch && <span className="text-xs text-muted-foreground">· {status.defaultBranch}</span>}
              </span>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={disconnect}>
                <Unlink className="h-3.5 w-3.5" /> Disconnect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Open the <span className="font-medium">Audit</span> tab and use “Create auto-fix PR” after any audit.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Create a <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-primary hover:underline">Personal Access Token</a> with <span className="font-mono">repo</span> (write) scope.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Owner (user / org)</Label><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="acme-inc" /></div>
              <div className="space-y-1"><Label className="text-xs">Repository</Label><Input value={form.repo} onChange={(e) => setForm({ ...form, repo: e.target.value })} placeholder="acme-website" /></div>
              <div className="space-y-1"><Label className="text-xs">Access token</Label><Input type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="ghp_…" /></div>
              <div className="space-y-1"><Label className="text-xs">Base branch <span className="text-muted-foreground">(optional)</span></Label><Input value={form.defaultBranch} onChange={(e) => setForm({ ...form, defaultBranch: e.target.value })} placeholder="main" /></div>
            </div>
            <Button className="gap-2" disabled={!canConnect || busy} onClick={connect}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />} Connect repo
            </Button>
          </div>
        )}
        {err && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{err}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────
   Audit tab: trigger the fix PR (needs a crawl). No connect form here —
   that lives in the Settings tab.
   ───────────────────────────────────────────────────────────── */
export function AutofixCard({ projectId, crawlId }: { projectId: string; crawlId: string }) {
  const [status] = useConnection(projectId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pr, setPr] = useState<PrResult | null>(null);

  async function preview() {
    setErr(null); setBusy(true); setPr(null);
    try { setPlan(await api.get<Plan>(`/autofix/${crawlId}/plan`)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to load plan"); }
    finally { setBusy(false); }
  }
  async function openPr() {
    setErr(null); setBusy(true);
    try { setPr(await api.post<PrResult>(`/autofix/${crawlId}/pr`)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to open PR"); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Wrench className="h-4 w-4" /></span>
        <div className="flex-1">
          <h4 className="font-heading text-sm font-semibold">Auto-fix &amp; deploy</h4>
          <p className="text-xs text-muted-foreground">Ship the fixable issues straight to your repo as a pull request</p>
        </div>
        {status?.connected && (
          <span className="inline-flex items-center gap-1 rounded-md bg-chart-2/12 px-2 py-1 text-xs font-medium text-chart-2">
            <CheckCircle2 className="h-3.5 w-3.5" /> {status.owner}/{status.repo}
          </span>
        )}
      </div>

      <div className="p-4">
        {status === null ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking connection…</div>
        ) : !status.connected ? (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/20 p-3 text-sm text-muted-foreground">
            <Github className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Connect this site&apos;s GitHub repo in the <span className="font-medium text-foreground">Settings</span> tab to enable one-click fix pull requests.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" disabled={busy} onClick={preview}>
              {busy && !pr ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} Preview fixes
            </Button>
            <Button className="gap-2" disabled={busy} onClick={openPr}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitPullRequest className="h-4 w-4" />} Create auto-fix PR
            </Button>
          </div>
        )}

        {err && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{err}</span>
          </div>
        )}

        {pr && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-chart-2/30 bg-chart-2/8 p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-chart-2" />
            <span>Pull request <span className="font-semibold">#{pr.number}</span> opened.</span>
            <a href={pr.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">
              Review &amp; merge <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {(plan || pr) && (() => {
          const p = pr?.plan ?? plan!;
          return (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-3">
                <h5 className="mb-2 text-xs font-semibold">Auto-fixed files ({p.files.length})</h5>
                {p.files.length ? (
                  <ul className="space-y-1.5">
                    {p.files.map((f) => (
                      <li key={f.path} className="flex items-center gap-2 text-xs">
                        <span className={cn("rounded px-1.5 py-0.5 font-medium", f.action === "create" ? "bg-chart-2/12 text-chart-2" : "bg-chart-3/15 text-chart-3")}>{f.action}</span>
                        <span className="font-mono">{f.path}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">Nothing auto-fixable — see manual items.</p>}
              </div>
              <div className="rounded-lg border border-border p-3">
                <h5 className="mb-2 text-xs font-semibold">Needs a manual change ({p.manual.length})</h5>
                {p.manual.length ? (
                  <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                    {p.manual.map((m) => (
                      <li key={m.code} className="text-xs"><span className="font-mono text-muted-foreground">{m.code}</span> — {m.note}</li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">None 🎉</p>}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
