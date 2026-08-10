"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Trash2, Check, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useCurrentUser, useFeature, useCan } from "@/components/providers/user-provider";
import { LockedFeature } from "@/components/ui/locked-feature";

interface Branding {
  agencyName: string;
  logoDataUrl: string | null;
  logoBg: string | null;
}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";
const label = "mb-1 block text-xs font-medium text-muted-foreground";

export default function AgencySettingsPage() {
  const hasFeature = useFeature();
  const can = useCan();
  return (
    <div className="space-y-5">
      {hasFeature("white_label") ? (
        <BrandingCard />
      ) : (
        <LockedFeature title="White-label branding" description="Replace the platform brand with your own agency name and logo. Available on agency plans." canUpgrade={can("billing.manage")} />
      )}
    </div>
  );
}

// ---- Agency branding (logo + name shown in the sidebar) ----
function BrandingCard() {
  const { refresh } = useCurrentUser();
  const [b, setB] = useState<Branding>({ agencyName: "", logoDataUrl: null, logoBg: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<Branding & { orgName: string }>("/team/branding")
      .then((r) => setB({ agencyName: r.agencyName || "", logoDataUrl: r.logoDataUrl, logoBg: r.logoBg ?? null }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function pickLogo(file: File) {
    setErr(null);
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) {
      setErr("Use a PNG, JPG, WEBP or SVG image.");
      return;
    }
    if (file.size > 500 * 1024) {
      setErr("Logo must be under 500 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setB((p) => ({ ...p, logoDataUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await api.put("/team/branding", { agencyName: b.agencyName, logoDataUrl: b.logoDataUrl, logoBg: b.logoBg });
      await refresh(); // update the sidebar immediately
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-tour="setup-branding">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" /> Agency branding
        </CardTitle>
        <CardDescription>Your logo and name replace the platform brand in the sidebar for your whole team.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span
                className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border"
                style={{ backgroundColor: b.logoBg || "hsl(var(--card))" }}
              >
                {b.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logoDataUrl} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                )}
              </span>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && pickLogo(e.target.files[0])}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Upload logo
                </Button>
                {b.logoDataUrl && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setB((p) => ({ ...p, logoDataUrl: null }))}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Optional logo background — off by default; useful for transparent logos */}
            <div>
              <label className={label}>Logo background (optional)</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  value={b.logoBg || "#4f46e5"}
                  onChange={(e) => setB((p) => ({ ...p, logoBg: e.target.value }))}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-background p-1"
                  title="Pick a background color"
                />
                <input
                  className={cn(field, "w-32")}
                  value={b.logoBg || ""}
                  placeholder="none"
                  onChange={(e) => setB((p) => ({ ...p, logoBg: e.target.value || null }))}
                />
                {b.logoBg && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setB((p) => ({ ...p, logoBg: null }))}>
                    Clear
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Leave empty for no background (transparent).</p>
            </div>

            <div>
              <label className={label}>Agency name</label>
              <input
                className={field}
                value={b.agencyName}
                maxLength={60}
                placeholder="e.g. Bright Rank Agency"
                onChange={(e) => setB((p) => ({ ...p, agencyName: e.target.value }))}
              />
              <p className="mt-1 text-xs text-muted-foreground">Leave blank to use the default platform name.</p>
            </div>

            {err && <p className="text-sm text-destructive">{err}</p>}

            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
              {saved ? "Saved" : "Save branding"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
