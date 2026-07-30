"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Mail, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useFeature } from "@/components/providers/user-provider";
import { LockedFeature } from "@/components/ui/locked-feature";

interface Smtp {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  hasPass: boolean;
  enabled: boolean;
}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";
const label = "mb-1 block text-xs font-medium text-muted-foreground";

// Agency's own SMTP — invites and password resets for this org send from here.
export default function EmailSettingsPage() {
  const hasFeature = useFeature();
  // Per-tenant email is a white-label capability. Stays visible with an upgrade
  // prompt on plans that don't include it.
  if (!hasFeature("white_label")) {
    return <LockedFeature title="Custom email (SMTP)" description="Send invites and reports from your own email domain. Upgrade to a white-label plan to unlock." />;
  }
  return <EmailInner />;
}

function EmailInner() {
  const [s, setS] = useState<Smtp>({ host: "", port: 587, secure: false, user: "", fromName: "", fromEmail: "", hasPass: false, enabled: false });
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .get<Smtp>("/team/smtp")
      .then(setS)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { host: s.host, port: s.port, secure: s.secure, user: s.user, fromName: s.fromName, fromEmail: s.fromEmail };
      if (pass) body.pass = pass;
      const r = await api.put<{ enabled: boolean }>("/team/smtp", body);
      setS((p) => ({ ...p, enabled: r.enabled, hasPass: p.hasPass || !!pass }));
      setPass("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setMsg(null);
    try {
      const r = await api.post<{ ok: boolean; error?: string; to: string }>("/team/smtp/test", {});
      setMsg(r.ok ? { ok: true, text: `Test email sent to ${r.to}.` } : { ok: false, text: r.error || "Test failed." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Test failed." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-primary" /> Email (SMTP)
          {s.enabled && <span className="rounded-md bg-chart-2/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-chart-2">Active</span>}
        </CardTitle>
        <CardDescription>
          Send team invites and password resets from your own mail server. Leave the host blank to use the platform default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label}>SMTP host</label>
                <input className={field} value={s.host} placeholder="smtp.yourdomain.com" onChange={(e) => setS((p) => ({ ...p, host: e.target.value }))} />
              </div>
              <div>
                <label className={label}>Port</label>
                <input className={field} type="number" value={s.port} onChange={(e) => setS((p) => ({ ...p, port: Number(e.target.value) }))} />
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={s.secure} onChange={(e) => setS((p) => ({ ...p, secure: e.target.checked }))} />
                  Use SSL/TLS (port 465)
                </label>
              </div>
              <div>
                <label className={label}>Username</label>
                <input className={field} value={s.user} placeholder="you@yourdomain.com" onChange={(e) => setS((p) => ({ ...p, user: e.target.value }))} />
              </div>
              <div>
                <label className={label}>Password {s.hasPass && <span className="text-muted-foreground">(saved — leave blank to keep)</span>}</label>
                <input className={field} type="password" value={pass} placeholder={s.hasPass ? "••••••••" : ""} onChange={(e) => setPass(e.target.value)} />
              </div>
              <div>
                <label className={label}>From name</label>
                <input className={field} value={s.fromName} placeholder="Your Agency" onChange={(e) => setS((p) => ({ ...p, fromName: e.target.value }))} />
              </div>
              <div>
                <label className={label}>From email</label>
                <input className={field} value={s.fromEmail} placeholder="noreply@yourdomain.com" onChange={(e) => setS((p) => ({ ...p, fromEmail: e.target.value }))} />
              </div>
            </div>

            {msg && <p className={cn("text-sm", msg.ok ? "text-chart-2" : "text-destructive")}>{msg.text}</p>}

            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                {saved ? "Saved" : "Save SMTP"}
              </Button>
              <Button variant="outline" onClick={sendTest} disabled={testing || !s.enabled}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send test email
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
