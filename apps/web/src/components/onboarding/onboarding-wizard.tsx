"use client";

import { useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronRight, Loader2, Lock, Palette, Plus, Sparkles, Upload, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/components/providers/user-provider";
import { useTheme } from "@/components/theme/theme-provider";
import { FONT_OPTIONS } from "@/components/theme/theme-config";
import { hexToHslChannels, hslChannelsToHex } from "@/lib/colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

// Accent presets — plain data (hex) the user picks from. Applied as dynamic CSS
// tokens (--primary / --ring), never hardcoded into any component's styles.
const ACCENTS = [
  { label: "Blue", hex: "#2563EB" },
  { label: "Violet", hex: "#6B41FF" },
  { label: "Emerald", hex: "#059669" },
  { label: "Rose", hex: "#E11D48" },
  { label: "Amber", hex: "#D97706" },
  { label: "Cyan", hex: "#0891B2" },
  { label: "Slate", hex: "#334155" },
  { label: "Fuchsia", hex: "#C026D3" },
];

const FONTS = FONT_OPTIONS.slice(0, 6);

type StepKey = "welcome" | "password" | "profile" | "agency" | "personalize";

export function OnboardingWizard() {
  const { user, refresh } = useCurrentUser();
  const { overrides, mode, setToken, setMode, applyMany } = useTheme();

  const needsPassword = !!user?.mustSetPassword;
  const isOwner = user?.role === "ADMIN" && !!user?.orgId; // agency owner → branding step

  // Steps are adaptive: password only for temp-password users, agency branding
  // only for org owners.
  const steps = useMemo<StepKey[]>(() => {
    const s: StepKey[] = ["welcome"];
    if (needsPassword) s.push("password");
    s.push("profile");
    if (isOwner) s.push("agency");
    s.push("personalize");
    return s;
  }, [needsPassword, isOwner]);

  const [step, setStep] = useState(0);
  const current = steps[step];

  const [name, setName] = useState(user?.name ?? "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [agencyName, setAgencyName] = useState(user?.branding?.agencyName ?? "");
  const [agencyLogo, setAgencyLogo] = useState<string | null>(user?.branding?.logoDataUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const brandName = user?.branding?.agencyName || "SerpScale";
  const brandLogo = user?.branding?.logoDataUrl || null;

  const pwValid = pw.length >= 8 && pw === pw2;
  const activeAccent = overrides["primary"] ?? null;
  const activeFont = overrides["font-sans"] ?? null;

  const canNext = current === "password" ? pwValid : true;

  function pickAccent(hex: string) {
    const hsl = hexToHslChannels(hex);
    // Set accent + focus ring together so the whole UI recolors coherently.
    applyMany({ primary: hsl, ring: hsl });
  }

  async function onAvatarFile(file?: File) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload<{ avatarUrl: string | null }>("/users/me/avatar", fd);
      setAvatarUrl(res.avatarUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload image.");
    } finally {
      setUploading(false);
    }
  }

  function onLogoFile(file?: File) {
    if (!file) return;
    if (file.size > 500 * 1024) {
      setError("Logo must be under 500 KB.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setAgencyLogo(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function finish() {
    if (needsPassword && !pwValid) {
      setStep(steps.indexOf("password"));
      setError("Please set a password of at least 8 characters.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Owners: persist agency name + logo first so the sidebar reflects it.
      if (isOwner && (agencyLogo !== (user?.branding?.logoDataUrl ?? null) || agencyName.trim() !== (user?.branding?.agencyName ?? ""))) {
        await api.put("/team/branding", { agencyName: agencyName.trim() || undefined, logoDataUrl: agencyLogo });
      }
      await api.post("/users/me/onboarding", {
        name: name.trim() || undefined,
        newPassword: needsPassword ? pw : undefined,
        themeOverrides: overrides,
        mode,
      });
      await refresh(); // onboardedAt now set → gate unmounts the wizard
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  function next() {
    setError(null);
    if (step < steps.length - 1) setStep((s) => s + 1);
    else void finish();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header: brand + progress */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          {brandLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandLogo} alt={brandName} className="h-8 w-auto max-w-[140px] object-contain" />
          ) : (
            <span className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/serpscale-logo.svg" alt="SerpScale" className="h-8 w-8" />
              <span className="text-lg font-extrabold tracking-tight">
                {brandName === "SerpScale" ? (
                  <><span className="text-primary">Serp</span>Scale</>
                ) : (
                  brandName
                )}
              </span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === step ? "w-6 bg-primary" : i < step ? "w-3 bg-primary/60" : "w-3 bg-border",
                )}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div key={step} className="fade-up px-6 py-7">
          {current === "welcome" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <h2 className="font-heading text-2xl font-bold">Welcome{name ? `, ${name.split(" ")[0]}` : ""}!</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  Let&apos;s set up your account in a few quick steps and make the dashboard yours.
                </p>
              </div>
            </div>
          )}

          {current === "password" && (
            <div className="space-y-4">
              <StepHeading icon={<Lock className="h-5 w-5" />} title="Set your password" subtitle="Replace the temporary password you were emailed." />
              <div className="space-y-1.5">
                <Label htmlFor="ob-pw">New password</Label>
                <Input id="ob-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-pw2">Confirm password</Label>
                <Input id="ob-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Re-enter password" />
              </div>
              {pw.length > 0 && pw.length < 8 && <p className="text-xs text-destructive">Password must be at least 8 characters.</p>}
              {pw2.length > 0 && pw !== pw2 && <p className="text-xs text-destructive">Passwords don&apos;t match.</p>}
              {pwValid && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <Check className="h-3.5 w-3.5" /> Looks good.
                </p>
              )}
            </div>
          )}

          {current === "profile" && (
            <div className="space-y-5">
              <StepHeading icon={<UserRound className="h-5 w-5" />} title="Your profile" subtitle="Add a name and a photo (optional)." />
              <div className="flex items-center gap-4">
                <UserAvatar src={avatarUrl} className="h-16 w-16" />
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => onAvatarFile(e.target.files?.[0])}
                  />
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {avatarUrl ? "Change photo" : "Upload photo"}
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">PNG, JPG or WebP, up to 2MB.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-name">Full name</Label>
                <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>
            </div>
          )}

          {current === "agency" && (
            <div className="space-y-5">
              <StepHeading icon={<Building2 className="h-5 w-5" />} title="Your agency brand" subtitle="Add your logo — it replaces the SerpScale brand across your dashboard." />
              <div className="flex items-center gap-4">
                <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted">
                  {agencyLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={agencyLogo} alt="Agency logo" className="h-full w-full object-contain" />
                  ) : (
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  )}
                </span>
                <div>
                  <input
                    ref={logoRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => onLogoFile(e.target.files?.[0])}
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()}>
                      <Upload className="h-4 w-4" /> {agencyLogo ? "Change logo" : "Upload logo"}
                    </Button>
                    {agencyLogo && (
                      <Button variant="ghost" size="sm" onClick={() => setAgencyLogo(null)}>Remove</Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">PNG, SVG or JPG, up to 500 KB.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-agency">Agency name</Label>
                <Input id="ob-agency" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Your agency name" />
              </div>
            </div>
          )}

          {current === "personalize" && (
            <div className="space-y-5">
              <StepHeading icon={<Palette className="h-5 w-5" />} title="Make it yours" subtitle="Pick a look — you can fine-tune everything later in Settings → Appearance." />

              <div className="space-y-2">
                <Label>Appearance</Label>
                <div className="flex rounded-md border border-border p-0.5">
                  {(["light", "dark"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={cn(
                        "flex-1 rounded px-3 py-1.5 text-sm capitalize transition-colors",
                        mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Accent color</Label>
                <div className="flex flex-wrap items-center gap-2.5">
                  {ACCENTS.map((a) => {
                    const selected = activeAccent === hexToHslChannels(a.hex);
                    return (
                      <button
                        key={a.label}
                        type="button"
                        title={a.label}
                        onClick={() => pickAccent(a.hex)}
                        style={{ backgroundColor: a.hex }}
                        className={cn(
                          "grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110",
                          selected ? "ring-2 ring-foreground" : "ring-1 ring-border",
                        )}
                      >
                        {selected && <Check className="h-4 w-4 text-white" />}
                      </button>
                    );
                  })}
                  {/* Full custom picker — any color, not just the presets. */}
                  <label
                    title="Pick a custom color"
                    className="relative grid h-9 w-9 cursor-pointer place-items-center rounded-full ring-1 ring-border transition-transform hover:scale-110"
                    style={{ background: "conic-gradient(from 0deg, #ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)" }}
                  >
                    <Plus className="h-4 w-4 text-white drop-shadow" />
                    <input
                      type="color"
                      value={activeAccent ? hslChannelsToHex(activeAccent) : "#2563EB"}
                      onChange={(e) => pickAccent(e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="Custom accent color"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Font</Label>
                <div className="flex flex-wrap gap-2">
                  {FONTS.map((f) => {
                    const selected = activeFont === f.value;
                    return (
                      <button
                        key={f.label}
                        type="button"
                        onClick={() => setToken("font-sans", f.value)}
                        style={{ fontFamily: f.value }}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm transition-colors",
                          selected ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <span className="text-xs text-muted-foreground">
            Step {step + 1} of {steps.length}
          </span>
          <div className="flex items-center gap-2">
            {step > 0 && !submitting && (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            <Button onClick={next} disabled={!canNext || submitting}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Finishing…</>
              ) : step === steps.length - 1 ? (
                <>Finish <Check className="h-4 w-4" /></>
              ) : (
                <>Continue <ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <div>
        <h2 className="font-heading text-lg font-bold leading-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
