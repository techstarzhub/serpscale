"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Check, Link2, LayoutGrid, Plug, ListChecks, Lock, Info, ExternalLink, Database, AlertTriangle } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { SiGoogleanalytics, SiGooglesearchconsole, SiGoogleads, SiMeta, SiInstagram, SiYoutube, SiPinterest } from "react-icons/si";
import { FaGithub, FaLinkedin } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useProjects } from "@/components/providers/projects-provider";
import { useFeature, useCan } from "@/components/providers/user-provider";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { validateName, validateDomain, normalizeDomain } from "@/lib/campaign-validation";
import { COUNTRIES as ALL_COUNTRIES } from "@/lib/locations";

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

// All countries from the shared lib (WW = worldwide not relevant for rank tracking)
const COUNTRIES = ALL_COUNTRIES.filter((x) => x.value !== "WW").map((x) => ({ code: x.value, label: x.label }));
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

/* ------------------------------------------------------------- page --- */

export default function NewCampaignPage() {
  const router = useRouter();
  const { addProject } = useProjects();
  const hasFeature = useFeature();
  const can = useCan();
  // Connecting Google accounts is an integrations action — ADMINs always may;
  // others need the "integrations.manage" permission (mirrors the API guard).
  const canManageIntegrations = can("integrations.manage");

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [country, setCountry] = useState("US");
  const [mods, setMods] = useState<string[]>(["overview", "keywords", "ranks", "audit", "backlinks"]);
  const [keywords, setKeywords] = useState("");
  const [device, setDevice] = useState("Desktop");

  // Real integration status (Google account is org-level → shared by GSC/GA/GMB).
  const [intg, setIntg] = useState<{ loaded: boolean; configured: boolean; accounts: { id: string; accountEmail: string | null; status?: string }[] }>({ loaded: false, configured: true, accounts: [] });
  // Which connected Google account powers this campaign's data. "" = auto-detect
  // by domain across every account (default, and the only option with one account).
  const [dataSource, setDataSource] = useState("");
  // Per-service overrides of the default above. "" = use the default account.
  const [svcAccounts, setSvcAccounts] = useState<{ gsc: string; ga: string; gmb: string }>({ gsc: "", ga: "", gmb: "" });
  const fetchIntg = useCallback(async () => {
    try {
      const s = await api.get<{ googleAccounts?: { id: string; accountEmail: string | null; status?: string }[]; googleConfigured?: boolean }>("/integrations");
      setIntg({ loaded: true, configured: s?.googleConfigured ?? false, accounts: s?.googleAccounts ?? [] });
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
    // Poll while the user completes OAuth in the other tab (focus listener also refetches).
    let n = 0;
    const t = setInterval(async () => { n++; await fetchIntg(); if (n >= 40) clearInterval(t); }, 2500);
  }

  // Per-field validation (mirrors the server DTO). Errors only surface once a
  // field has been touched, so the form doesn't shout before the user has typed.
  const [touched, setTouched] = useState<{ name?: boolean; domain?: boolean }>({});
  const nameErr = validateName(name);
  const domainErr = validateDomain(domain);

  const google = COUNTRIES.find((x) => x.code === country)?.label ?? "us (google.com)";
  const kwCount = keywords.split("\n").map((k) => k.trim()).filter(Boolean).length;
  const step1Valid = !nameErr && !domainErr;

  // Google connection state derived from the connected-accounts list.
  const googleConnected = intg.accounts.length > 0;
  // The account that will actually be used: an explicit pick, or the sole account,
  // else "Auto-detect by domain" (shown to the user so the source is never a mystery).
  const effectiveAccount = dataSource || (intg.accounts.length === 1 ? intg.accounts[0].accountEmail ?? "" : "");
  const accountLabel = effectiveAccount || "Auto-detect by domain";
  // Accounts whose Google token was revoked/expired — they need reconnecting.
  const isExpired = (s?: string) => !!s && s !== "connected";
  const expiredAccounts = intg.accounts.filter((a) => isExpired(a.status));
  // Connected accounts as combobox options (searchable, theme-styled). Expired
  // accounts are flagged inline so a stale source is obvious in the picker.
  const accountOpts = intg.accounts.map((a) => ({
    value: a.accountEmail ?? "",
    label: (a.accountEmail ?? "Connected account") + (isExpired(a.status) ? "  ·  expired" : ""),
    hint: isExpired(a.status) ? "reconnect" : undefined,
  }));

  async function finish() {
    // Final guard: never submit if step 1 is invalid (e.g. reached here via back).
    if (!step1Valid) {
      setTouched({ name: true, domain: true });
      setStep(1);
      setError(nameErr || domainErr || "Please fix the highlighted fields.");
      return;
    }
    setError(""); setLoading(true);
    try {
      const project = await addProject({
        name: name.trim(),
        domain: normalizeDomain(domain),
        enabledTabs: mods,
        googleAccountEmail: dataSource || undefined,
        gscAccountEmail: svcAccounts.gsc || undefined,
        gaAccountEmail: svcAccounts.ga || undefined,
        gmbAccountEmail: svcAccounts.gmb || undefined,
      });
      // Actually enrol the entered keywords into the rank tracker with the chosen
      // location + device (the real backend fields), so those selectors do real work.
      const kws = keywords.split("\n").map((k) => k.trim()).filter(Boolean);
      if (kws.length) {
        await Promise.allSettled(
          kws.map((keyword) =>
            api.post(`/projects/${project.id}/rank-keywords`, { keyword, country, device: device.toLowerCase() }),
          ),
        );
      }
      router.push(`/dashboard/projects/${project.slug}?tab=ranks`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create campaign.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 pb-12">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <div className="rounded-2xl border border-border bg-card px-7 py-6 shadow-sm">
        <h1 className="font-heading text-[26px] font-bold tracking-tight">
          Create Campaign <span className="text-lg font-medium text-muted-foreground">({domain || "example.com"})</span>
        </h1>
      </div>

      <ChevronSteps step={step} />

      <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
        {/* ------------------------------------------------ STEP 1 --- */}
        {step === 1 && (
          <>
            <div className="mb-7">
              <h2 className="font-heading text-2xl font-semibold">Welcome,</h2>
              <p className="mt-0.5 text-[15px] text-muted-foreground">It only takes a few seconds to add your campaign.</p>
            </div>

            <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-[1.35fr_1fr]">
              <div className="min-w-0">
                <label className={cn(PILL, touched.name && nameErr && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20")}>
                  <LayoutGrid className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
                  <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, name: true }))} placeholder="Campaign Name" className={FIELD} autoFocus aria-invalid={!!(touched.name && nameErr)} />
                </label>
                {touched.name && nameErr && <p className="mt-1.5 px-1 text-xs font-medium text-destructive">{nameErr}</p>}
              </div>
              <Hint>Name of campaign.</Hint>

              <div className="min-w-0">
                <div className={cn(PILL, touched.domain && domainErr && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20")}>
                  <Link2 className="h-[18px] w-[18px] shrink-0 text-primary" />
                  <input value={domain} onChange={(e) => setDomain(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, domain: true }))} placeholder="example.com" className={FIELD} aria-invalid={!!(touched.domain && domainErr)} />
                </div>
                {touched.domain && domainErr && <p className="mt-1.5 px-1 text-xs font-medium text-destructive">{domainErr}</p>}
              </div>
              <Hint>Domain of campaign — we track rankings for this site.</Hint>

              <Combobox
                value={country}
                onChange={setCountry}
                options={COUNTRIES.map((x) => ({ value: x.code, label: x.label }))}
                placeholder="Select country…"
                searchPlaceholder="Search country…"
                icon={<FcGoogle className="h-5 w-5 shrink-0" />}
                triggerClassName="flex h-[54px] w-full items-center gap-3 rounded-full border border-input bg-card px-4 shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 text-[15px]"
              />
              <Hint>Select the version of Google you want to track results in. By default it&apos;s Google.com.</Hint>

              <div className="lg:col-span-2">
                <p className="mb-1 mt-2 flex items-center gap-1.5 text-[15px] font-semibold">Select your Dashboards <Info className="h-3.5 w-3.5 text-muted-foreground" /></p>
                <p className="mb-3 text-xs text-muted-foreground">Hover any dashboard to see what it does. These are the tabs you&apos;ll get inside the campaign.</p>
                <div className="flex flex-wrap gap-x-7 gap-y-3.5">
                  {MODULES.map((m) => {
                    // Overview is always available; other modules require the plan.
                    const locked = m.id !== "overview" && !hasFeature(m.id);
                    const on = mods.includes(m.id) && !locked;
                    return (
                      <div key={m.id} className="group relative">
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => setMods((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                          className={cn("flex items-center gap-2.5", locked && "cursor-not-allowed opacity-50")}
                        >
                          <span className={cn("flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border-2 transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card group-hover:border-primary/50")}>
                            {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : locked ? <Lock className="h-3 w-3 text-muted-foreground" /> : null}
                          </span>
                          <span className="text-[15px] font-medium">{m.label}</span>
                        </button>
                        {/* hover tooltip */}
                        <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-60 -translate-y-1 rounded-xl border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground opacity-0 shadow-lg transition-all duration-150 group-hover:-translate-y-0 group-hover:opacity-100">
                          <span className="mb-0.5 block font-semibold">{m.label}</span>
                          {locked ? "Not included in your plan — upgrade to enable this dashboard." : m.info}
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
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-heading text-2xl font-semibold">Integrations,</h2>
                <p className="mt-0.5 text-[15px] text-muted-foreground">Connect your accounts to pull live data. You can skip and connect any later.</p>
              </div>
              {/* Add / connect a Google account without leaving the wizard. */}
              {canManageIntegrations && intg.loaded && intg.configured && (
                <button
                  type="button"
                  onClick={connectGoogle}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-input bg-card px-5 py-2.5 text-sm font-semibold shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
                >
                  <FcGoogle className="h-5 w-5" /> {googleConnected ? "Add another Google account" : "Connect a Google account"}
                </button>
              )}
            </div>

            {/* Any account whose token Google revoked needs a one-time reconnect. */}
            {expiredAccounts.length > 0 && (
              <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/[0.06] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span><span className="font-semibold">{expiredAccounts.map((a) => a.accountEmail).join(", ")}</span> {expiredAccounts.length === 1 ? "has" : "have"} expired — reconnect to resume live data.</span>
                </p>
                {canManageIntegrations && (
                  <button type="button" onClick={connectGoogle} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90">
                    <ExternalLink className="h-3.5 w-3.5" /> Reconnect
                  </button>
                )}
              </div>
            )}

            {/* Data source picker — only when several Google accounts are connected.
                One account powers all three Google services, so it lives once here. */}
            {googleConnected && intg.accounts.length >= 2 && (
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.04] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[15px] font-semibold"><Database className="h-4 w-4 text-primary" /> Data source <span className="text-xs font-medium text-muted-foreground">(default)</span></p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{intg.accounts.length} Google accounts connected — this is the default; override any service below.</p>
                </div>
                <Combobox
                  value={dataSource}
                  onChange={setDataSource}
                  className="w-full shrink-0 sm:w-64"
                  align="end"
                  icon={<Database className="h-4 w-4 shrink-0 text-primary" />}
                  searchPlaceholder="Search accounts…"
                  options={[{ value: "", label: "Auto-detect by domain" }, ...accountOpts]}
                />
              </div>
            )}

            <div className="space-y-3">
              {INTEGRATIONS.map((it) => {
                const isGoogle = it.provider === "google";
                const connected = isGoogle && googleConnected;
                const needsSetup = isGoogle && intg.loaded && !intg.configured;
                return (
                  <div key={it.id} className={cn("flex items-center gap-4 rounded-2xl border px-5 py-4 transition-shadow hover:shadow-sm", connected ? "border-success/40 bg-success/[0.04]" : "border-border bg-card")}>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card">
                      <it.Icon className="h-6 w-6" style={it.color ? { color: it.color } : { color: "hsl(var(--foreground))" }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{it.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{needsSetup ? "Add GOOGLE_CLIENT_ID & secret in settings to enable this." : it.desc}</p>
                    </div>
                    {/* GitHub is per-campaign → available after launch */}
                    {it.provider === "github" ? (
                      <span title="Connect GitHub from the campaign once it's created." className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-5 py-2 text-sm font-semibold text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" /> After launch
                      </span>
                    ) : connected ? (
                      // Connected badge, and on the same line the account this service
                      // pulls from — a searchable picker when several accounts exist.
                      <div className="flex shrink-0 items-center gap-2">
                        {intg.accounts.length >= 2 ? (
                          <Combobox
                            value={svcAccounts[it.id as "gsc" | "ga" | "gmb"]}
                            onChange={(v) => setSvcAccounts((s) => ({ ...s, [it.id]: v }))}
                            className="w-56"
                            align="end"
                            icon={<Database className="h-3.5 w-3.5 shrink-0 text-success" />}
                            searchPlaceholder="Search accounts…"
                            options={[{ value: "", label: `Use default (${accountLabel})` }, ...accountOpts]}
                          />
                        ) : (
                          <p className="flex items-center gap-1 truncate text-xs font-medium text-success"><Database className="h-3 w-3 shrink-0" /> {accountLabel}</p>
                        )}
                        <span className="flex items-center gap-1.5 rounded-full border border-success bg-success/10 px-5 py-2 text-sm font-semibold text-success">
                          <Check className="h-4 w-4" /> Connected
                        </span>
                      </div>
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
              <p className="mt-0.5 text-[15px] text-muted-foreground">Set up your keyword ranking tracking.</p>
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
                <Combobox
                  value={country}
                  onChange={setCountry}
                  options={COUNTRIES.map((x) => ({ value: x.code, label: x.label }))}
                  placeholder="Select country…"
                  searchPlaceholder="Search country…"
                  icon={<FcGoogle className="h-5 w-5 shrink-0" />}
                  triggerClassName="flex h-[54px] w-full items-center gap-3 rounded-full border border-input bg-card px-4 shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 text-[15px]"
                />
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
              </div>
            </div>
          </>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => router.push("/dashboard")} className="rounded-full px-6 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">Cancel</button>
        <div className="flex gap-3">
          {step > 1 && <button onClick={() => setStep((s) => s - 1)} className="rounded-full border border-input bg-card px-7 py-2.5 text-sm font-semibold transition-colors hover:bg-muted">Previous</button>}
          {step === 1 && <Button className="rounded-full px-8" onClick={() => { if (!step1Valid) { setTouched({ name: true, domain: true }); return; } setStep(2); }}>Continue</Button>}
          {step === 2 && <Button className="rounded-full px-8" onClick={() => setStep(3)}>{googleConnected ? "Next" : "Next / Skip"}</Button>}
          {step === 3 && <Button className="rounded-full px-8" onClick={finish} disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />} Finish</Button>}
        </div>
      </div>
    </div>
  );
}
