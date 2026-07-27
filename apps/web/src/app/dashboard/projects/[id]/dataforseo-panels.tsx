"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users, Loader2, Swords, Search, ExternalLink, Globe2, Layers, Mail, Phone,
  Sparkles, CheckCircle2, XCircle, Cpu, TrendingUp, Coins, RefreshCw, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { api } from "@/lib/api";
import { type Project } from "@/components/providers/projects-provider";
import { COUNTRIES, LANGUAGES } from "@/lib/locations";
import { BarCell, MetricCard } from "@/components/ui/metric";
import { KpiGridSkeleton, TableCardSkeleton } from "@/components/ui/panel-skeletons";

/** Shown when a paid DataForSEO panel has no cached data — the user loads it on
 *  demand so opening the tab never spends money by itself. */
export function LoadDataCard({ label, onLoad }: { label: string; onLoad: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary"><Coins className="h-5 w-5" /></span>
        <div>
          <p className="text-sm font-medium">{label} not loaded yet</p>
          <p className="mt-0.5 text-xs text-muted-foreground">This runs a paid DataForSEO request. Results are cached for 30 days.</p>
        </div>
        <Button onClick={onLoad} className="gap-2"><Coins className="h-4 w-4" /> Load {label.toLowerCase()}</Button>
      </CardContent>
    </Card>
  );
}

function fmtVol(n: number | null | undefined) {
  const v = n ?? 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(v);
}
function posTone(p: number | null) {
  if (p == null) return "bg-muted text-muted-foreground";
  if (p <= 3) return "bg-chart-2/15 text-chart-2";
  if (p <= 10) return "bg-chart-3/15 text-chart-3";
  return "bg-muted text-muted-foreground";
}

