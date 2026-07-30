"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Check, Link2, LayoutGrid, Plug, ListChecks, Lock, Info, ExternalLink } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { SiGoogleanalytics, SiGooglesearchconsole, SiGoogleads, SiMeta, SiInstagram, SiYoutube, SiPinterest } from "react-icons/si";
import { FaGithub, FaLinkedin } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/components/providers/projects-provider";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/* ------------------------------------------------------------- data --- */

const STEPS = [
  { id: 1, label: "Campaign Info", icon: LayoutGrid },
  { id: 2, label: "Integrations", icon: Plug },
  { id: 3, label: "Live Keyword Tracking", icon: ListChecks },
] as const;

// Exactly the dashboards that exist on our project detail page (its tabs), each
// with a plain-language explanation shown on hover.
const MODULES: { id: string; label: string; info: string }[] = [
  { id: "overview", label: "Overview", info: "At-a-glance health, traffic and ranking summary for the whole campaign." },
  { id: "copilot", label: "AI Copilot", info: "An AI assistant that answers questions and suggests SEO fixes for this site." },
  { id: "keywords", label: "Keywords", info: "Research keywords with real search volume, difficulty, CPC and intent." },
  { id: "content", label: "Content", info: "AI content briefs and SEO-ready blog drafts for your target keywords." },
  { id: "ranks", label: "Ranks", info: "Daily keyword position tracking on Google, by location and device." },
  { id: "competitors", label: "Competitors", info: "Compare visibility and find keyword gaps against your competitors." },
  { id: "traffic", label: "Traffic", info: "Google Analytics 4 sessions, users and conversions for the site." },
  { id: "backlinks", label: "Backlinks", info: "Backlinks, referring domains, anchor text and toxic-link alerts." },
  { id: "domain", label: "Domain", info: "Domain authority, tech stack and top-level domain metrics." },
  { id: "ai", label: "AI Visibility", info: "How often ChatGPT, Gemini and other AIs mention your brand." },
  { id: "audit", label: "Audit", info: "Full technical site crawl with a health score and prioritized fixes." },
];

const COUNTRIES = [
  { code: "US", label: "us (google.com)" },
  { code: "GB", label: "uk (google.co.uk)" },
  { code: "IN", label: "in (google.co.in)" },
  { code: "CA", label: "ca (google.ca)" },
  { code: "AU", label: "au (google.com.au)" },
  { code: "DE", label: "de (google.de)" },
  { code: "AE", label: "ae (google.ae)" },
];
const DEVICES = ["Desktop", "Mobile"];

type Intg = { id: string; provider: "google" | "github"; name: string; desc: string; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color?: string };
const INTEGRATIONS: Intg[] = [
  { id: "gsc", provider: "google", name: "Google Search Console", desc: "Insights about SERP impressions, clicks and queries for your SEO dashboard.", Icon: SiGooglesearchconsole, color: "#458CF5" },
  { id: "ga", provider: "google", name: "Google Analytics 4", desc: "Website traffic, sessions and conversions for your SEO dashboard.", Icon: SiGoogleanalytics, color: "#E37400" },
  { id: "gmb", provider: "google", name: "Google Business Profile", desc: "Local listing and map insights for your GMB dashboard.", Icon: FcGoogle },
  { id: "github", provider: "github", name: "GitHub", desc: "Ship SEO and technical fixes straight to your repo as pull requests.", Icon: FaGithub },
];
const SOON_INTEGRATIONS: { name: string; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }[] = [
  { name: "Google Ads", Icon: SiGoogleads, color: "#4285F4" },
  { name: "Meta / Facebook", Icon: SiMeta, color: "#0866FF" },
  { name: "Instagram", Icon: SiInstagram, color: "#E4405F" },
  { name: "YouTube", Icon: SiYoutube, color: "#FF0000" },
  { name: "LinkedIn", Icon: FaLinkedin, color: "#0A66C2" },
  { name: "Pinterest", Icon: SiPinterest, color: "#BD081C" },
];

/* --------------------------------------------------------- styling --- */
const PILL = "flex h-[54px] items-center gap-3 rounded-full border border-input bg-card px-4 shadow-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/20";
const FIELD = "min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70";

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="hidden items-center rounded-xl border-l-[3px] border-primary/30 bg-muted/60 px-4 py-3 text-sm text-muted-foreground lg:flex">{children}</div>;
}

