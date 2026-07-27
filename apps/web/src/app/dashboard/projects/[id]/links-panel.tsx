"use client";

import { useState } from "react";
import { Link2, Unlink, AlertOctagon, GitBranch, ChevronRight, ArrowRight, ExternalLink, Map } from "lucide-react";
import { cn } from "@/lib/utils";

// Reliable CSS horizontal-bar rows (label + proportional bar + value).
function BarRows({ rows, color = "chart-1" }: { rows: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-40 shrink-0 truncate text-xs text-muted-foreground" title={r.label}>{r.label}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-secondary/50">
            <div className="h-full rounded" style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, background: `hsl(var(--${color}))` }} />
          </div>
          <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums">{r.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function SubCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h5 className="font-heading text-sm font-semibold">{title}</h5>
      {subtitle && <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>}
      {children}
    </div>
  );
}

interface LinkRef {
  url: string;
  inlinks: number;
  title: string | null;
}
export interface AiReadiness {
  score: number;
  grade: string;
  factors: { key: string; label: string; score: number; weight: number; detail: string }[];
}
export interface AccessibilityData {
  pagesAudited: number;
  totals: { critical: number; serious: number; moderate: number; minor: number };
  byRule: { id: string; impact: string; help: string; helpUrl: string; nodes: number; pages: string[] }[];
  perPage: { url: string; critical: number; serious: number; moderate: number; minor: number }[];
}
export interface CannibalCluster {
  keywords: string[];
  pages: { url: string; title: string | null }[];
}
export interface LinkGraph {
  totals: { pages: number; internalLinks: number; avgInlinks: number; orphans: number; broken: number; maxDepth: number };
  topLinked: LinkRef[];
  leastLinked: LinkRef[];
  orphans: { url: string; depth: number }[];
  broken: { url: string; statusCode: number | null; referrers: string[] }[];
  depthDist: Record<string, number>;
  nodes?: { url: string; path: string; depth: number; status: number | null; inlinks: number }[];
  // Newer analyzers (present on recent crawls only).
  brokenExternal?: { url: string; statusCode: number | null; referrers: string[] }[];
  brokenImages?: { url: string; statusCode: number | null; referrers: string[] }[];
  externalChecked?: number;
  externalTotal?: number;
  sitemapAudit?: { sitemapUrlCount: number; blocked: string[]; broken: string[]; noindexInSitemap?: string[] };
  cannibalization?: CannibalCluster[];
  duplicateContent?: { urls: string[] }[];
  accessibility?: AccessibilityData;
  aiReadiness?: AiReadiness;
}

function shortUrl(u: string) {
  try {
    const url = new URL(u);
    return url.pathname === "/" ? url.hostname : url.pathname;
  } catch {
    return u;
  }
}

function Kpi({ label, value, tone, icon: Icon }: { label: string; value: number | string; tone?: string; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", tone ?? "text-muted-foreground")} />
      </div>
      <div className={cn("mt-1.5 text-xl font-semibold leading-none", tone)}>{value}</div>
    </div>
  );
}

