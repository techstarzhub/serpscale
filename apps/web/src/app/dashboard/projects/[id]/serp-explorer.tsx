"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Loader2,
  Sparkles,
  Star,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Globe2,
  Zap,
  Server,
  TrendingUp,
  Target,
  Bookmark,
  RefreshCw,
  Trash2,
  TrendingDown,
  Minus,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { api } from "@/lib/api";
import { type Project } from "@/components/providers/projects-provider";
import { COUNTRIES, LANGUAGES } from "@/lib/locations";
import { BarCell } from "@/components/ui/metric";

// Mirror of the backend NormalizedSerp contract.
interface OrganicItem { position: number; rank: number; title: string; url: string; domain: string; snippet?: string }
interface PaaItem { position: number; question: string; snippet?: string; url?: string }
interface RelatedItem { position: number; query: string }
interface AiOverview { content: string; sources: { title: string; url: string; domain: string }[]; citedDomains: string[] }
type FeatureItem = { type: string; position: number | string; content?: string; sourceUrl?: string; count?: number };
interface NormalizedSerp {
  query: string; engine: string; locale: { country: string; language: string }; device: string;
  fetchedAt: string; totalResults?: number;
  organic: OrganicItem[]; features: FeatureItem[]; aiOverview?: AiOverview;
  peopleAlsoAsk: PaaItem[]; relatedSearches: RelatedItem[];
  metadata: { provider: string; latencyMs: number; contentHash: string; totalOrganic: number; featureTypes: string[] };
}
type SearchResp = { status: "cached"; snapshot: NormalizedSerp } | { status: "queued"; jobId: string };
interface JobResp { status: string; provider: string | null; error: string | null; snapshot: NormalizedSerp | null }

interface KeywordMetric { keyword: string; volume: number; cpc: number | null; competition: number | null; competitionLevel: string | null; difficulty: number | null; trend: number[] }
interface IdeasResp { connected: boolean; seed?: string; keywords: KeywordMetric[] }
interface SavedSearch { id: string; kind: string; term: string; createdAt: string; resultAt: string | null; hasResult: boolean; keywordCount: number }

const DEVICES = [{ value: "desktop", label: "Desktop" }, { value: "mobile", label: "Mobile" }, { value: "tablet", label: "Tablet" }];

function fmtNum(n?: number) { return n == null ? "—" : n.toLocaleString(); }
function fmtHost(url: string) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }

// Country-code TLD → country. Only genuinely country-specific ccTLDs; ambiguous
// generic-use ones (.co, .io, .ai, .me, .tv…) and .com/.net/.org fall back to "Global".
const TLD_COUNTRY: Record<string, string> = {
  in: "India", uk: "UK", au: "Australia", ca: "Canada", de: "Germany", fr: "France",
  es: "Spain", it: "Italy", nl: "Netherlands", sg: "Singapore", ae: "UAE", pk: "Pakistan",
  bd: "Bangladesh", jp: "Japan", cn: "China", br: "Brazil", mx: "Mexico", za: "South Africa",
  ng: "Nigeria", ie: "Ireland", nz: "New Zealand", ru: "Russia", us: "USA", ph: "Philippines",
  my: "Malaysia", id: "Indonesia", th: "Thailand", vn: "Vietnam", tr: "Turkey", pl: "Poland",
  se: "Sweden", no: "Norway", dk: "Denmark", fi: "Finland", ch: "Switzerland", at: "Austria",
  be: "Belgium", pt: "Portugal", gr: "Greece", cz: "Czechia", ro: "Romania", hu: "Hungary",
  il: "Israel", sa: "Saudi Arabia", eg: "Egypt", ke: "Kenya", lk: "Sri Lanka", np: "Nepal",
  hk: "Hong Kong", tw: "Taiwan", kr: "South Korea", ua: "Ukraine", ar: "Argentina", cl: "Chile",
  pe: "Peru", qa: "Qatar", kw: "Kuwait",
};
function countryOf(url: string): string {
  try {
    const tld = new URL(url).hostname.toLowerCase().split(".").pop() || "";
    return TLD_COUNTRY[tld] || "Global";
  } catch {
    return "Global";
  }
}
function fmtVol(n: number) { if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"; if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K"; return String(n); }

