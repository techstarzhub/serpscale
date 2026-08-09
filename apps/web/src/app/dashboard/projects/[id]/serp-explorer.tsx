"use client";

import { useEffect, useState, useRef } from "react";
import {
  Search,
  MapPin,
  ChevronsUpDown,
  X,
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
  Upload,
  Download,
  FileText,
  type LucideIcon,
} from "lucide-react";
import * as XLSX from "xlsx";
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

// A DataForSEO location: country, state/region or city.
type Loc = { code: number; name: string; type: string; iso: string | null };

// Searchable country → state → city picker. Queries the backend (DataForSEO's
// ~260k locations, cached) as you type; empty query shows the country list.
function LocationPicker({ projectId, value, country, onChange }: { projectId: string; value: Loc | null; country: string; onChange: (loc: Loc) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api.get<Loc[]>(`/projects/${projectId}/keywords/locations?q=${encodeURIComponent(q)}`)
        .then((r) => { if (alive) setResults(Array.isArray(r) ? r : []); })
        .catch(() => { if (alive) setResults([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, projectId]);

  useEffect(() => { if (open) { const t = setTimeout(() => inputRef.current?.focus(), 0); return () => clearTimeout(t); } }, [open]);

  const label = value?.name ?? (COUNTRIES.find((c) => c.value === country)?.label ?? country);
  const shortLabel = label.split(",")[0];

  return (
    <div ref={ref} className="relative w-[180px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={label}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm transition-colors hover:bg-secondary/40"
      >
        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">{shortLabel}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="relative border-b border-border">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search country, state or city…"
              className="h-9 w-full bg-transparent pl-8 pr-3 text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {/* Worldwide — the global database (no specific country). */}
            {"worldwide".includes(q.trim().toLowerCase()) && (
              <button
                type="button"
                onClick={() => { onChange({ code: 0, name: "Worldwide", type: "Worldwide", iso: "WW" }); setOpen(false); }}
                className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-secondary/60", value?.code === 0 && "bg-secondary")}
              >
                <Globe2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">Worldwide</span>
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Global</span>
              </button>
            )}
            {loading ? (
              <p className="px-3 py-5 text-center text-xs text-muted-foreground">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-5 text-center text-xs text-muted-foreground">No locations found</p>
            ) : (
              results.map((loc) => {
                const parts = loc.name.split(",");
                return (
                  <button
                    key={loc.code}
                    type="button"
                    onClick={() => { onChange(loc); setOpen(false); }}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-secondary/60", value?.code === loc.code && "bg-secondary")}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{parts[0]}</span>
                      {parts.length > 1 && <span className="text-muted-foreground">, {parts.slice(1).join(", ")}</span>}
                    </span>
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{loc.type}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// "Top markets for this keyword" — country-level Google-Trends interest (0–100).
// Country-only by design: deeper (state/city) Trends data only exists for a few
// high-volume keywords, so precise per-place numbers come from the location filter
// (real search volume) instead.
type GeoItem = { name: string; value: number; code: number | null };
function GeoBreakdownModal({ projectId, keyword, location, onClose }: { projectId: string; keyword: string; location: Loc | null; onClose: () => void }) {
  const [items, setItems] = useState<GeoItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(15); // grows as the user scrolls

  // Scope to the location chosen in the dropdown: a country → its states, a state
  // → its cities, else (Worldwide/none) → countries. code 0 = Worldwide.
  const scopeCode = location && location.code > 0 ? location.code : undefined;
  const scopeName = scopeCode ? location!.name.split(",")[0] : null;
  const t = location?.type;
  const level = t === "Country" ? "state / region" : (t === "State" || t === "Region" || t === "Province" || t === "Union Territory" || t === "Territory") ? "city" : "country";

  useEffect(() => {
    let alive = true;
    setLoading(true); setItems(null); setVisible(15);
    const locQ = scopeCode ? `&location=${scopeCode}` : "";
    api.get<{ items: GeoItem[] }>(`/projects/${projectId}/keywords/geo?keyword=${encodeURIComponent(keyword)}${locQ}`)
      .then((r) => { if (alive) setItems(Array.isArray(r?.items) ? r.items : []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, keyword, scopeCode]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) setVisible((v) => v + 15);
  };
  const max = Math.max(1, ...(items ?? []).map((i) => i.value));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Globe2 className="h-4 w-4 text-primary" /> {scopeName ? `Demand across ${scopeName}` : "Top markets for this keyword"}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">&ldquo;{keyword}&rdquo; — by {level} · 100 = the #1, others relative (interest, not volume)</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-3" onScroll={onScroll}>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-secondary" />)}</div>
          ) : !items?.length ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              {scopeName ? `Google Trends has no ${level}-level breakdown for “${keyword}” in ${scopeName} — it only has this for high-volume keywords.` : "No demand data for this keyword."}
            </p>
          ) : (
            <div className="space-y-1">
              {items.slice(0, visible).map((it, idx) => {
                const pct = Math.round((it.value / max) * 100);
                return (
                  <div key={it.name} className="relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2">
                    <div className="absolute inset-y-1 left-0 rounded-md bg-primary/[0.12]" style={{ width: `${Math.max(5, pct)}%` }} />
                    <span className="relative z-10 w-5 shrink-0 text-xs font-semibold text-muted-foreground">{idx + 1}</span>
                    <span className="relative z-10 min-w-0 flex-1 truncate text-sm font-medium">{it.name.split(",")[0]}</span>
                    <span className="relative z-10 shrink-0 text-sm font-bold tabular-nums">{it.value}<span className="text-[10px] font-normal text-muted-foreground">/100</span></span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Google Trends relative interest{scopeName ? ` inside ${scopeName}` : ""} — where demand is highest. For exact search volume, the keyword numbers above already use your selected location.
        </div>
      </div>
    </div>
  );
}

// ---- Bulk import: upload a keyword list (CSV/Excel/Word/PDF) or paste one, then
// fetch real volume + competition for every keyword at once (server parses the file). --
function ImportKeywordsModal({
  projectId, country, language, location, onClose, onDone,
}: {
  projectId: string;
  country: string;
  language: string;
  location: Loc | null;
  onClose: () => void;
  onDone: (keywords: KeywordMetric[], requested: number) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scope = location && location.code > 0 ? location.name.split(",")[0] : "Worldwide";

  async function submit() {
    setError("");
    if (!file && !text.trim()) { setError("Pick a file or paste some keywords first."); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      else fd.append("text", text);
      fd.append("country", country);
      fd.append("language", language);
      if (location && location.code > 0) fd.append("location", String(location.code));
      const res = await api.upload<{ connected: boolean; keywords: KeywordMetric[]; requested: number }>(
        `/projects/${projectId}/keywords/import`, fd,
      );
      if (!res?.keywords?.length) { setError("No keywords with data were found. Check the file and try again."); setLoading(false); return; }
      onDone(res.keywords, res.requested ?? res.keywords.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed. Try a CSV, Excel, Word or PDF file.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Upload className="h-4 w-4 text-primary" /> Import keywords</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Upload a list — we&apos;ll fetch real volume &amp; competition for <span className="font-medium text-foreground">{scope}</span>.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 p-4">
          {/* Dropzone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setText(""); } }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
              drag ? "border-primary bg-primary/[0.04]" : "border-border hover:border-primary/40 hover:bg-secondary/40",
            )}
          >
            {file ? (
              <>
                <FileText className="h-6 w-6 text-primary" />
                <p className="text-sm font-medium">{file.name}</p>
                <button className="text-xs text-muted-foreground hover:text-destructive hover:underline" onClick={(e) => { e.stopPropagation(); setFile(null); if (inputRef.current) inputRef.current.value = ""; }}>Remove</button>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">Drop a file or click to browse</p>
                {/* Explicit format chips so it's obvious all four are supported. */}
                <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                  {["CSV", "Excel", "Word", "PDF"].map((f) => (
                    <span key={f} className="rounded-md border border-border bg-secondary/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{f}</span>
                  ))}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">.csv · .xlsx · .docx · .pdf — up to 300 keywords</p>
              </>
            )}
            {/* Extension-only accept: native file dialogs grey out files when long
                MIME types are mixed in, so keep it to extensions for reliability. */}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.docx,.doc,.pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) setText(""); }}
            />
          </div>

          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or paste <span className="h-px flex-1 bg-border" />
          </div>

          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) setFile(null); }}
            placeholder={"One keyword per line, e.g.\nseo services\ndigital marketing agency\nppc management"}
            rows={4}
            disabled={!!file}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/50 disabled:opacity-50"
          />

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button className="gap-2" onClick={submit} disabled={loading || (!file && !text.trim())}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            {loading ? "Analysing…" : "Get volume & competition"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- Export the current keyword table to CSV, Excel, PDF report or Word. ----
// Heavy report libs (jspdf / docx) are dynamically imported inside the handlers
// so they only load when the user actually exports — the page stays light.
function ExportMenu({ keywords, location, projectName, domain }: { keywords: KeywordMetric[]; location: Loc | null; projectName?: string; domain?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const scopeLabel = location && location.code > 0 ? location.name.split(",")[0] : "Worldwide";
  const scope = scopeLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const totalVol = keywords.reduce((s, k) => s + (k.volume || 0), 0);
  const withDiff = keywords.filter((k) => k.difficulty != null);
  const avgDiff = withDiff.length ? Math.round(withDiff.reduce((s, k) => s + (k.difficulty || 0), 0) / withDiff.length) : null;
  const brand = projectName || domain || "SerpScale";
  const num = (n: number) => n.toLocaleString("en-US");
  const cpc = (v: number | null) => (v != null ? `$${v.toFixed(2)}` : "—");
  const summary = `${keywords.length} keywords · ${num(totalVol)}/mo total volume${avgDiff != null ? ` · avg difficulty ${avgDiff}` : ""}`;
  const meta = `${brand}  ·  ${scopeLabel}  ·  ${dateStr}`;
  const rows = keywords.map((k) => ({
    Keyword: k.keyword,
    "Volume/mo": k.volume,
    Difficulty: k.difficulty ?? "",
    Competition: k.competitionLevel ?? "",
    "CPC (USD)": k.cpc ?? "",
  }));

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setOpen(false);
  }
  function exportCsv() {
    const headers = Object.keys(rows[0]);
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(","))].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `keywords-${scope}.csv`);
  }
  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 38 }, { wch: 11 }, { wch: 10 }, { wch: 12 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Keywords");
    XLSX.writeFile(wb, `keywords-${scope}.xlsx`);
    setOpen(false);
  }
  async function exportPdf() {
    setBusy("pdf");
    try {
      const { default: JsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new JsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const m = 40;
      doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(17, 24, 39);
      doc.text("Keyword Report", m, 50);
      doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(120, 120, 120);
      doc.text(meta, m, 68);
      doc.text(summary, m, 82);
      autoTable(doc, {
        startY: 96,
        head: [["#", "Keyword", "Volume/mo", "Difficulty", "Competition", "CPC"]],
        body: keywords.map((k, i) => [String(i + 1), k.keyword, num(k.volume), k.difficulty != null ? String(k.difficulty) : "—", k.competitionLevel ?? "—", cpc(k.cpc)]),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: { 0: { cellWidth: 26, halign: "center" }, 2: { halign: "right" }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "right" } },
        margin: { left: m, right: m },
      });
      doc.save(`keywords-${scope}.pdf`);
      setOpen(false);
    } finally { setBusy(null); }
  }
  async function exportDocx() {
    setBusy("docx");
    try {
      const d = await import("docx");
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = d;
      const head = ["#", "Keyword", "Volume/mo", "Difficulty", "Competition", "CPC"];
      const cell = (text: string, opts?: { bold?: boolean; color?: string; fill?: string }) =>
        new TableCell({ shading: opts?.fill ? { fill: opts.fill } : undefined, children: [new Paragraph({ children: [new TextRun({ text, bold: opts?.bold, color: opts?.color })] })] });
      const headRow = new TableRow({ tableHeader: true, children: head.map((h) => cell(h, { bold: true, color: "FFFFFF", fill: "2563EB" })) });
      const bodyRows = keywords.map((k, i) => new TableRow({ children: [
        cell(String(i + 1)), cell(k.keyword), cell(num(k.volume)),
        cell(k.difficulty != null ? String(k.difficulty) : "—"), cell(k.competitionLevel ?? "—"), cell(cpc(k.cpc)),
      ] }));
      const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headRow, ...bodyRows] });
      const doc = new Document({ sections: [{ children: [
        new Paragraph({ text: "Keyword Report", heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: meta, color: "777777" })] }),
        new Paragraph({ children: [new TextRun({ text: summary, color: "777777" })] }),
        new Paragraph({ text: "" }),
        table,
      ] }] });
      downloadBlob(await Packer.toBlob(doc), `keywords-${scope}.docx`);
    } finally { setBusy(null); }
  }

  const item = (onClick: () => void, icon: React.ReactNode, label: string, key: string) => (
    <button onClick={onClick} disabled={!!busy} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-secondary/60 disabled:opacity-50">
      {busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : icon} {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setOpen((v) => !v)}>
        <Download className="h-3.5 w-3.5" /> Export
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </Button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg">
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Data</p>
          {item(exportCsv, <FileText className="h-4 w-4 text-muted-foreground" />, "CSV (.csv)", "csv")}
          {item(exportXlsx, <FileText className="h-4 w-4 text-chart-2" />, "Excel (.xlsx)", "xlsx")}
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Report</p>
          {item(exportPdf, <FileText className="h-4 w-4 text-destructive" />, "PDF report", "pdf")}
          {item(exportDocx, <FileText className="h-4 w-4 text-primary" />, "Word (.docx)", "docx")}
        </div>
      )}
    </div>
  );
}