export function LinksPanel({ linkGraph }: { linkGraph: LinkGraph | null }) {
  const [openBroken, setOpenBroken] = useState<string | null>(null);
  const [openExt, setOpenExt] = useState<string | null>(null);
  const [openImg, setOpenImg] = useState<string | null>(null);
  if (!linkGraph) return null;
  const t = linkGraph.totals;
  const ext = linkGraph.brokenExternal ?? [];
  const img = linkGraph.brokenImages ?? [];
  const sm = linkGraph.sitemapAudit;

  const depthRows = Object.entries(linkGraph.depthDist)
    .map(([d, n]) => ({ d: Number(d), label: d === "0" ? "Home" : `Depth ${d}`, value: n }))
    .sort((a, b) => a.d - b.d)
    .map(({ label, value }) => ({ label, value }));
  const topRows = linkGraph.topLinked.slice(0, 10).map((p) => ({ label: shortUrl(p.url), value: p.inlinks }));

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Link2 className="h-4 w-4" /></span>
        <div>
          <h4 className="font-heading text-sm font-semibold">Internal linking</h4>
          <p className="text-xs text-muted-foreground">How link authority flows through your site</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Internal links" value={t.internalLinks.toLocaleString()} icon={Link2} />
        <Kpi label="Avg. links / page" value={t.avgInlinks} icon={GitBranch} />
        <Kpi label="Orphan pages" value={t.orphans} tone={t.orphans > 0 ? "text-chart-3" : "text-chart-2"} icon={Unlink} />
        <Kpi label="Broken links" value={t.broken} tone={t.broken > 0 ? "text-destructive" : "text-chart-2"} icon={AlertOctagon} />
        <Kpi label="Max click depth" value={t.maxDepth} icon={GitBranch} />
      </div>

      {/* Top linked + depth distribution */}
      <div className="grid gap-3 border-t border-border p-4 lg:grid-cols-2">
        <SubCard title="Most-linked pages" subtitle="Internal links pointing in">
          {topRows.length > 0 ? <BarRows rows={topRows} color="chart-1" /> : <p className="py-6 text-center text-sm text-muted-foreground">No data.</p>}
        </SubCard>
        <SubCard title="Crawl depth distribution" subtitle="Pages by clicks from the homepage">
          {depthRows.length > 0 ? <BarRows rows={depthRows} color="chart-4" /> : <p className="py-6 text-center text-sm text-muted-foreground">No data.</p>}
        </SubCard>
      </div>

      {/* Broken internal links */}
      {linkGraph.broken.length > 0 && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-4 py-3">
            <AlertOctagon className="h-4 w-4 text-destructive" />
            <h5 className="text-sm font-semibold">Broken internal links</h5>
            <span className="rounded-md bg-destructive/12 px-2 py-0.5 text-xs font-semibold text-destructive">{linkGraph.broken.length}</span>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {linkGraph.broken.map((b) => (
              <div key={b.url}>
                <button
                  onClick={() => setOpenBroken((o) => (o === b.url ? null : b.url))}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-secondary/40"
                >
                  <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", openBroken === b.url && "rotate-90")} />
                  <span className="rounded bg-destructive/12 px-1.5 py-0.5 text-xs font-semibold text-destructive">{b.statusCode ?? "ERR"}</span>
                  <span className="min-w-0 flex-1 truncate text-sm" title={b.url}>{shortUrl(b.url)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{b.referrers.length} referrer{b.referrers.length !== 1 ? "s" : ""}</span>
                </button>
                {openBroken === b.url && (
                  <div className="space-y-1 bg-secondary/20 px-4 py-2 pl-10">
                    <p className="text-xs font-medium text-muted-foreground">Linked from:</p>
                    {b.referrers.map((r) => (
                      <div key={r} className="flex items-center gap-1.5 text-xs">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <a href={r} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline" title={r}>{shortUrl(r)}</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orphan pages */}
      {linkGraph.orphans.length > 0 && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-4 py-3">
            <Unlink className="h-4 w-4 text-chart-3" />
            <h5 className="text-sm font-semibold">Orphan pages</h5>
            <span className="rounded-md bg-chart-3/15 px-2 py-0.5 text-xs font-semibold text-chart-3">{linkGraph.orphans.length}</span>
            <span className="text-xs text-muted-foreground">— reachable but nothing links to them</span>
          </div>
          <div className="max-h-72 divide-y divide-border overflow-y-auto border-t border-border">
            {linkGraph.orphans.map((o) => (
              <div key={o.url} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">depth {o.depth}</span>
                <a href={o.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary hover:underline" title={o.url}>{shortUrl(o.url)}</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Broken external (outbound) links */}
      {ext.length > 0 && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-4 py-3">
            <ExternalLink className="h-4 w-4 text-destructive" />
            <h5 className="text-sm font-semibold">Broken outbound links</h5>
            <span className="rounded-md bg-destructive/12 px-2 py-0.5 text-xs font-semibold text-destructive">{ext.length}</span>
            <span className="text-xs text-muted-foreground">
              — dead external URLs your pages point to
              {typeof linkGraph.externalChecked === "number" ? ` · ${linkGraph.externalChecked} checked` : ""}
            </span>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {ext.map((b) => (
              <div key={b.url}>
                <button
                  onClick={() => setOpenExt((o) => (o === b.url ? null : b.url))}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-secondary/40"
                >
                  <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", openExt === b.url && "rotate-90")} />
                  <span className="rounded bg-destructive/12 px-1.5 py-0.5 text-xs font-semibold text-destructive">{b.statusCode ?? "DEAD"}</span>
                  <span className="min-w-0 flex-1 truncate text-sm" title={b.url}>{b.url}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{b.referrers.length} page{b.referrers.length !== 1 ? "s" : ""}</span>
                </button>
                {openExt === b.url && (
                  <div className="space-y-1 bg-secondary/20 px-4 py-2 pl-10">
                    <p className="text-xs font-medium text-muted-foreground">Linked from:</p>
                    {b.referrers.map((r) => (
                      <div key={r} className="flex items-center gap-1.5 text-xs">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <a href={r} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline" title={r}>{shortUrl(r)}</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Broken images (embedded but dead) */}
      {img.length > 0 && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-4 py-3">
            <AlertOctagon className="h-4 w-4 text-destructive" />
            <h5 className="text-sm font-semibold">Broken images</h5>
            <span className="rounded-md bg-destructive/12 px-2 py-0.5 text-xs font-semibold text-destructive">{img.length}</span>
            <span className="text-xs text-muted-foreground">— images that fail to load</span>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {img.map((b) => (
              <div key={b.url}>
                <button onClick={() => setOpenImg((o) => (o === b.url ? null : b.url))} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-secondary/40">
                  <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", openImg === b.url && "rotate-90")} />
                  <span className="rounded bg-destructive/12 px-1.5 py-0.5 text-xs font-semibold text-destructive">{b.statusCode ?? "DEAD"}</span>
                  <span className="min-w-0 flex-1 truncate text-sm" title={b.url}>{b.url}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{b.referrers.length} page{b.referrers.length !== 1 ? "s" : ""}</span>
                </button>
                {openImg === b.url && (
                  <div className="space-y-1 bg-secondary/20 px-4 py-2 pl-10">
                    <p className="text-xs font-medium text-muted-foreground">Used on:</p>
                    {b.referrers.map((r) => (
                      <div key={r} className="flex items-center gap-1.5 text-xs">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <a href={r} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline" title={r}>{shortUrl(r)}</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sitemap status + contradictions (always shown) */}
      {sm && (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <Map className="h-4 w-4 text-chart-3" />
            <h5 className="text-sm font-semibold">Sitemap</h5>
            {sm.sitemapUrlCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-chart-2/12 px-2 py-0.5 text-xs font-medium text-chart-2">Found · {sm.sitemapUrlCount} URL{sm.sitemapUrlCount !== 1 ? "s" : ""}</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-destructive/12 px-2 py-0.5 text-xs font-medium text-destructive">Not set up — search engines may miss pages</span>
            )}
          </div>
          {(sm.blocked.length > 0 || sm.broken.length > 0 || (sm.noindexInSitemap?.length ?? 0) > 0) ? (
          <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2">
            {sm.blocked.length > 0 && (
              <SubCard title={`Blocked by robots.txt (${sm.blocked.length})`} subtitle="In the sitemap but disallowed — contradictory signals">
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {sm.blocked.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline" title={u}>{shortUrl(u)}</a>
                  ))}
                </div>
              </SubCard>
            )}
            {sm.broken.length > 0 && (
              <SubCard title={`Broken sitemap URLs (${sm.broken.length})`} subtitle="Listed in the sitemap but return 4xx/5xx">
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {sm.broken.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline" title={u}>{shortUrl(u)}</a>
                  ))}
                </div>
              </SubCard>
            )}
            {(sm.noindexInSitemap?.length ?? 0) > 0 && (
              <SubCard title={`Noindex pages in sitemap (${sm.noindexInSitemap!.length})`} subtitle="Sitemap lists pages set to noindex — contradictory signals">
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {sm.noindexInSitemap!.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline" title={u}>{shortUrl(u)}</a>
                  ))}
                </div>
              </SubCard>
            )}
          </div>
          ) : (
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              {sm.sitemapUrlCount > 0 ? "No sitemap contradictions found — looks healthy." : "Add an XML sitemap and declare it in robots.txt so every page is discoverable."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
