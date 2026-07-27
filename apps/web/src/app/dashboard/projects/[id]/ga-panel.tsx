"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  UserPlus,
  MousePointerClick,
  Timer,
  Plug,
  BarChart3,
  Globe2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Project } from "@/components/providers/projects-provider";
import {
  TrendChart,
  BarList,
  DonutChart,
  ChartCard,
  compact,
} from "@/components/ui/charts";

interface GaData {
  connected: boolean;
  matched: boolean;
  properties?: string[];
  propertyName?: string;
  accountEmail?: string;
  totals?: {
    sessions: number;
    users: number;
    newUsers: number;
    pageviews: number;
    avgDuration: number;
    bounceRate: number;
    engagementRate: number;
  };
  trend?: { date: string; sessions: number; users: number }[];
  channels?: { channel: string; sessions: number; users: number }[];
  topPages?: { path: string; pageviews: number; sessions: number }[];
  countries?: { country: string; sessions: number }[];
  devices?: { device: string; sessions: number }[];
  sources?: { source: string; sessions: number; users: number }[];
  landingPages?: { path: string; sessions: number }[];
  cities?: { city: string; sessions: number }[];
  browsers?: { browser: string; sessions: number }[];
  newReturning?: { type: string; sessions: number }[];
}

const DAY_OPTS = [7, 28, 90];