export function SerpExplorer({ project }: { project: Project }) {
  const myDomain = project.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("US");
  // Precise location (country / state / city) from DataForSEO. Drives keyword
  // research; null = use the plain country above. Keeps `country` (ISO) in sync
  // for the live SERP search + saved-search history.
  const [location, setLocation] = useState<Loc | null>(null);
  // The keyword whose geo (country/state/city) demand breakdown is open, if any.
  const [geoKeyword, setGeoKeyword] = useState<string | null>(null);
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
  // Bulk import (CSV/Excel/Word/PDF → volume+competition) modal + last-import note.
  const [importOpen, setImportOpen] = useState(false);
  const [imported, setImported] = useState<{ shown: number; requested: number } | null>(null);
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
      // code 0 = Worldwide → send no location (backend uses the global database).
      const locQ = location && location.code ? `&location=${location.code}` : "";
      const r = await api.get<IdeasResp>(`/projects/${project.id}/keywords?seed=${encodeURIComponent(seed)}&country=${country}&language=${language}${locQ}`);
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
    setView("explore"); setActiveSaved(null); setImported(null);
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
              <LocationPicker projectId={project.id} value={location} country={country} onChange={(loc) => { setLocation(loc); setCountry(loc.iso ?? "US"); }} />
              <Combobox value={language} onChange={setLanguage} options={LANGUAGES} className="w-[120px]" />
              <Combobox value={device} onChange={setDevice} options={DEVICES} className="w-[120px]" />
            </div>
            <Button className="h-10 gap-2" onClick={() => run()} disabled={loading || !query.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={() => setImportOpen(true)} title="Import a keyword list (CSV, Excel, Word or PDF) and get volume + competition for each">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import</span>
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Tip: <button className="font-medium text-primary hover:underline" onClick={() => setImportOpen(true)}>Import a list</button> from CSV, Excel, Word or PDF to bulk-check volume &amp; competition for {location && location.code > 0 ? location.name.split(",")[0] : "your market"}.
          </p>
        </CardContent>
      </Card>

      {importOpen && (
        <ImportKeywordsModal
          projectId={project.id}
          country={country}
          language={language}
          location={location}
          onClose={() => setImportOpen(false)}
          onDone={(kws, requested) => {
            setSerp(null); setError(""); setActiveSaved(null);
            setIdeas(kws);
            setImported({ shown: kws.length, requested });
            setImportOpen(false);
          }}
        />
      )}

      {geoKeyword && <GeoBreakdownModal projectId={project.id} keyword={geoKeyword} location={location} onClose={() => setGeoKeyword(null)} />}

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
          <div className="flex items-center justify-between gap-2 border-b border-border p-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="h-4 w-4" /></span>
              <div className="min-w-0">
                <h4 className="font-heading text-sm font-semibold">{imported ? "Imported keywords" : "Keyword ideas"}</h4>
                <p className="truncate text-xs text-muted-foreground">
                  {imported
                    ? `${imported.shown} of ${imported.requested} keywords with real volume${location && location.code > 0 ? ` in ${location.name.split(",")[0]}` : ""} — sorted by volume`
                    : "Related keywords you could target — click any to search it"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {ideasLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {ideas && ideas.length > 0 && (
                <ExportMenu keywords={ideas} location={location} projectName={project.name} domain={myDomain} />
              )}
            </div>
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
                              <div className="flex items-center gap-1">
                                <button onClick={() => setQuery(k.keyword)} className="flex min-w-0 items-center gap-1.5 text-left font-medium hover:text-primary" title="Search this keyword">
                                  {easy && <Zap className="h-3.5 w-3.5 shrink-0 text-chart-2" />}
                                  <span className="line-clamp-1">{k.keyword}</span>
                                </button>
                                <button
                                  onClick={() => setGeoKeyword(k.keyword)}
                                  onMouseEnter={() => { void api.get(`/projects/${project.id}/keywords/geo?keyword=${encodeURIComponent(k.keyword)}${location && location.code > 0 ? `&location=${location.code}` : ""}`).catch(() => {}); }}
                                  title={location && location.code > 0 ? `Where in ${location.name.split(",")[0]} is this searched?` : "Which countries search this most?"}
                                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                                >
                                  <Globe2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
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
