"use client";

import { Bot, Accessibility, GitCompareArrows, ChevronRight, ExternalLink, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AiReadiness, AccessibilityData, CannibalCluster } from "./links-panel";

function shortUrl(u: string) {
  try {
    const url = new URL(u);
    return url.pathname === "/" ? url.hostname : url.pathname;
  } catch {
    return u;
  }
}

const scoreHue = (v: number) => (v >= 80 ? "chart-2" : v >= 50 ? "chart-3" : "destructive");

// Circular score ring (SVG), colour-coded by value.
function ScoreRing({ value, grade }: { value: number; grade: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  const hue = scoreHue(value);
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke={`hsl(var(--${hue}))`} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold leading-none" style={{ color: `hsl(var(--${hue}))` }}>{value}</span>
        <span className="mt-1 text-xs text-muted-foreground">Grade {grade}</span>
      </div>
    </div>
  );
}

function AiReadinessCard({ data }: { data: AiReadiness }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Bot className="h-4 w-4" /></span>
        <div>
          <h4 className="font-heading text-sm font-semibold">AI Readiness</h4>
          <p className="text-xs text-muted-foreground">Visibility to ChatGPT · Perplexity · Google AI Overviews</p>
        </div>
      </div>
      <div className="flex flex-col items-center gap-5 p-5 sm:flex-row">
        <ScoreRing value={data.score} grade={data.grade} />
        <div className="w-full flex-1 space-y-2.5">
          {data.factors.map((f) => (
            <div key={f.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium">{f.label}</span>
                <span className="text-muted-foreground">{f.score}<span className="opacity-60"> · {Math.round(f.weight * 100)}%</span></span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, f.score)}%`, background: `hsl(var(--${scoreHue(f.score)}))` }} />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{f.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const IMPACT_TONE: Record<string, string> = {
  critical: "text-destructive",
  serious: "text-destructive",
  moderate: "text-chart-3",
  minor: "text-muted-foreground",
};

function AccessibilityCard({ data }: { data: AccessibilityData }) {
  const [open, setOpen] = useState<string | null>(null);
  const t = data.totals;
  const kpis = [
    { label: "Critical", value: t.critical, tone: "text-destructive" },
    { label: "Serious", value: t.serious, tone: "text-destructive" },
    { label: "Moderate", value: t.moderate, tone: "text-chart-3" },
    { label: "Minor", value: t.minor, tone: "text-muted-foreground" },
  ];
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Accessibility className="h-4 w-4" /></span>
        <div>
          <h4 className="font-heading text-sm font-semibold">Accessibility (WCAG A/AA)</h4>
          <p className="text-xs text-muted-foreground">axe-core across {data.pagesAudited} sampled page{data.pagesAudited !== 1 ? "s" : ""}</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 p-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
            <div className={cn("text-xl font-semibold leading-none", k.value > 0 ? k.tone : "text-muted-foreground")}>{k.value}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>
      {data.byRule.length > 0 && (
        <div className="divide-y divide-border border-t border-border">
          {data.byRule.slice(0, 12).map((r) => (
            <div key={r.id}>
              <button onClick={() => setOpen((o) => (o === r.id ? null : r.id))} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-secondary/40">
                <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open === r.id && "rotate-90")} />
                <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase", IMPACT_TONE[r.impact], "bg-secondary")}>{r.impact}</span>
                <span className="min-w-0 flex-1 truncate text-sm" title={r.help}>{r.help}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{r.nodes} el</span>
              </button>
              {open === r.id && (
                <div className="space-y-1.5 bg-secondary/20 px-4 py-2 pl-10">
                  <a href={r.helpUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" /> How to fix <span className="font-mono opacity-70">{r.id}</span>
                  </a>
                  <p className="text-[11px] font-medium text-muted-foreground">Seen on:</p>
                  {r.pages.map((p) => (
                    <div key={p} className="truncate text-xs text-muted-foreground" title={p}>{shortUrl(p)}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CannibalizationCard({ clusters }: { clusters: CannibalCluster[] }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><GitCompareArrows className="h-4 w-4" /></span>
        <div>
          <h4 className="font-heading text-sm font-semibold">Keyword cannibalization</h4>
          <p className="text-xs text-muted-foreground">{clusters.length} group{clusters.length !== 1 ? "s" : ""} of pages competing for the same keywords</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {clusters.map((c, i) => (
          <div key={i} className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {c.keywords.map((k) => (
                <span key={k} className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{k}</span>
              ))}
              <span className="text-xs text-muted-foreground">· {c.pages.length} competing pages</span>
            </div>
            <div className="space-y-1">
              {c.pages.map((p) => (
                <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm hover:bg-secondary/40 rounded px-1 py-0.5" title={p.url}>
                  <span className="min-w-0 flex-1 truncate">{p.title || shortUrl(p.url)}</span>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">{shortUrl(p.url)}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DuplicateContentCard({ clusters }: { clusters: { urls: string[] }[] }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Copy className="h-4 w-4" /></span>
        <div>
          <h4 className="font-heading text-sm font-semibold">Near-duplicate content</h4>
          <p className="text-xs text-muted-foreground">{clusters.length} group{clusters.length !== 1 ? "s" : ""} of pages with almost-identical body content</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {clusters.map((c, i) => (
          <div key={i} className="p-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">{c.urls.length} pages share the same content:</div>
            <div className="space-y-1">
              {c.urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="block truncate rounded px-1 py-0.5 text-sm text-primary hover:bg-secondary/40 hover:underline" title={u}>{shortUrl(u)}</a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// The "modern SEO" insight cards, rendered only when their data exists.
export function InsightsPanel({
  aiReadiness,
  accessibility,
  cannibalization,
  duplicateContent,
}: {
  aiReadiness?: AiReadiness;
  accessibility?: AccessibilityData;
  cannibalization?: CannibalCluster[];
  duplicateContent?: { urls: string[] }[];
}) {
  const empty = !aiReadiness && !(accessibility && accessibility.pagesAudited > 0) && !(cannibalization?.length) && !(duplicateContent?.length);
  return (
    <div className="space-y-3">
      {aiReadiness && <AiReadinessCard data={aiReadiness} />}
      {accessibility && accessibility.pagesAudited > 0 && <AccessibilityCard data={accessibility} />}
      {cannibalization && cannibalization.length > 0 && <CannibalizationCard clusters={cannibalization} />}
      {duplicateContent && duplicateContent.length > 0 && <DuplicateContentCard clusters={duplicateContent} />}
      {empty && (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No AI-readiness, accessibility, cannibalization or duplicate-content data yet — re-run the audit to generate it.
        </div>
      )}
    </div>
  );
}