function Loading({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {label}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Competitors
// ===========================================================================

interface Competitor { domain: string; avgPosition: number | null; commonKeywords: number; keywords: number; etv: number; top10: number }
interface CompResp { connected: boolean; loaded?: boolean; target?: string; overview?: { keywords: number; etv: number; pos_1: number; pos_2_3: number; pos_4_10: number }; competitors: Competitor[] }
interface GapKw { keyword: string; volume: number; cpc: number | null; difficulty: number | null; yourPosition: number | null; competitorPosition: number | null }
interface GapResp { connected: boolean; competitor?: string; keywords: GapKw[] }

export function CompetitorsPanel({ project, refreshNonce = 0 }: { project: Project; refreshNonce?: number }) {
  const [country, setCountry] = useState("US");
  const [language, setLanguage] = useState("en");
  const [data, setData] = useState<CompResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [gapTarget, setGapTarget] = useState("");
  const [gap, setGap] = useState<GapResp | null>(null);
  const [gapLoading, setGapLoading] = useState(false);

  // `cached` = free, only reads what's already stored (used on open + filter change).
  // `live`   = a paid DataForSEO call, only on the user's explicit Load / Refresh.
  const load = useCallback(
    (mode: "cached" | "live") => {
      setLoading(true);
      setData(null);
      const q = mode === "cached" ? "&cachedOnly=1" : "&fresh=1";
      api
        .get<CompResp>(`/projects/${project.id}/competitors?country=${country}&language=${language}${q}`)
        .then((d) => (setData(d), setLoading(false)))
        .catch(() => (setData(null), setLoading(false)));
    },
    [project.id, country, language],
  );
  useEffect(() => { load("cached"); }, [load]); // open / filter change → free, no paid call
  useEffect(() => { if (refreshNonce) load("live"); }, [refreshNonce]); // global Refresh → paid

  function runGap(domain: string) {
    setGapTarget(domain);
    setGap(null);
    setGapLoading(true);
    api
      .get<GapResp>(`/projects/${project.id}/keyword-gap?competitor=${encodeURIComponent(domain)}&country=${country}&language=${language}`)
      .then((d) => setGap(d))
      .catch(() => setGap({ connected: false, keywords: [] }))
      .finally(() => setGapLoading(false));
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Swords className="h-4 w-4 text-primary" /> Organic competitors for {project.domain}
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <Combobox value={country} onChange={setCountry} options={COUNTRIES} className="w-[160px]" icon={<Globe2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />} />
            <Combobox value={language} onChange={setLanguage} options={LANGUAGES} className="w-[120px]" />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <>
          <KpiGridSkeleton count={3} />
          <TableCardSkeleton rows={8} />
        </>
      ) : data?.loaded === false ? (
        <LoadDataCard label="Competitor data" onLoad={() => load("live")} />
      ) : !data?.connected ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Competitor data unavailable for this domain.</CardContent></Card>
      ) : (
        <>
          {data.overview && (
            <div className="grid gap-2.5 sm:grid-cols-3">
              <MetricCard icon={Search} accent="blue" label="Your keywords" value={fmtVol(data.overview.keywords)} hint="Organic ranking keywords" />
              <MetricCard icon={CheckCircle2} accent="green" label="Your top 10" value={fmtVol(data.overview.pos_1 + data.overview.pos_2_3 + data.overview.pos_4_10)} hint="Keywords on page 1" />
              <MetricCard icon={TrendingUp} accent="violet" label="Est. traffic / mo" value={fmtVol(data.overview.etv)} hint="Estimated organic visits" />
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><CardTitle className="text-base">Top competitors</CardTitle></div>
              <CardDescription>Domains competing for the same keywords. Click one to see the keyword gap.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-20 bg-card text-left text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 font-medium">Domain</th>
                      <th className="px-4 py-2 text-right font-medium">Common kw</th>
                      <th className="px-4 py-2 text-right font-medium">Keywords</th>
                      <th className="px-4 py-2 text-right font-medium">Top 10</th>
                      <th className="px-4 py-2 text-right font-medium">Traffic</th>
                      <th className="px-4 py-2 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.competitors.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No competitors found.</td></tr>
                    )}
                    {data.competitors.map((c) => {
                      const cMaxCommon = Math.max(1, ...data.competitors.map((x) => x.commonKeywords));
                      const cMaxEtv = Math.max(1, ...data.competitors.map((x) => x.etv));
                      return (
                        <tr key={c.domain} className="border-b border-border last:border-0 hover:bg-secondary/40">
                          <td className="px-4 py-2">
                            <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium hover:text-primary">{c.domain}<ExternalLink className="h-3 w-3 text-muted-foreground" /></a>
                          </td>
                          <td className="px-3 py-1.5"><BarCell value={c.commonKeywords} max={cMaxCommon} color="chart-1" format={fmtVol} /></td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmtVol(c.keywords)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-chart-2">{fmtVol(c.top10)}</td>
                          <td className="px-3 py-1.5"><BarCell value={c.etv} max={cMaxEtv} color="chart-4" format={fmtVol} /></td>
                          <td className="px-4 py-2 text-right">
                            <button onClick={() => runGap(c.domain)} className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary">Gap</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Keyword gap */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><CardTitle className="text-base">Keyword gap</CardTitle></div>
              <CardDescription>Keywords a competitor ranks for — find opportunities you are missing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={gapTarget} onChange={(e) => setGapTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && gapTarget.trim() && runGap(gapTarget.trim())} placeholder="competitor.com" className="pl-9" />
                </div>
                <Button onClick={() => gapTarget.trim() && runGap(gapTarget.trim())} disabled={gapLoading || !gapTarget.trim()}>
                  {gapLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Compare"}
                </Button>
              </div>
              {gap && gap.keywords.length > 0 && (
                <div className="max-h-[360px] overflow-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-20 bg-card text-left text-xs uppercase text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-4 py-2 font-medium">Keyword</th>
                        <th className="px-4 py-2 text-right font-medium">Volume</th>
                        <th className="px-4 py-2 text-center font-medium">You</th>
                        <th className="px-4 py-2 text-center font-medium">{gap.competitor ?? "Competitor"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gap.keywords.map((k, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/40">
                          <td className="px-4 py-2 font-medium">{k.keyword}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmtVol(k.volume)}</td>
                          <td className="px-4 py-2 text-center"><span className={cn("inline-block min-w-[2rem] rounded-md px-2 py-0.5 text-xs font-semibold", posTone(k.yourPosition))}>{k.yourPosition ?? "—"}</span></td>
                          <td className="px-4 py-2 text-center"><span className={cn("inline-block min-w-[2rem] rounded-md px-2 py-0.5 text-xs font-semibold", posTone(k.competitorPosition))}>{k.competitorPosition ?? "—"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {gap && gap.connected && gap.keywords.length === 0 && !gapLoading && (
                <p className="text-sm text-muted-foreground">No overlapping keywords found for {gap.competitor}.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Domain (technology stack + contacts)
// ===========================================================================

interface TechResp {
  connected: boolean; loaded?: boolean; target?: string; title: string | null; description: string | null;
  domainRank: number | null; country: string | null; language: string | null; lastVisited: string | null;
  emails: string[]; phones: string[]; social: string[]; groups: { group: string; items: string[] }[];
}

export function DomainPanel({ project, refreshNonce = 0 }: { project: Project; refreshNonce?: number }) {
  const [data, setData] = useState<TechResp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (mode: "cached" | "live") => {
      setLoading(true);
      const q = mode === "cached" ? "?cachedOnly=1" : "?fresh=1";
      api
        .get<TechResp>(`/projects/${project.id}/technologies${q}`)
        .then((d) => (setData(d), setLoading(false)))
        .catch(() => (setData(null), setLoading(false)));
    },
    [project.id],
  );
  useEffect(() => { load("cached"); }, [load]);
  useEffect(() => { if (refreshNonce) load("live"); }, [refreshNonce]);

  if (loading) return <div className="space-y-3"><KpiGridSkeleton count={3} /><TableCardSkeleton rows={5} /></div>;
  if (data?.loaded === false) return <LoadDataCard label="Domain analytics" onLoad={() => load("live")} />;
  if (!data?.connected) return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Domain analytics unavailable for this domain.</CardContent></Card>;

  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <MetricCard icon={Layers} accent="violet" label="Domain rank" value={data.domainRank != null ? String(data.domainRank) : "—"} hint="Domain authority score" />
        <MetricCard icon={Globe2} accent="blue" label="Country" value={data.country ?? "—"} hint={data.language ? `Language ${data.language}` : "Primary market"} />
        <MetricCard icon={Cpu} accent="green" label="Technologies" value={String(data.groups.reduce((n, g) => n + g.items.length, 0))} hint={`${data.groups.length} categories`} />
      </div>

      {(data.title || data.description) && (
        <Card>
          <CardContent className="p-4">
            {data.title && <div className="font-heading text-sm font-semibold">{data.title}</div>}
            {data.description && <p className="mt-1 text-sm text-muted-foreground">{data.description}</p>}
          </CardContent>
        </Card>
      )}

      {(data.emails.length > 0 || data.phones.length > 0 || data.social.length > 0) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Contact & social</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data.emails.map((e) => <span key={e} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-xs"><Mail className="h-3 w-3" />{e}</span>)}
            {data.phones.map((p) => <span key={p} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-xs"><Phone className="h-3 w-3" />{p}</span>)}
            {data.social.map((s) => <a key={s} href={s} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-xs hover:text-primary"><ExternalLink className="h-3 w-3" />{s.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}</a>)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /><CardTitle className="text-base">Technology stack</CardTitle></div>
          <CardDescription>What {project.domain} is built with.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.groups.length === 0 && <p className="text-sm text-muted-foreground">No technologies detected.</p>}
          {data.groups.map((g) => (
            <div key={g.group}>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.group.replace(/_/g, " ")}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((t) => <span key={t} className="inline-flex items-center gap-1.5 rounded-md bg-chart-1/10 px-2 py-0.5 text-xs font-medium text-chart-1"><Cpu className="h-3 w-3" />{t}</span>)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// AI Visibility (LLM answers)
// ===========================================================================

interface AiModelResult { engine: string; label: string; model: string; connected: boolean; mentioned: boolean; text: string }
interface AiMultiResp { brand: string; prompt: string; results: AiModelResult[]; mentionedCount: number; answered: number; total: number }

// Each assistant gets a distinct theme-token colour (never hardcoded hex).
const MODEL_TONE: Record<string, { chip: string; bar: string }> = {
  chat_gpt: { chip: "bg-chart-2/12 text-chart-2", bar: "bg-chart-2" },
  gemini: { chip: "bg-chart-1/12 text-chart-1", bar: "bg-chart-1" },
  claude: { chip: "bg-chart-4/12 text-chart-4", bar: "bg-chart-4" },
  perplexity: { chip: "bg-chart-3/12 text-chart-3", bar: "bg-chart-3" },
};

function HighlightBrand({ text, brand }: { text: string; brand: string }) {
  if (!brand || brand.length < 3) return <p className="whitespace-pre-wrap">{text}</p>;
  const re = new RegExp(`(${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  return (
    <p className="whitespace-pre-wrap">
      {text.split(re).map((p, i) => (p.toLowerCase() === brand.toLowerCase() ? <mark key={i} className="rounded bg-chart-2/20 px-0.5 font-semibold text-chart-2">{p}</mark> : <span key={i}>{p}</span>))}
    </p>
  );
}

function ModelCard({ m, r, brand }: { m: { engine: string; label: string; model: string }; r?: AiModelResult; brand: string }) {
  const [open, setOpen] = useState(true); // answers shown by default — no click needed
  const tone = MODEL_TONE[m.engine] ?? { chip: "bg-secondary text-muted-foreground", bar: "bg-muted-foreground" };
  const pending = !r;
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card transition-opacity", pending && "opacity-70")}>
      <div className="flex items-center gap-2.5 p-3">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold", tone.chip)}>{m.label[0]}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight">{m.label}</div>
          <div className="truncate text-[11px] text-muted-foreground">{m.model}</div>
        </div>
        {pending ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Asking…</span>
        ) : !r!.connected ? (
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">No answer</span>
        ) : r!.mentioned ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-chart-2/15 px-2 py-0.5 text-[11px] font-semibold text-chart-2"><CheckCircle2 className="h-3.5 w-3.5" />Mentioned</span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><XCircle className="h-3.5 w-3.5" />Not mentioned</span>
        )}
      </div>
      {r && r.connected && r.text && (
        <>
          <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between border-t border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground">
            {open ? "Hide answer" : "View answer"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>
          {open && <div className="max-h-72 overflow-y-auto border-t border-border p-3 text-sm leading-relaxed text-foreground"><HighlightBrand text={r.text} brand={brand} /></div>}
        </>
      )}
    </div>
  );
}

const AIV_API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function AiVisibilityPanel({ project }: { project: Project }) {
  const brand = project.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split(".")[0];
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [models, setModels] = useState<{ engine: string; label: string; model: string }[]>([]);
  const [results, setResults] = useState<Record<string, AiModelResult>>({});
  const loading = phase === "loading";
  // Brand-FREE industry prompts built from the site's own keywords — the point is to
  // see whether the brand shows up in AI answers to generic questions customers ask.
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    api
      .get<{ keyword: string }[]>(`/projects/${project.id}/keywords/saved`)
      .then((rows) => {
        const kws = (Array.isArray(rows) ? rows : [])
          .map((r) => r.keyword)
          .filter((k) => k && !k.toLowerCase().includes(brand.toLowerCase()));
        const uniq = [...new Set(kws)].slice(0, 3);
        const out: string[] = [];
        uniq.forEach((k, i) => {
          const templates = [`best companies for ${k}`, `who offers the best ${k}`, `top ${k} providers`];
          out.push(templates[i % templates.length]);
        });
        setSuggestions(out.length ? out : ["best digital marketing agencies", "top SEO companies", "best white label SEO providers"]);
      })
      .catch(() => setSuggestions(["best digital marketing agencies", "top SEO companies", "best white label SEO providers"]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Stream per-model results over SSE so each card fills in as that AI answers.
  async function run(p: string) {
    const q = p.trim();
    if (!q) return;
    setPrompt(q);
    setPhase("loading");
    setModels([]);
    setResults({});
    try {
      const res = await fetch(`${AIV_API}/projects/${project.id}/ai-visibility?prompt=${encodeURIComponent(q)}`, { credentials: "include" });
      if (!res.ok || !res.body) throw new Error("stream failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let ev: { type: string; models?: typeof models; result?: AiModelResult };
          try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (ev.type === "init" && ev.models) setModels(ev.models);
          else if (ev.type === "model" && ev.result) setResults((prev) => ({ ...prev, [ev.result!.engine]: ev.result! }));
        }
      }
    } catch {
      /* leave whatever streamed; phase→done shows retry if nothing */
    } finally {
      setPhase("done");
    }
  }

  const arrived = models.map((m) => results[m.engine]).filter(Boolean) as AiModelResult[];
  const answered = arrived.filter((r) => r.connected).length;
  const mentionedCount = arrived.filter((r) => r.connected && r.mentioned).length;
  const summaryLabel =
    answered === 0 ? (phase === "done" ? "No AI assistant answered this query — try a broader question." : "Waiting for the AI assistants…") :
    mentionedCount === answered ? `Excellent — ${brand} is recommended by every AI that answered.` :
    mentionedCount === 0 ? `${brand} isn't showing up in AI answers yet — a big visibility opportunity.` :
    `${brand} is recommended by ${mentionedCount} of ${answered} AI assistants.`;
  const scoreTone = mentionedCount > 0 && mentionedCount === answered ? "text-chart-2" : mentionedCount > 0 ? "text-chart-3" : "text-muted-foreground";

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Ask what AI assistants say — is {brand} recommended?</div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run(prompt)} placeholder="e.g. best white label SEO companies in India" className="pl-9" />
            </div>
            <Button onClick={() => run(prompt)} disabled={loading || !prompt.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask AI"}
            </Button>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => run(s)} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary">{s}</button>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-muted-foreground">Checks ChatGPT, Gemini, Claude &amp; Perplexity at once. Results are cached, so re-asking the same question is free.</p>
        </CardContent>
      </Card>

      {/* Results — cards appear the moment their assistant answers */}
      {models.length > 0 && (
        <>
          {/* Visibility score hero */}
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="shrink-0 text-center">
                <div className={cn("text-3xl font-bold leading-none", scoreTone)}>{mentionedCount}<span className="text-lg text-muted-foreground">/{answered || models.length}</span></div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">AIs mention {brand}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  {summaryLabel}
                </div>
                <div className="flex gap-1.5">
                  {models.map((m) => {
                    const r = results[m.engine];
                    return (
                      <span key={m.engine} title={`${m.label}: ${r ? (r.connected ? (r.mentioned ? "mentioned" : "not mentioned") : "no answer") : "asking…"}`}
                        className={cn("h-2 flex-1 rounded-full", !r ? "animate-pulse bg-secondary" : r.mentioned ? (MODEL_TONE[m.engine]?.bar ?? "bg-chart-2") : r.connected ? "bg-secondary" : "bg-border")} />
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Per-assistant cards (pending → fills in as each answers) */}
          <div className="grid gap-2 sm:grid-cols-2">
            {models.map((m) => <ModelCard key={m.engine} m={m} r={results[m.engine]} brand={brand} />)}
          </div>

          {phase === "done" && answered === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="max-w-md text-sm text-muted-foreground">
                  No AI assistant returned an answer for <span className="font-medium text-foreground">&ldquo;{prompt}&rdquo;</span>. Try a more general, brand-free question (e.g. one of the suggestions above).
                </p>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => run(prompt)}><RefreshCw className="h-3.5 w-3.5" /> Try again</Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {phase === "idle" && models.length === 0 && (
        <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="h-7 w-7" /></span><h3 className="font-heading text-lg font-semibold">AI Visibility</h3><p className="max-w-md text-sm text-muted-foreground">See how your brand shows up across AI assistants — ChatGPT, Gemini, Claude and Perplexity. Ask a question your customers would ask and check who recommends you.</p></CardContent></Card>
      )}
    </div>
  );
}
