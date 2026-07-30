"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { tenantSubdomain } from "@/lib/tenant";

const MARKETING_HOME = process.env.NEXT_PUBLIC_MARKETING_URL || "https://serpscale.com";

/**
 * Blocks the sign-in form on an unknown white-label subdomain — e.g.
 * abc.serpscale.com that isn't linked to any workspace. On the main domain or a
 * valid tenant subdomain it just renders the form. (The API enforces the same
 * rule on every request; this is the friendly front door.)
 */
export function TenantGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "notfound">("checking");

  useEffect(() => {
    const sub = tenantSubdomain();
    if (!sub) {
      setState("ok");
      return;
    }
    api
      .get<{ exists: boolean }>(`/public/branding/${encodeURIComponent(sub)}`)
      .then((b) => setState(b?.exists ? "ok" : "notfound"))
      .catch(() => setState("ok")); // API unreachable → don't hard-block
  }, []);

  if (state === "checking") return null;
  if (state === "notfound") {
    return (
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Building2 className="h-7 w-7" />
        </div>
        <h1 className="mt-4 font-heading text-xl font-bold">Workspace not found</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          This address isn&apos;t linked to any workspace. Check the URL, or sign in from the main site.
        </p>
        <a
          href={MARKETING_HOME}
          className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Go to {new URL(MARKETING_HOME).hostname}
        </a>
      </div>
    );
  }
  return <>{children}</>;
}
