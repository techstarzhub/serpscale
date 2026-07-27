"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MousePointerClick,
  Eye,
  Percent,
  Gauge,
  Search,
  Plug,
  ArrowUpDown,
  FileText,
  Globe2,
  Monitor,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Project } from "@/components/providers/projects-provider";
import { TrendChart, ChartCard } from "@/components/ui/charts";
import { BarCell } from "@/components/ui/metric";

interface GscRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}
interface GscData {
  connected: boolean;
  matched: boolean;
  sites?: string[];
  siteUrl?: string;
  accountEmail?: string;
  totals?: { clicks: number; impressions: number; ctr: number; position: number };
  queries?: GscRow[];
  pages?: GscRow[];
  countries?: GscRow[];
  devices?: GscRow[];
  trend?: { date: string; clicks: number; impressions: number }[];
  days?: number;
}

type Dim = "queries" | "pages" | "countries" | "devices";

const DAY_OPTS = [7, 28, 90];
const DIMS: { key: Dim; label: string; col: string; icon: LucideIcon }[] = [
  { key: "queries", label: "Queries", col: "Query", icon: Tag },
  { key: "pages", label: "Pages", col: "Page", icon: FileText },
  { key: "countries", label: "Countries", col: "Country", icon: Globe2 },
  { key: "devices", label: "Devices", col: "Device", icon: Monitor },
];

// GSC-style position buckets.
const POS_BUCKETS = [
  { key: "all", label: "All positions", test: () => true },
  { key: "1-3", label: "Top 3", test: (p: number) => p <= 3 },
  { key: "4-10", label: "4 – 10", test: (p: number) => p > 3 && p <= 10 },
  { key: "11-20", label: "11 – 20", test: (p: number) => p > 10 && p <= 20 },
  { key: "21-50", label: "21 – 50", test: (p: number) => p > 20 && p <= 50 },
  { key: "50+", label: "50+", test: (p: number) => p > 50 },
] as const;

const REGION = typeof Intl !== "undefined" && (Intl as any).DisplayNames ? new (Intl as any).DisplayNames(["en"], { type: "region" }) : null;
function countryName(code: string) {
  const cc = (code || "").toUpperCase();
  if (cc.length === 3 && REGION) {
    // GSC uses ISO-3166-alpha-3; DisplayNames wants alpha-2, so fall back to the raw code.
    return ISO3_TO_2[cc] ? REGION.of(ISO3_TO_2[cc]) || cc : cc;
  }
  return cc || "(unknown)";
}
// Minimal alpha3→alpha2 for common markets; unmatched codes show as-is.
const ISO3_TO_2: Record<string, string> = {
  USA: "US", IND: "IN", GBR: "GB", CAN: "CA", AUS: "AU", DEU: "DE", FRA: "FR", ESP: "ES", ITA: "IT",
  NLD: "NL", BRA: "BR", MEX: "MX", ARE: "AE", SAU: "SA", PAK: "PK", BGD: "BD", SGP: "SG", ZAF: "ZA",
  JPN: "JP", CHN: "CN", RUS: "RU", IDN: "ID", PHL: "PH", NGA: "NG", TUR: "TR", POL: "PL", SWE: "SE",
};

function fmtGscDate(iso: string) {
  if (!iso) return iso;
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, m, d] = iso.split("-");
  return `${mo[Number(m) - 1]} ${Number(d)}`;
}

function KpiCard({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-2.5 text-xl font-semibold leading-none">{value}</div>
      </CardContent>
    </Card>
  );
}

function PosBadge({ pos }: { pos: number }) {
  const p = Math.round(pos * 10) / 10;
  const tone = p <= 3 ? "bg-chart-2/12 text-chart-2" : p <= 10 ? "bg-chart-3/15 text-chart-3" : "bg-secondary text-muted-foreground";
  return <span className={cn("inline-flex h-6 min-w-10 items-center justify-center rounded-md px-1.5 text-xs font-semibold", tone)}>{p}</span>;
}

