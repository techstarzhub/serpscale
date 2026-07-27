"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface NotifType {
  key: string;
  group: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-secondary")}
      aria-pressed={on}
    >
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

export default function NotificationSettingsPage() {
  const [types, setTypes] = useState<NotifType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get<{ types: NotifType[] }>("/notifications/preferences")
      .then((r) => setTypes(r.types))
      .catch(() => setTypes([]))
      .finally(() => setLoading(false));
  }, []);

  function set(key: string, field: "inApp" | "email", value: boolean) {
    setTypes((t) => t.map((x) => (x.key === key ? { ...x, [field]: value } : x)));
  }

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, { inApp: boolean; email: boolean }> = {};
      for (const t of types) body[t.key] = { inApp: t.inApp, email: t.email };
      await api.put("/notifications/preferences", body);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }

  const groups = [...new Set(types.map((t) => t.group))];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">Notifications</h2>
        <p className="text-sm text-muted-foreground">Choose exactly which notifications you get, and where.</p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : (
        <>
          {groups.map((g) => (
            <Card key={g}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="h-4 w-4 text-primary" /> {g}
                </CardTitle>
                <CardDescription>Turn each notification on or off for in-app and email.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                <div className="hidden items-center pb-2 text-xs font-medium text-muted-foreground sm:flex">
                  <span className="flex-1">Notification</span>
                  <span className="w-16 text-center">In-app</span>
                  <span className="w-16 text-center">Email</span>
                </div>
                {types
                  .filter((t) => t.group === g)
                  .map((t) => (
                    <div key={t.key} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.description}</div>
                      </div>
                      <div className="flex w-16 justify-center">
                        <Toggle on={t.inApp} onChange={(v) => set(t.key, "inApp", v)} />
                      </div>
                      <div className="flex w-16 justify-center">
                        <Toggle on={t.email} onChange={(v) => set(t.key, "email", v)} />
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          ))}

          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? "Saved" : "Save preferences"}
          </Button>
        </>
      )}
    </div>
  );
}