function fmtDate(yyyymmdd: string) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${mo[Number(yyyymmdd.slice(4, 6)) - 1]} ${Number(yyyymmdd.slice(6, 8))}`;
}
function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function Kpi({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: LucideIcon }) {
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
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function GaTraffic({ project, refreshNonce = 0 }: { project: Project; refreshNonce?: number }) {
  const [data, setData] = useState<GaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(28);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<GaData>(`/projects/${project.id}/ga?days=${days}${refreshNonce ? "&fresh=1" : ""}`));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [project.id, days, refreshNonce]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-80 rounded-xl" />
        <div className="grid gap-3 lg:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}</div>
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><BarChart3 className="h-7 w-7" /></span>
          <div className="space-y-1">
            <h3 className="font-heading text-base font-semibold">Connect Google Analytics</h3>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Connect your Google account to pull real traffic, sessions, sources and engagement from GA4.
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
          <h3 className="font-heading text-base font-semibold">No matching GA4 property</h3>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Your Google account is connected, but no Analytics property matches <b>{project.domain}</b>. Check that a GA4 web stream points to this domain.
          </p>
          {data.properties && data.properties.length > 0 && (
            <p className="text-xs text-muted-foreground">Available: {data.properties.join(", ")}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const t = data.totals ?? { sessions: 0, users: 0, newUsers: 0, pageviews: 0, avgDuration: 0, bounceRate: 0, engagementRate: 0 };
  const trend = data.trend ?? [];
  const channels = (data.channels ?? []).map((c) => ({ ...c, channel: c.channel || "(other)" }));
  const devices = (data.devices ?? []).map((d) => ({ ...d, device: d.device || "unknown" }));
  const topPages = data.topPages ?? [];
  const countries = (data.countries ?? []).map((c) => ({ ...c, country: c.country || "(not set)" }));
  const sources = (data.sources ?? []).map((s) => ({ ...s, source: s.source || "(not set)" }));
  const landingPages = data.landingPages ?? [];
  const cities = (data.cities ?? []).filter((c) => c.city && c.city !== "(not set)");
  const browsers = data.browsers ?? [];
  const newReturning = data.newReturning ?? [];

  return (
    <div className="space-y-3">
      {/* header: property + range switch */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          GA4 · <span className="font-medium text-foreground">{data.propertyName}</span>
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
        <Kpi label="Sessions" value={compact(t.sessions)} sub={`${compact(t.pageviews)} pageviews`} icon={MousePointerClick} />
        <Kpi label="Users" value={compact(t.users)} sub={`${compact(t.newUsers)} new`} icon={Users} />
        <Kpi label="Engagement rate" value={`${(t.engagementRate * 100).toFixed(1)}%`} sub={`${(t.bounceRate * 100).toFixed(1)}% bounce`} icon={UserPlus} />
        <Kpi label="Avg. session" value={fmtDuration(t.avgDuration)} sub="duration" icon={Timer} />
      </div>

      {/* main trend */}
      <ChartCard title="Traffic over time" subtitle={`Sessions & users · last ${days} days`}>
        <TrendChart
          data={trend}
          xKey="date"
          xTickFormatter={fmtDate}
          labelFormatter={fmtDate}
          dots
          series={[
            { key: "sessions", name: "Sessions", color: "chart-1" },
            { key: "users", name: "Users", color: "chart-2" },
          ]}
          height={280}
        />
      </ChartCard>

      {/* channels + devices */}
      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Traffic by channel" subtitle="Sessions per source" className="lg:col-span-2">
          <BarList data={channels} categoryKey="channel" valueKey="sessions" color="chart-1" height={Math.max(200, channels.length * 34)} />
        </ChartCard>
        <ChartCard title="Devices" subtitle="Session share">
          <DonutChart data={devices} nameKey="device" valueKey="sessions" centerValue={compact(t.sessions)} centerLabel="sessions" />
          <div className="mt-3 space-y-1.5">
            {devices.map((d, i) => (
              <div key={d.device} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: `hsl(var(--chart-${(i % 5) + 1}))` }} />
                <span className="capitalize text-muted-foreground">{d.device}</span>
                <span className="ml-auto font-medium">{compact(d.sessions)}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* top pages (full, scrollable) + top countries */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Top pages" subtitle={`All ${topPages.length} pages · by pageviews`} action={<BarChart3 className="h-4 w-4 text-muted-foreground" />}>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-card">
                <tr className="border-b border-border text-left">
                  <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Page</th>
                  <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Views</th>
                  <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((p) => (
                  <tr key={p.path} className="border-b border-border last:border-0">
                    <td className="max-w-[240px] truncate py-2 font-medium" title={p.path}>{p.path}</td>
                    <td className="py-2 text-right text-muted-foreground">{compact(p.pageviews)}</td>
                    <td className="py-2 text-right text-muted-foreground">{compact(p.sessions)}</td>
                  </tr>
                ))}
                {topPages.length === 0 && <tr><td colSpan={3} className="py-8 text-center text-sm text-muted-foreground">No page data.</td></tr>}
              </tbody>
            </table>
          </div>
        </ChartCard>
        <ChartCard title="Top countries" subtitle={`${countries.length} countries · by sessions`} action={<Globe2 className="h-4 w-4 text-muted-foreground" />}>
          <div className="max-h-80 overflow-y-auto pr-1">
            <BarList data={countries} categoryKey="country" valueKey="sessions" color="chart-4" />
          </div>
        </ChartCard>
      </div>

      {/* traffic sources + landing pages */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Traffic sources" subtitle="Source / medium · by sessions">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-card">
                <tr className="border-b border-border text-left">
                  <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source / medium</th>
                  <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessions</th>
                  <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Users</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.source} className="border-b border-border last:border-0">
                    <td className="max-w-[220px] truncate py-2 font-medium" title={s.source}>{s.source}</td>
                    <td className="py-2 text-right text-muted-foreground">{compact(s.sessions)}</td>
                    <td className="py-2 text-right text-muted-foreground">{compact(s.users)}</td>
                  </tr>
                ))}
                {sources.length === 0 && <tr><td colSpan={3} className="py-8 text-center text-sm text-muted-foreground">No source data.</td></tr>}
              </tbody>
            </table>
          </div>
        </ChartCard>
        <ChartCard title="Landing pages" subtitle="Entry pages · by sessions">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-card">
                <tr className="border-b border-border text-left">
                  <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Landing page</th>
                  <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {landingPages.map((p) => (
                  <tr key={p.path} className="border-b border-border last:border-0">
                    <td className="max-w-[280px] truncate py-2 font-medium" title={p.path}>{p.path}</td>
                    <td className="py-2 text-right text-muted-foreground">{compact(p.sessions)}</td>
                  </tr>
                ))}
                {landingPages.length === 0 && <tr><td colSpan={2} className="py-8 text-center text-sm text-muted-foreground">No landing-page data.</td></tr>}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* cities + browsers + new vs returning */}
      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Top cities" subtitle={`${cities.length} cities`}>
          <div className="max-h-72 overflow-y-auto pr-1">
            {cities.length > 0 ? <BarList data={cities.slice(0, 30)} categoryKey="city" valueKey="sessions" color="chart-5" /> : <p className="py-6 text-center text-sm text-muted-foreground">No city data.</p>}
          </div>
        </ChartCard>
        <ChartCard title="Browsers" subtitle="Session share">
          {browsers.length > 0 ? <BarList data={browsers} categoryKey="browser" valueKey="sessions" color="chart-2" /> : <p className="py-6 text-center text-sm text-muted-foreground">No browser data.</p>}
        </ChartCard>
        <ChartCard title="New vs returning" subtitle="Session share">
          {newReturning.length > 0 ? (
            <>
              <DonutChart data={newReturning} nameKey="type" valueKey="sessions" centerValue={compact(t.sessions)} centerLabel="sessions" />
              <div className="mt-3 space-y-1.5">
                {newReturning.map((r, i) => (
                  <div key={r.type} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: `hsl(var(--chart-${(i % 5) + 1}))` }} />
                    <span className="capitalize text-muted-foreground">{r.type}</span>
                    <span className="ml-auto font-medium">{compact(r.sessions)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="py-6 text-center text-sm text-muted-foreground">No data.</p>}
        </ChartCard>
      </div>
    </div>
  );
}