function ChevronSteps({ step }: { step: number }) {
  return (
    <div className="flex overflow-hidden rounded-2xl">
      {STEPS.map((s, i) => {
        const done = step > s.id;
        const on = done || step === s.id;
        const Icon = s.icon;
        const clip = i > 0
          ? "polygon(0 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 0 100%, 24px 50%)"
          : "polygon(0 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 0 100%)";
        return (
          <div
            key={s.id}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-2.5 py-4 text-[15px] font-semibold",
              on ? "bg-primary text-primary-foreground" : "bg-primary/10 text-foreground/60",
              i > 0 && "-ml-[18px] pl-7",
            )}
            style={{ clipPath: clip }}
          >
            <Icon className={cn("h-[18px] w-[18px]", on ? "text-primary-foreground" : "text-foreground/40")} />
            <span className="hidden sm:inline">{s.label}</span>
            {done && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-success-foreground"><Check className="h-3 w-3" strokeWidth={3} /></span>}
          </div>
        );
      })}
    </div>
  );
}

type TrackedKw = { id: string; keyword: string; country: string; device: string };

/* ------------------------------------------------------------- page --- */

export default function EditCampaignPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { getProject, updateProject, loading: projectsLoading } = useProjects();
  const project = getProject(params.id);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [country, setCountry] = useState("US");
  const [mods, setMods] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [device, setDevice] = useState("Desktop");
  // The keywords already tracked (with ids) — used to diff on save.
  const [existingKws, setExistingKws] = useState<TrackedKw[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Pre-fill the wizard from the project + its tracked keywords, once loaded.
  useEffect(() => {
    if (!project || hydrated) return;
    setName(project.name);
    setDomain(project.domain);
    // Empty enabledTabs means "all" — reflect that as every module ticked.
    setMods(project.enabledTabs && project.enabledTabs.length ? project.enabledTabs : MODULES.map((m) => m.id));
    (async () => {
      try {
        const kws = await api.get<TrackedKw[]>(`/projects/${project.id}/rank-keywords`);
        setExistingKws(kws);
        setKeywords(kws.map((k) => k.keyword).join("\n"));
        if (kws[0]?.country) setCountry(kws[0].country.toUpperCase());
        if (kws[0]?.device) setDevice(kws[0].device.toLowerCase() === "mobile" ? "Mobile" : "Desktop");
      } catch {
        /* no keywords yet — leave blank */
      } finally {
        setHydrated(true);
      }
    })();
  }, [project, hydrated]);

  // Real integration status (Google account is org-level → shared by GSC/GA/GMB).
  const [intg, setIntg] = useState({ loaded: false, googleConnected: false, googleConfigured: true });
  const fetchIntg = useCallback(async () => {
    try {
      const s = await api.get<{ googleAccounts?: unknown[]; googleConfigured?: boolean }>("/integrations");
      setIntg({ loaded: true, googleConnected: (s?.googleAccounts ?? []).length > 0, googleConfigured: s?.googleConfigured ?? false });
    } catch {
      setIntg((p) => ({ ...p, loaded: true }));
    }
  }, []);
  useEffect(() => {
    fetchIntg();
    const onFocus = () => fetchIntg();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchIntg]);

  function connectGoogle() {
    window.open(`${API}/integrations/google/connect`, "_blank", "noopener,noreferrer");
    let n = 0;
    const t = setInterval(async () => { n++; await fetchIntg(); if (n >= 40) clearInterval(t); }, 2500);
  }

  const google = COUNTRIES.find((x) => x.code === country)?.label ?? "us (google.com)";
  const kwCount = keywords.split("\n").map((k) => k.trim()).filter(Boolean).length;
  const step1Valid = name.trim().length > 0 && domain.trim().length >= 3;

  async function finish() {
    if (!project) return;
    setError(""); setLoading(true);
    try {
      // 1) Save the campaign's core details (name / domain / dashboards).
      const updated = await updateProject(project.id, { name: name.trim(), domain: domain.trim(), enabledTabs: mods });

      // 2) Sync the tracked keywords: add newly-typed lines, drop removed ones.
      const desired = [...new Set(keywords.split("\n").map((k) => k.trim()).filter(Boolean))];
      const desiredLC = new Set(desired.map((k) => k.toLowerCase()));
      const existingLC = new Map(existingKws.map((k) => [k.keyword.toLowerCase(), k]));

      const toAdd = desired.filter((k) => !existingLC.has(k.toLowerCase()));
      const toRemove = existingKws.filter((k) => !desiredLC.has(k.keyword.toLowerCase()));

      await Promise.allSettled([
        ...toAdd.map((keyword) => api.post(`/projects/${project.id}/rank-keywords`, { keyword, country, device: device.toLowerCase() })),
        ...toRemove.map((k) => api.del(`/projects/${project.id}/rank-keywords/${k.id}`)),
      ]);

      router.push(`/dashboard/projects/${updated.slug}?tab=ranks`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
      setLoading(false);
    }
  }

  // Still resolving the project from the provider.
  if (projectsLoading || (!project && !hydrated)) {
    return (
      <div className="grid place-items-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="font-heading text-xl font-semibold">Campaign not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">It may have been removed, or the link is wrong.</p>
        <Link href="/dashboard" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      <Link href={`/dashboard/projects/${project.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to campaign
      </Link>

      <div className="rounded-2xl border border-border bg-card px-7 py-6 shadow-sm">
        <h1 className="font-heading text-[26px] font-bold tracking-tight">
          Edit Campaign <span className="text-lg font-medium text-muted-foreground">({domain || "example.com"})</span>
        </h1>
      </div>

      <ChevronSteps step={step} />

      <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
        {/* ------------------------------------------------ STEP 1 --- */}
        {step === 1 && (
          <>
            <div className="mb-7">
              <h2 className="font-heading text-2xl font-semibold">Campaign Info,</h2>
              <p className="mt-0.5 text-[15px] text-muted-foreground">Update your campaign name, domain and dashboards.</p>
            </div>

            <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-[1.35fr_1fr]">
              <label className={PILL}>
                <LayoutGrid className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign Name" className={FIELD} autoFocus />
              </label>
              <Hint>Name of campaign.</Hint>

              <div className={PILL}>
                <Link2 className="h-[18px] w-[18px] shrink-0 text-primary" />
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" className={FIELD} />
              </div>
              <Hint>Domain of campaign — we track rankings for this site.</Hint>

              <div className={PILL}>
                <FcGoogle className="h-5 w-5 shrink-0" />
                <select value={country} onChange={(e) => setCountry(e.target.value)} className="min-w-0 flex-1 cursor-pointer bg-transparent text-[15px] text-foreground outline-none">
                  {COUNTRIES.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
                </select>
              </div>
              <Hint>Select the version of Google you want to track results in. By default it&apos;s Google.com.</Hint>

              <div className="lg:col-span-2">
                <p className="mb-1 mt-2 flex items-center gap-1.5 text-[15px] font-semibold">Select your Dashboards <Info className="h-3.5 w-3.5 text-muted-foreground" /></p>
                <p className="mb-3 text-xs text-muted-foreground">Hover any dashboard to see what it does. These are the tabs you&apos;ll get inside the campaign.</p>
                <div className="flex flex-wrap gap-x-7 gap-y-3.5">
                  {MODULES.map((m) => {
                    const on = mods.includes(m.id);
                    return (
                      <div key={m.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => setMods((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                          className="flex items-center gap-2.5"
                        >
                          <span className={cn("flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border-2 transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card group-hover:border-primary/50")}>
                            {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                          </span>
                          <span className="text-[15px] font-medium">{m.label}</span>
                        </button>
                        {/* hover tooltip */}
                        <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-60 -translate-y-1 rounded-xl border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground opacity-0 shadow-lg transition-all duration-150 group-hover:-translate-y-0 group-hover:opacity-100">
                          <span className="mb-0.5 block font-semibold">{m.label}</span>
                          {m.info}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ------------------------------------------------ STEP 2 --- */}
        {step === 2 && (
          <>
            <div className="mb-6">
              <h2 className="font-heading text-2xl font-semibold">Integrations,</h2>
              <p className="mt-0.5 text-[15px] text-muted-foreground">Connect your accounts to pull live data. You can skip and connect any later.</p>
            </div>
            <div className="space-y-3">
              {INTEGRATIONS.map((it) => {
                const isGoogle = it.provider === "google";
                const connected = isGoogle && intg.googleConnected;
                const needsSetup = isGoogle && intg.loaded && !intg.googleConfigured;
                return (
                  <div key={it.id} className={cn("flex items-center gap-4 rounded-2xl border px-5 py-4 transition-shadow hover:shadow-sm", connected ? "border-success/40 bg-success/[0.04]" : "border-border bg-card")}>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card">
                      <it.Icon className="h-6 w-6" style={it.color ? { color: it.color } : { color: "hsl(var(--foreground))" }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{it.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{needsSetup ? "Add GOOGLE_CLIENT_ID & secret in settings to enable this." : it.desc}</p>
                    </div>
                    {it.provider === "github" ? (
                      <span title="Connect GitHub from the campaign once it's created." className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-5 py-2 text-sm font-semibold text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" /> After launch
                      </span>
                    ) : connected ? (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-success bg-success/10 px-6 py-2 text-sm font-semibold text-success">
                        <Check className="h-4 w-4" /> Connected
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={connectGoogle}
                        disabled={!intg.loaded || needsSetup}
                        className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary px-6 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {!intg.loaded ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ExternalLink className="h-3.5 w-3.5" /> Connect</>}
                      </button>
                    )}
                  </div>
                );
              })}
              {SOON_INTEGRATIONS.map((s) => (
                <div key={s.name} className="flex items-center gap-4 rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-4 opacity-80">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card"><s.Icon className="h-6 w-6" style={{ color: s.color }} /></span>
                  <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold">{s.name}</p><p className="text-sm text-muted-foreground">On the roadmap — connect this soon.</p></div>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-6 py-2 text-sm font-semibold text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Coming soon</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Google Search Console, Analytics &amp; Business Profile all connect with one Google sign-in.</p>
          </>
        )}

        {/* ------------------------------------------------ STEP 3 --- */}
        {step === 3 && (
          <>
            <div className="mb-6">
              <h2 className="font-heading text-2xl font-semibold">Live Keyword Tracking,</h2>
              <p className="mt-0.5 text-[15px] text-muted-foreground">Add or remove the keywords tracked for this campaign.</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
              <div>
                <textarea
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder={"Enter one keyword per line\nseo tools\nrank tracker\nbacklink checker"}
                  className="min-h-[280px] w-full resize-y rounded-2xl border border-input bg-card px-4 py-3 text-[15px] shadow-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-ring/20"
                />
                <p className="mt-2 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{kwCount}</span> keyword{kwCount === 1 ? "" : "s"} — tracked daily on {google}.</p>
              </div>
              <div className="space-y-3">
                <div className={PILL}><FcGoogle className="h-5 w-5 shrink-0" />
                  <select value={country} onChange={(e) => setCountry(e.target.value)} className="min-w-0 flex-1 cursor-pointer bg-transparent text-[15px] outline-none">
                    {COUNTRIES.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
                  </select>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Device</p>
                  <div className="flex gap-2">
                    {DEVICES.map((d) => (
                      <button key={d} type="button" onClick={() => setDevice(d)} className={cn("flex-1 rounded-full border px-3 py-2.5 text-sm font-semibold transition-colors", device === d ? "border-primary bg-primary/[0.06] text-primary" : "border-input hover:border-primary/40")}>{d}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> SERP type &amp; local grid tracking — coming soon
                </div>
                <p className="text-xs text-muted-foreground">New keywords use the location &amp; device above. Existing keywords keep their own settings.</p>
              </div>
            </div>
          </>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => router.push(`/dashboard/projects/${project.slug}`)} className="rounded-full px-6 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">Cancel</button>
        <div className="flex gap-3">
          {step > 1 && <button onClick={() => setStep((s) => s - 1)} className="rounded-full border border-input bg-card px-7 py-2.5 text-sm font-semibold transition-colors hover:bg-muted">Previous</button>}
          {step === 1 && <Button className="rounded-full px-8" disabled={!step1Valid} onClick={() => setStep(2)}>Continue</Button>}
          {step === 2 && <Button className="rounded-full px-8" onClick={() => setStep(3)}>{intg.googleConnected ? "Next" : "Next / Skip"}</Button>}
          {step === 3 && <Button className="rounded-full px-8" onClick={finish} disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />} Save changes</Button>}
        </div>
      </div>
    </div>
  );
}