export function GscRankTracker({ project, refreshNonce = 0 }: { project: Project; refreshNonce?: number }) {
  const [data, setData] = useState<GscData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(28);
  const [dim, setDim] = useState<Dim>("queries");
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<(typeof POS_BUCKETS)[number]["key"]>("all");
  const [sort, setSort] = useState<keyof GscRow>("clicks");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<GscData>(`/projects/${project.id}/gsc?days=${days}${refreshNonce ? "&fresh=1" : ""}`));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [project.id, days, refreshNonce]);

  useEffect(() => {
    load();
  }, [load]);

  const label = (r: GscRow) => (dim === "countries" ? countryName(r.key) : dim === "devices" ? r.key.toLowerCase() : r.key);

  const rows = useMemo(() => {
    let r = (data?.[dim] as GscRow[] | undefined) ?? [];
    const bk = POS_BUCKETS.find((b) => b.key === bucket) ?? POS_BUCKETS[0];
    r = r.filter((x) => bk.test(x.position));
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      r = r.filter((x) => label(x).toLowerCase().includes(needle));
    }
    return [...r].sort((a, b) => (sort === "position" ? Number(a[sort]) - Number(b[sort]) : Number(b[sort]) - Number(a[sort])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dim, q, sort, bucket]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-2.5 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Plug className="h-7 w-7" /></span>
          <div className="space-y-1">
            <h3 className="font-heading text-base font-semibold">Connect Google Search Console</h3>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Connect your Google account to pull real keyword rankings, clicks, and impressions.
            </p>
          </div>
          <Link href="/dashboard/settings/integrations" className={cn(buttonVariants(), "gap-2")}>
            <Plug className="h-4 w-4" /> Connect Google
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (!data.matched) {
    return (
      <Card>
        <CardContent className="space-y-3 py-10 text-center">
          <h3 className="font-heading text-base font-semibold">No matching Search Console property</h3>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Your Google account is connected, but no property matches <b>{project.domain}</b>. Make sure the site is verified in Search Console.
          </p>
          {data.sites && data.sites.length > 0 && (
            <p className="text-xs text-muted-foreground">Available: {data.sites.join(", ")}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const t = data.totals ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const activeDim = DIMS.find((d) => d.key === dim) ?? DIMS[0];

  const clkMax = Math.max(1, ...rows.map((r) => r.clicks));
  const imprMax = Math.max(1, ...rows.map((r) => r.impressions));

  return (
    <div className="space-y-3">
      {/* property + date range */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Search Console · <span className="font-medium text-foreground">{data.siteUrl}</span>
          {data.accountEmail ? ` · ${data.accountEmail}` : ""}
        </p>
        <div className="inline-flex gap-1 rounded-lg border border-border bg-secondary/50 p-0.5">
          {DAY_OPTS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                days === d ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={`Clicks (${days}d)`} value={t.clicks.toLocaleString()} icon={MousePointerClick} />
        <KpiCard label={`Impressions (${days}d)`} value={t.impressions.toLocaleString()} icon={Eye} />
        <KpiCard label="Avg. CTR" value={`${(t.ctr * 100).toFixed(1)}%`} icon={Percent} />
        <KpiCard label="Avg. position" value={t.position.toFixed(1)} icon={Gauge} />
      </div>

      {(data.trend?.length ?? 0) > 1 && (
        <ChartCard title="Clicks & impressions" subtitle={`Search performance · last ${days} days`}>
          <TrendChart
            data={data.trend!}
            xKey="date"
            xTickFormatter={fmtGscDate}
            labelFormatter={fmtGscDate}
            series={[
              { key: "clicks", name: "Clicks", color: "chart-1" },
              { key: "impressions", name: "Impressions", color: "chart-3" },
            ]}
            height={260}
          />
        </ChartCard>
      )}

      <Card>
        {/* dimension tabs */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
          {DIMS.map((d) => {
            const Icon = d.icon;
            const active = d.key === dim;
            return (
              <button
                key={d.key}
                onClick={() => { setDim(d.key); setSort("clicks"); }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-secondary font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" /> {d.label}
              </button>
            );
          })}
        </div>

        {/* filter bar */}
        <div className="flex flex-col gap-2.5 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {POS_BUCKETS.map((b) => (
              <button
                key={b.key}
                onClick={() => setBucket(b.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  bucket === b.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={`Filter ${activeDim.label.toLowerCase()}...`} className="h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {/* table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{activeDim.col}</th>
                {(["position", "clicks", "impressions", "ctr"] as const).map((c) => (
                  <th key={c} className="px-4 py-2.5">
                    <button onClick={() => setSort(c)} className={cn("inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide", sort === c ? "text-foreground" : "text-muted-foreground")}>
                      {c === "ctr" ? "CTR" : c}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No {activeDim.label.toLowerCase()} match these filters.</td></tr>
              ) : (
                rows.slice(0, 250).map((r) => (
                  <tr key={r.key} className="border-b border-border last:border-0 transition-colors hover:bg-secondary/50">
                    <td className="max-w-[360px] truncate px-4 py-2.5 font-medium" title={label(r)}>
                      <span className={cn(dim === "devices" && "capitalize")}>{label(r)}</span>
                    </td>
                    <td className="px-4 py-2.5"><PosBadge pos={r.position} /></td>
                    <td className="px-3 py-1.5"><BarCell value={r.clicks} max={clkMax} color="chart-1" format={(n) => n.toLocaleString()} /></td>
                    <td className="px-3 py-1.5"><BarCell value={r.impressions} max={imprMax} color="chart-3" format={(n) => n.toLocaleString()} /></td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{(r.ctr * 100).toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          {rows.length.toLocaleString()} {activeDim.label.toLowerCase()}
          {bucket !== "all" ? ` · ${(POS_BUCKETS.find((b) => b.key === bucket) ?? POS_BUCKETS[0]).label}` : ""}
        </div>
      </Card>
    </div>
  );
}
