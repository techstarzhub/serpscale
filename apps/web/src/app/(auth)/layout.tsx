import { RedirectIfAuthed } from "@/components/providers/redirect-if-authed";
import { Search, LineChart, Link2, FileSearch, Check } from "lucide-react";

// Clicking the logo returns to the marketing home page.
const MARKETING_HOME = process.env.NEXT_PUBLIC_MARKETING_URL || "https://serpscale.com";

const FEATURES = [
  { icon: Search, label: "Keyword research with real search volume" },
  { icon: LineChart, label: "Daily rank tracking on Google" },
  { icon: Link2, label: "Backlink monitoring & referring domains" },
  { icon: FileSearch, label: "Full technical site audits" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---- Brand panel: royal-blue gradient with glow + glass card ---- */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        {/* gradient base + animated glows */}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(150deg,#1e3a8a_0%,#2563eb_48%,#1d4ed8_100%)]" />
        <div className="pointer-events-none absolute -left-24 -top-24 -z-10 h-96 w-96 rounded-full bg-white/15 blur-3xl auth-float" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 -z-10 h-[26rem] w-[26rem] rounded-full bg-cyan-300/20 blur-3xl auth-float-slow" />
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:38px_38px]" />

        {/* Logo lockup → home */}
        <a href={MARKETING_HOME} className="flex items-center gap-3 transition-opacity hover:opacity-90">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/serpscale-logo.svg" alt="SerpScale" className="h-10 w-10 rounded-xl bg-white p-1 shadow-lg" />
          <span className="font-heading text-xl font-extrabold tracking-tight">SerpScale</span>
        </a>

        {/* Headline + features */}
        <div className="space-y-6">
          <h2 className="max-w-md font-heading text-[2.6rem] font-extrabold leading-[1.08] tracking-tight">
            Own your SEO data,<br />grow with confidence.
          </h2>
          <p className="max-w-sm text-[15px] leading-relaxed text-white/80">
            Rank tracking, site audits, backlinks and keyword research — in one clean dashboard built for agencies and in-house teams.
          </p>
          <ul className="space-y-3 pt-1">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-3 text-[14.5px] text-white/90">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
                  <f.icon className="h-4 w-4" />
                </span>
                {f.label}
              </li>
            ))}
          </ul>
        </div>

        {/* Factual highlights card (no fake reviews) */}
        <div className="max-w-sm rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Everything in one platform</p>
          <ul className="mt-3 space-y-2.5 text-sm text-white/90">
            {[
              "Start on a 7-day free trial",
              "White-label reports & client portals",
              "Unlimited campaigns on agency plans",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/25 text-emerald-200">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ---- Form panel ---- */}
      <div className="relative flex items-center justify-center overflow-hidden bg-background p-6 sm:p-10">
        {/* faint brand wash so the white side isn't flat */}
        <div className="pointer-events-none absolute -right-40 -top-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="relative w-full max-w-sm">
          {/* Mobile brand mark → home (brand panel is hidden on small screens) */}
          <a href={MARKETING_HOME} className="mb-8 flex items-center gap-2.5 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/serpscale-logo.svg" alt="SerpScale" className="h-9 w-9" />
            <span className="font-heading text-lg font-extrabold tracking-tight">
              <span className="text-primary">Serp</span>Scale
            </span>
          </a>
          <div className="auth-rise">
            <RedirectIfAuthed>{children}</RedirectIfAuthed>
          </div>
          {/* Trust footer */}
          <div className="mt-9 flex items-center justify-center gap-2 text-[11.5px] text-muted-foreground">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Secured with bank-level encryption
          </div>
        </div>
      </div>
    </div>
  );
}