function diffTone(d: number | null): { label: string; cls: string } {
  if (d == null) return { label: "—", cls: "bg-muted text-muted-foreground" };
  if (d < 30) return { label: `${d}`, cls: "bg-chart-2/15 text-chart-2" };
  if (d < 60) return { label: `${d}`, cls: "bg-chart-3/15 text-chart-3" };
  return { label: `${d}`, cls: "bg-destructive/12 text-destructive" };
}

/** Tiny inline SVG sparkline for a keyword's 12-month volume trend. */
function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 64, h = 20;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-chart-1" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function fmtLatency(ms: number) {
  if (ms == null || isNaN(ms)) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)} ms`;
}

// A single stat tile: tinted icon chip + label + value (with optional sub/leading node).
function Meta({
  icon: Icon, label, value, sub, tone = "bg-primary/10 text-primary", lead,
}: {
  icon: LucideIcon; label: string; value: string; sub?: string; tone?: string; lead?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card transition-colors hover:bg-secondary/20">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tone)}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5 leading-none">
          {lead}
          <span className="truncate text-base font-semibold tabular-nums">{value}</span>
          {sub && <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

export function SerpExplorer({ project }: { project: Project }) {
  const myDomain = project.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("US");
  const [language, setLanguage] = useState("en");
  const [device, setDevice] = useState("desktop");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [serp, setSerp] = useState<NormalizedSerp | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState("");
  const [openPaa, setOpenPaa] = useState<number | null>(null);
  const [ideas, setIdeas] = useState<KeywordMetric[] | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  // Saved keywords (keyword -> saved record id) so users can bookmark ideas and
  // reuse them later in the Content / Blog Generator tab.
  const [saved, setSaved] = useState<Map<string, string>>(new Map());
  const [savingKw, setSavingKw] = useState<string | null>(null);
  // Explorer view vs. the Saved-searches tab.
  const [view, setView] = useState<"explore" | "saved">("explore");
  // The user's saved searches (auto-saved on every run, with their full result
  // cached server-side so reopening one never re-hits the paid API).
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  // Which saved search is currently on screen (so the viewer can show a source note).
  const [activeSaved, setActiveSaved] = useState<{ id: string; term: string; at?: string | null } | null>(null);

  useEffect(() => {
    api
      .get<{ id: string; keyword: string }[]>(`/projects/${project.id}/keywords/saved`)
      .then((r) => setSaved(new Map((Array.isArray(r) ? r : []).map((k) => [k.keyword, k.id]))))
      .catch(() => {});
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  function loadSaved() {
    api
      .get<SavedSearch[]>(`/projects/${project.id}/search-history`)
      .then((r) => setSavedSearches(Array.isArray(r) ? r : []))
      .catch(() => {});
  }

  // Persist a completed search (term + full result snapshot) so it can be reopened
  // for free later. Called once the SERP + ideas have both resolved.
  function persistResult(term: string, snapshot: NormalizedSerp | null, ideasData: KeywordMetric[]) {
    const t = term.trim();
    if (!t) return;
    api
      .post(`/projects/${project.id}/search-history`, {
        kind: "serp",
        term: t,
        result: { serp: snapshot, ideas: ideasData, country, language, device },
      })
      .then(() => loadSaved())
      .catch(() => {});
  }

  // Reopen a saved search from its cached snapshot — no API call, no cost.
  async function openSaved(s: SavedSearch) {
    setOpeningId(s.id);
    try {
      const row = await api.get<{ term: string; result: { serp: NormalizedSerp | null; ideas: KeywordMetric[]; country?: string; language?: string; device?: string } | null; resultAt: string | null }>(
        `/projects/${project.id}/search-history/${s.id}`,
      );
      const res = row.result;
      setQuery(row.term);
      if (res?.country) setCountry(res.country);
      if (res?.language) setLanguage(res.language);
      if (res?.device) setDevice(res.device);
      setSerp(res?.serp ?? null);
      setIdeas(Array.isArray(res?.ideas) ? res!.ideas : []);
      setCached(true);
      setError(res?.serp ? "" : "This saved search has no stored result yet — hit refresh to fetch it.");
      setActiveSaved({ id: s.id, term: row.term, at: row.resultAt });
      setView("explore");
    } catch {
      setError("Could not open this saved search.");
    } finally {
      setOpeningId(null);
    }
  }

  async function refreshSaved(s: SavedSearch) {
    setRefreshingId(s.id);
    try {
      await run(s.term);
    } finally {
      setRefreshingId(null);
    }
  }

  async function deleteSaved(e: React.MouseEvent, s: SavedSearch) {
    e.stopPropagation();
    setSavedSearches((prev) => prev.filter((x) => x.id !== s.id));
    if (activeSaved?.id === s.id) setActiveSaved(null);
    await api.del(`/projects/${project.id}/search-history/${s.id}`).catch(() => {});
  }

  async function toggleSave(k: KeywordMetric) {
    setSavingKw(k.keyword);
    try {
      const existing = saved.get(k.keyword);
      if (existing) {
        await api.del(`/projects/${project.id}/keywords/saved/${existing}`);
        setSaved((m) => { const n = new Map(m); n.delete(k.keyword); return n; });
      } else {
        const r = await api.post<{ id: string }>(`/projects/${project.id}/keywords/saved`, {
          keyword: k.keyword, volume: k.volume, difficulty: k.difficulty, cpc: k.cpc,
        });
        setSaved((m) => new Map(m).set(k.keyword, r.id));
      }
    } catch {
      /* ignore */
    } finally {
      setSavingKw(null);
    }
  }
  const [ideaSort, setIdeaSort] = useState<"volume" | "difficulty" | "cpc" | "opportunity">("opportunity");

  // Keyword ideas (volume/difficulty/CPC) for the seed — runs in parallel with
  // the live SERP fetch. Cheap + cached 7d server-side. Returns the ideas so run()
  // can bundle them into the saved snapshot.
  async function loadIdeas(seed: string): Promise<KeywordMetric[]> {
    setIdeas(null); setIdeasLoading(true);
    try {
      const r = await api.get<IdeasResp>(`/projects/${project.id}/keywords?seed=${encodeURIComponent(seed)}&country=${country}&language=${language}`);
      const kws = r.keywords ?? [];
      setIdeas(kws);
      return kws;
    } catch {
      setIdeas([]);
      return [];
    } finally {
      setIdeasLoading(false);
    }
  }

  async function run(term?: string) {
    const q = (typeof term === "string" ? term : query).trim();
    if (!q) return;
    if (q !== query) setQuery(q);
    setView("explore"); setActiveSaved(null);
    setLoading(true); setError(""); setSerp(null); setCached(false); setStatusMsg("Sending request…");
    const ideasP = loadIdeas(q);
    let snapshot: NormalizedSerp | null = null;
    try {
      const res = await api.post<SearchResp>("/serp/search", { query: q, country, language, device, freshnessSeconds: 0 });
      if (res.status === "cached") {
        snapshot = res.snapshot; setSerp(snapshot); setCached(true);
      } else if (!res.jobId) {
        setError("Could not start the search. Please try again.");
      } else {
        // poll the async job
        setStatusMsg("Fetching SERP…");
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 800));
          const job = await api.get<JobResp>(`/serp/search/${res.jobId}`);
          if (job.status === "SUCCEEDED" && job.snapshot) { snapshot = job.snapshot; setSerp(snapshot); break; }
          if (job.status === "FAILED" || job.status === "DEAD") { setError(job.error || "Search failed"); break; }
          setStatusMsg(`Fetching SERP… (${job.status.toLowerCase()})`);
        }
        if (!snapshot && !error) setError("Timed out waiting for results");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false); setStatusMsg("");
    }
    const ideasData = await ideasP.catch(() => [] as KeywordMetric[]);
    if (snapshot) persistResult(q, snapshot, ideasData);
  }

  return (
    <div className="space-y-3">
      {/* Explorer / Saved tab switch */}
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
        {([["explore", "Explorer", Search], ["saved", "Saved searches", Bookmark]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {key === "saved" && savedSearches.length > 0 && (
              <span className={cn("ml-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold", view === key ? "bg-primary-foreground/20" : "bg-secondary")}>{savedSearches.length}</span>
            )}
          </button>
        ))}
      </div>

      {view === "saved" ? (
        <SavedList
          items={savedSearches}
          openingId={openingId}
          refreshingId={refreshingId}
          onOpen={openSaved}
          onRefresh={refreshSaved}
          onDelete={deleteSaved}
          onExplore={() => setView("explore")}
        />
      ) : (
        <>
      {/* Search bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="A keyword you want to rank for, e.g. digital marketing agency"
                className="h-10 pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
              />
            </div>
            <div className="flex gap-2">
              <Combobox value={country} onChange={setCountry} options={COUNTRIES} className="w-[150px]" icon={<Globe2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />} />
              <Combobox value={language} onChange={setLanguage} options={LANGUAGES} className="w-[120px]" />
              <Combobox value={device} onChange={setDevice} options={DEVICES} className="w-[120px]" />
            </div>
            <Button className="h-10 gap-2" onClick={() => run()} disabled={loading || !query.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      <AiAdvisor
        project={project}
        country={country}
        language={language}
        saved={saved}
        savingKw={savingKw}
        onToggleSave={toggleSave}
        onSearch={(kw) => run(kw)}
      />

      {activeSaved && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Bookmark className="h-3.5 w-3.5 text-primary" />
            Saved result for <span className="font-semibold text-foreground">&ldquo;{activeSaved.term}&rdquo;</span>
            {activeSaved.at && <span className="text-muted-foreground">· saved {ago(activeSaved.at)}</span>}
          </span>
          <button onClick={() => run(activeSaved.term)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh for fresh data
          </button>
        </div>
      )}

      {loading && (
        <Card><CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {statusMsg}</CardContent></Card>
      )}
      {error && (
        <Card><CardContent className="py-6 text-center text-sm text-destructive">{error}</CardContent></Card>
      )}

      {/* Keyword ideas — volume, difficulty, CPC + opportunity scoring (DataForSEO Labs) */}
      {(ideasLoading || (ideas && ideas.length > 0)) && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="h-4 w-4" /></span>
              <div>
                <h4 className="font-heading text-sm font-semibold">Keyword ideas</h4>
                <p className="text-xs text-muted-foreground">Related keywords you could target — click any to search it</p>
              </div>
            </div>
            {ideasLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {ideas && ideas.length > 0 && (() => {
            const totalVol = ideas.reduce((s, k) => s + k.volume, 0);
            const withDiff = ideas.filter((k) => k.difficulty != null);
            const avgDiff = withDiff.length ? Math.round(withDiff.reduce((s, k) => s + (k.difficulty || 0), 0) / withDiff.length) : null;
            const isEasyWin = (k: KeywordMetric) => k.difficulty != null && k.difficulty < 35 && k.volume >= 30;
            const easyWins = ideas.filter(isEasyWin).length;
            const opp = (k: KeywordMetric) => k.volume * (100 - (k.difficulty ?? 60)) / 100;
            const sorted = [...ideas].sort((a, b) =>
              ideaSort === "volume" ? b.volume - a.volume
                : ideaSort === "difficulty" ? (a.difficulty ?? 999) - (b.difficulty ?? 999)
                : ideaSort === "cpc" ? (b.cpc ?? 0) - (a.cpc ?? 0)
                : opp(b) - opp(a),
            );
            const ideasMax = Math.max(1, ...ideas.map((x) => x.volume));
            const stats = [
              { label: "Keywords", value: String(ideas.length), icon: Search, tone: "text-foreground" },
              { label: "Volume / mo", value: fmtVol(totalVol), icon: TrendingUp, tone: "text-chart-1" },
              { label: "Avg difficulty", value: avgDiff != null ? String(avgDiff) : "—", icon: Target, tone: avgDiff != null && avgDiff < 40 ? "text-chart-2" : "text-chart-3" },
              { label: "Easy wins", value: String(easyWins), icon: Zap, tone: "text-chart-2" },
            ];
            const sortCls = (id: typeof ideaSort) => cn("cursor-pointer select-none", ideaSort === id && "text-primary");
            const arrow = (id: typeof ideaSort) => ideaSort === id && <ChevronDown className="ml-0.5 inline h-3 w-3" />;
            return (
              <>
                {/* KPI strip */}
                <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
                  {stats.map((s) => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="bg-card p-3">
                        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" />{s.label}</div>
                        <div className={cn("mt-1 text-lg font-semibold tabular-nums leading-none", s.tone)}>{s.value}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="max-h-[400px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-20 bg-card text-left text-xs uppercase text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-4 py-2 font-medium">Keyword</th>
                        <th className={cn("px-4 py-2 text-right font-medium", sortCls("volume"))} onClick={() => setIdeaSort("volume")}>Volume{arrow("volume")}</th>
                        <th className={cn("px-4 py-2 text-center font-medium", sortCls("difficulty"))} onClick={() => setIdeaSort("difficulty")}>Difficulty{arrow("difficulty")}</th>
                        <th className={cn("px-4 py-2 text-right font-medium", sortCls("cpc"))} onClick={() => setIdeaSort("cpc")}>CPC{arrow("cpc")}</th>
                        <th className={cn("px-4 py-2 text-center font-medium", sortCls("opportunity"))} onClick={() => setIdeaSort("opportunity")}>Opportunity{arrow("opportunity")}</th>
                        <th className="hidden px-4 py-2 text-center font-medium sm:table-cell">Trend</th>
                        <th className="px-3 py-2 text-center font-medium">Save</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((k, i) => {
                        const dt = diffTone(k.difficulty);
                        const easy = isEasyWin(k);
                        return (
                          <tr key={i} className={cn("border-b border-border last:border-0 hover:bg-secondary/40", easy && "bg-chart-2/[0.06]")}>
                            <td className="px-4 py-2">
                              <button onClick={() => setQuery(k.keyword)} className="flex items-center gap-1.5 text-left font-medium hover:text-primary" title="Search this keyword">
                                {easy && <Zap className="h-3.5 w-3.5 shrink-0 text-chart-2" />}
                                <span className="line-clamp-1">{k.keyword}</span>
                              </button>
                            </td>
                            <td className="px-3 py-1.5"><BarCell value={k.volume} max={ideasMax} color="chart-1" format={fmtVol} /></td>
                            <td className="px-4 py-2 text-center"><span className={cn("inline-block min-w-[2rem] rounded-md px-2 py-0.5 text-xs font-semibold", dt.cls)}>{dt.label}</span></td>
                            <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{k.cpc != null ? `$${k.cpc.toFixed(2)}` : "—"}</td>
                            <td className="px-4 py-2 text-center">
                              {easy
                                ? <span className="inline-flex items-center gap-1 rounded-md bg-chart-2/15 px-2 py-0.5 text-[11px] font-semibold text-chart-2"><Zap className="h-3 w-3" />Easy win</span>
                                : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="hidden px-4 py-2 sm:table-cell"><div className="flex justify-center"><Sparkline data={k.trend} /></div></td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => toggleSave(k)}
                                disabled={savingKw === k.keyword}
                                title={saved.has(k.keyword) ? "Saved — click to remove" : "Save this keyword"}
                                className={cn("grid h-7 w-7 place-items-center rounded-md transition-colors mx-auto", saved.has(k.keyword) ? "text-primary" : "text-muted-foreground hover:bg-secondary hover:text-primary")}
                              >
                                {savingKw === k.keyword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className={cn("h-4 w-4", saved.has(k.keyword) && "fill-primary")} />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </Card>
      )}

      {!loading && !serp && !error && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Search className="h-7 w-7" /></span>
            <h3 className="font-heading text-lg font-semibold">See who ranks for any keyword</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Type a keyword you WANT to rank for (a service or topic, not your brand name) and see the live Google results:
              who ranks top (your competitors on that keyword), whether you appear, plus AI Overview, People Also Ask and related
              searches for content ideas.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-xs text-muted-foreground">Try:</span>
              {["digital marketing agency", "seo services india", "app development company", "web design services"].map((s) => (
                <button key={s} onClick={() => { setQuery(s); }} className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary hover:text-primary">
                  {s}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {serp && (
        <>
          {/* Meta strip */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Meta
              icon={cached ? Bookmark : Server}
              label={cached ? "Source" : "Data source"}
              value={cached ? "Cached" : "Live Google"}
              tone={cached ? "bg-secondary text-muted-foreground" : "bg-chart-2/12 text-chart-2"}
              lead={!cached && <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-2 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" /></span>}
            />
            <Meta icon={Globe2} label="Total results" value={fmtNum(serp.totalResults)} sub="on Google" tone="bg-chart-1/12 text-chart-1" />
            <Meta
              icon={Zap}
              label="Response time"
              value={fmtLatency(serp.metadata.latencyMs)}
              tone={serp.metadata.latencyMs < 3000 ? "bg-chart-2/12 text-chart-2" : serp.metadata.latencyMs < 8000 ? "bg-chart-3/12 text-chart-3" : "bg-destructive/12 text-destructive"}
            />
            <Meta icon={TrendingUp} label="Organic results" value={String(serp.metadata.totalOrganic)} sub="ranked" tone="bg-primary/10 text-primary" />
          </div>

          {/* AI overview */}
          {serp.aiOverview && (
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h4 className="font-heading text-sm font-semibold">AI Overview</h4></div>
                <p className="text-sm leading-relaxed">{serp.aiOverview.content}</p>
                {serp.aiOverview.sources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {serp.aiOverview.sources.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs hover:text-primary">
                        {s.domain} <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* SERP features */}
          {serp.features.length > 0 && (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-2 p-4">
                <span className="mr-1 text-sm font-semibold">Features</span>
                {serp.features.map((f, i) => (
                  <span key={i} className="rounded-md bg-chart-3/12 px-2 py-0.5 text-xs font-medium capitalize text-chart-3">{f.type.replace(/_/g, " ")}</span>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 lg:grid-cols-3">
            {/* Organic results */}
            <div className="space-y-2 lg:col-span-2">
              <h4 className="font-heading text-sm font-semibold text-muted-foreground">
                Organic results <span className="font-normal">— who ranks for this query. Anyone above you is who to beat.</span>
              </h4>
              {serp.organic.map((o) => {
                const isMine = fmtHost(o.url) === myDomain;
                return (
                  <Card key={o.position} className={cn(isMine && "border-primary/60 ring-1 ring-primary/40")}>
                    <CardContent className="flex gap-3 p-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{o.rank}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <a href={o.url} target="_blank" rel="noreferrer" className="line-clamp-1 text-sm font-semibold text-foreground hover:text-primary">{o.title}</a>
                          {isMine && <span className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">Your site</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-chart-2">
                          <Globe2 className="h-3 w-3" /> {fmtHost(o.url)}
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", countryOf(o.url) === "Global" ? "bg-secondary text-muted-foreground" : "bg-chart-1/12 text-chart-1")}>
                            {countryOf(o.url)}
                          </span>
                        </div>
                        {o.snippet && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.snippet}</p>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* PAA + related */}
            <div className="space-y-3">
              {serp.peopleAlsoAsk.length > 0 && (
                <Card>
                  <div className="border-b border-border p-3"><h4 className="font-heading text-sm font-semibold">People also ask</h4></div>
                  <div className="divide-y divide-border">
                    {serp.peopleAlsoAsk.map((q, i) => (
                      <div key={i}>
                        <button onClick={() => setOpenPaa((o) => (o === i ? null : i))} className="flex w-full items-center gap-2 p-3 text-left hover:bg-secondary/40">
                          <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", openPaa === i && "rotate-90")} />
                          <span className="text-sm font-medium">{q.question}</span>
                        </button>
                        {openPaa === i && q.snippet && <p className="px-3 pb-3 pl-9 text-xs text-muted-foreground">{q.snippet}</p>}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              {serp.relatedSearches.length > 0 && (
                <Card>
                  <div className="border-b border-border p-3"><h4 className="font-heading text-sm font-semibold">Related searches</h4></div>
                  <div className="flex flex-wrap gap-1.5 p-3">
                    {serp.relatedSearches.map((r, i) => (
                      <button key={i} onClick={() => { setQuery(r.query); }} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary hover:text-primary">
                        <Star className="h-3 w-3" /> {r.query}
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved searches tab
// ---------------------------------------------------------------------------
function SavedList({
  items, openingId, refreshingId, onOpen, onRefresh, onDelete, onExplore,
}: {
  items: SavedSearch[];
  openingId: string | null;
  refreshingId: string | null;
  onOpen: (s: SavedSearch) => void;
  onRefresh: (s: SavedSearch) => void;
  onDelete: (e: React.MouseEvent, s: SavedSearch) => void;
  onExplore: () => void;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Bookmark className="h-7 w-7" /></span>
          <h3 className="font-heading text-lg font-semibold">No saved searches yet</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Every keyword you search in the Explorer is saved here automatically, with its full result. Reopen one anytime — it loads instantly from cache, with no extra cost. Hit refresh on any saved search to pull fresh data.
          </p>
          <Button variant="outline" className="gap-2" onClick={onExplore}><Search className="h-4 w-4" /> Go to Explorer</Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-3">
        <h4 className="font-heading text-sm font-semibold">Your saved searches</h4>
        <p className="text-xs text-muted-foreground">Open one to view its stored result instantly (no cost), or refresh for fresh data.</p>
      </div>
      <div className="divide-y divide-border">
        {items.map((s) => (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(s)}
            onKeyDown={(e) => e.key === "Enter" && onOpen(s)}
            className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/40"
          >
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", s.kind === "serp" ? "bg-chart-1/12 text-chart-1" : "bg-secondary text-muted-foreground")}>
              {openingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{s.term}</span>
                {s.keywordCount > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    <TrendingUp className="h-3 w-3" />{s.keywordCount} keywords
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {s.hasResult && s.resultAt ? <>Saved · {ago(s.resultAt)}</> : "No stored result — refresh to fetch"}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onRefresh(s); }}
              disabled={refreshingId === s.id}
              title="Fetch fresh data for this search"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
            >
              <RefreshCw className={cn("h-4 w-4", refreshingId === s.id && "animate-spin")} />
            </button>
            <button
              onClick={(e) => onDelete(e, s)}
              title="Remove from saved"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AI keyword advisor — real data (volume/difficulty/trend + striking-distance
// rankings) prioritised by AI into "what to target next" buckets.
// ---------------------------------------------------------------------------
interface AiItem { keyword: string; volume: number; difficulty: number | null; cpc: number | null; trend: "up" | "down" | "flat"; position: number | null; reason: string }
interface AiGroup { key: string; title: string; note: string; items: AiItem[] }
interface AiResp { connected: boolean; summary: string; groups: AiGroup[] }

function TrendIcon({ t }: { t: AiItem["trend"] }) {
  if (t === "up") return <span title="Search interest rising"><TrendingUp className="h-3.5 w-3.5 text-chart-2" /></span>;
  if (t === "down") return <span title="Search interest falling"><TrendingDown className="h-3.5 w-3.5 text-destructive" /></span>;
  return <span title="Stable"><Minus className="h-3.5 w-3.5 text-muted-foreground" /></span>;
}

function AiAdvisor({
  project, country, language, saved, savingKw, onToggleSave, onSearch,
}: {
  project: Project;
  country: string;
  language: string;
  saved: Map<string, string>;
  savingKw: string | null;
  onToggleSave: (k: KeywordMetric) => void;
  onSearch: (kw: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AiResp | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setOpen(true); setLoading(true); setError(""); setData(null);
    try {
      const r = await api.get<AiResp>(`/projects/${project.id}/keywords/ai-suggestions?country=${country}&language=${language}`);
      if (!r.groups?.length) setError(r.connected === false ? "Keyword data isn't connected yet, so AI suggestions aren't available." : "No suggestions yet — save a few keywords or run a search first, then try again.");
      setData(r);
    } catch {
      setError("Couldn't get suggestions right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden border-primary/30">
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Wand2 className="h-4.5 w-4.5" /></span>
          <div>
            <h4 className="font-heading text-sm font-semibold">AI keyword suggestions</h4>
            <p className="text-xs text-muted-foreground">Real volume, difficulty &amp; trends — prioritised for what will actually help you rank</p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {data ? "Refresh" : "Get suggestions"}
        </Button>
      </div>

      {open && (
        <div className="border-t border-border p-3">
          {loading && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analysing your keywords, trends and rankings…</div>}
          {!loading && error && <div className="py-4 text-center text-sm text-muted-foreground">{error}</div>}
          {!loading && data && data.groups.length > 0 && (
            <div className="space-y-4">
              {data.summary && (
                <div className="flex gap-2 rounded-lg bg-primary/5 p-3 text-sm">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-foreground">{data.summary}</p>
                </div>
              )}
              {data.groups.map((g) => (
                <div key={g.key}>
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <h5 className="text-sm font-semibold">{g.title}</h5>
                    {g.note && <span className="text-xs text-muted-foreground">— {g.note}</span>}
                  </div>
                  <div className="space-y-1.5">
                    {g.items.map((k) => {
                      const dt = diffTone(k.difficulty);
                      const isSaved = saved.has(k.keyword);
                      return (
                        <div key={k.keyword} className="flex items-start gap-2.5 rounded-lg border border-border p-2.5 transition-colors hover:bg-secondary/30">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button onClick={() => onSearch(k.keyword)} className="text-left text-sm font-medium hover:text-primary" title="Search this keyword">{k.keyword}</button>
                              <TrendIcon t={k.trend} />
                              {k.position != null && <span className="rounded-md bg-chart-2/15 px-1.5 py-0.5 text-[10px] font-semibold text-chart-2">Ranks #{k.position}</span>}
                            </div>
                            {k.reason && <p className="mt-0.5 text-xs text-muted-foreground">{k.reason}</p>}
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3" />{fmtVol(k.volume)}/mo</span>
                              <span className={cn("rounded px-1.5 py-0.5 font-semibold", dt.cls)}>KD {dt.label}</span>
                              {k.cpc != null && <span>${k.cpc.toFixed(2)} CPC</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => onToggleSave({ keyword: k.keyword, volume: k.volume, cpc: k.cpc, competition: null, competitionLevel: null, difficulty: k.difficulty, trend: [] })}
                            disabled={savingKw === k.keyword}
                            title={isSaved ? "Saved — click to remove" : "Save this keyword"}
                            className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors", isSaved ? "text-primary" : "text-muted-foreground hover:bg-secondary hover:text-primary")}
                          >
                            {savingKw === k.keyword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className={cn("h-4 w-4", isSaved && "fill-primary")} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Relative-time helper shared by the saved views.
function ago(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
