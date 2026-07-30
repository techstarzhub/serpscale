"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Loader2, Lock, Palette, Sparkles, Upload, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/components/providers/user-provider";
import { useTheme } from "@/components/theme/theme-provider";
import { FONT_OPTIONS } from "@/components/theme/theme-config";
import { hexToHslChannels } from "@/lib/colors";
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

const STEPS = ["Welcome", "Password", "Profile", "Personalize"] as const;

export function OnboardingWizard() {
  const { user, refresh } = useCurrentUser();
  const { overrides, mode, setToken, setMode, applyMany } = useTheme();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.name ?? "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const brandName = user?.branding?.agencyName || "SerpScale";
  const brandLogo = user?.branding?.logoDataUrl || null;

  const pwValid = pw.length >= 8 && pw === pw2;
  const activeAccent = overrides["primary"] ?? null;
  const activeFont = overrides["font-sans"] ?? null;

  const canNext = useMemo(() => {
    if (step === 1) return pwValid; // password is the only required step
    return true;
  }, [step, pwValid]);

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

  async function finish() {
    if (!pwValid) {
      setStep(1);
      setError("Please set a password of at least 8 characters.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/users/me/onboarding", {
        name: name.trim() || undefined,
        newPassword: pw,
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
    if (step < STEPS.length - 1) setStep((s) => s + 1);
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
            <span className="text-lg font-extrabold tracking-tight">
              {brandName === "SerpScale" ? (
                <><span className="text-primary">Serp</span>Scale</>
              ) : (
                brandName
              )}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {STEPS.map((_, i) => (
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
          {step === 0 && (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <h2 className="font-heading text-2xl font-bold">Welcome{name ? `, ${name.split(" ")[0]}` : ""}!</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  Let&apos;s set up your account in a few quick steps — secure your password, add a
                  profile photo, and make the dashboard yours.
                </p>
              </div>
            </div>
          )}

          {step === 1 && (
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

          {step === 2 && (
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

          {step === 3 && (
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
                <div className="flex flex-wrap gap-2.5">
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
            Step {step + 1} of {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            {step > 1 && !submitting && (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            <Button onClick={next} disabled={!canNext || submitting}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Finishing…</>
              ) : step === STEPS.length - 1 ? (
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
