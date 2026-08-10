"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Unlink,
  RotateCw,
} from "lucide-react";
import { SiGooglesearchconsole, SiGoogleanalytics, SiGooglemaps } from "react-icons/si";
import { FcGoogle } from "react-icons/fc";
import type { ComponentType, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface GoogleAccount {
  id: string;
  accountEmail: string | null;
  status: string;
}
interface Status {
  googleAccounts: GoogleAccount[];
  googleConfigured: boolean;
}

const GOOGLE_SERVICES: { name: string; desc: string; icon: ComponentType<{ className?: string; style?: CSSProperties }>; color: string }[] = [
  { name: "Search Console", desc: "Organic rankings, impressions & clicks", icon: SiGooglesearchconsole, color: "#458CF5" },
  { name: "Analytics (GA4)", desc: "Traffic, sessions, and conversions", icon: SiGoogleanalytics, color: "#E37400" },
  { name: "Business Profile", desc: "Local listings (needs Google approval)", icon: SiGooglemaps, color: "#34A853" },
];

export default function IntegrationsPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<Status>("/integrations"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function connectGoogle() {
    window.location.href = `${API}/integrations/google/connect`;
  }

  async function disconnect(id: string) {
    setBusy(id);
    try {
      await api.del(`/integrations/${id}`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const accounts = status?.googleAccounts ?? [];
  const configured = status?.googleConfigured;
  const connected = accounts.length > 0;
  // A revoked/expired Google token needs a one-time reconnect. Services are only
  // truly "Active" while at least one account still has a live token.
  const isExpired = (s?: string) => !!s && s !== "connected";
  const hasLive = accounts.some((a) => !isExpired(a.status));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-heading text-lg font-semibold">Integrations</h3>
        <p className="text-sm text-muted-foreground">
          Connect one or more Google accounts. Each project picks its own property.
        </p>
      </div>

      {params.get("connected") === "google" && (
        <div className="flex items-center gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 px-3 py-2 text-sm text-chart-2">
          <CheckCircle2 className="h-4 w-4" /> Google account connected.
        </div>
      )}
      {params.get("error") && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> Could not connect. Please try again.
        </div>
      )}

      {loading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : (
        <>
          <Card data-tour="setup-integrations">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-card"><FcGoogle className="h-6 w-6" /></span>
                <div>
                  <CardTitle>Google accounts</CardTitle>
                  <CardDescription>
                    {connected ? `${accounts.length} account${accounts.length > 1 ? "s" : ""} connected` : "Powers Search Console & Analytics"}
                  </CardDescription>
                </div>
              </div>
              <Button className="gap-2" disabled={!configured} onClick={connectGoogle}>
                <Plus className="h-4 w-4" /> {connected ? "Add account" : "Connect Google"}
              </Button>
            </CardHeader>

            {(connected || !configured) && (
              <CardContent className="space-y-2">
                {accounts.map((a) => {
                  const expired = isExpired(a.status);
                  return (
                    <div key={a.id} className={cn("flex items-center justify-between gap-3 rounded-lg border p-3", expired ? "border-destructive/30 bg-destructive/[0.04]" : "border-border")}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", expired ? "bg-destructive/12 text-destructive" : "bg-chart-2/12 text-chart-2")}>
                          {expired ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.accountEmail ?? "Connected account"}</p>
                          <span className={cn("mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", expired ? "bg-destructive/12 text-destructive" : "bg-chart-2/12 text-chart-2")}>
                            {expired ? "Expired · reconnect" : "Active"}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {expired && (
                          <Button size="sm" className="gap-1.5" onClick={connectGoogle}>
                            <RotateCw className="h-3.5 w-3.5" /> Reconnect
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === a.id}
                          onClick={() => disconnect(a.id)}
                          className="gap-1.5 border-destructive/30 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
                        >
                          {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Unlink className="h-3.5 w-3.5" /> Disconnect</>}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {!configured && (
                  <div className="flex items-start gap-2 rounded-lg border border-chart-3/30 bg-chart-3/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-chart-3" />
                    <span>Setup needed: add <code className="rounded bg-secondary px-1">GOOGLE_CLIENT_ID</code> and <code className="rounded bg-secondary px-1">GOOGLE_CLIENT_SECRET</code>.</span>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            {GOOGLE_SERVICES.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.name}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card"><Icon className="h-5 w-5" style={{ color: s.color }} /></span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", hasLive ? "bg-chart-2/12 text-chart-2" : connected ? "bg-destructive/12 text-destructive" : "bg-secondary text-muted-foreground")}>
                        {hasLive ? "Active" : connected ? "Reconnect needed" : "Not connected"}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{s.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
