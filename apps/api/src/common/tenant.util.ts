// White-label subdomain (tenant) resolution. `techstarz-hub.serpscale.com` →
// "techstarz-hub". The app domain is configurable so the same code works in dev
// (‹slug›.localhost) and prod (‹slug›.serpscale.com).

export function appDomain(): string {
  return (process.env.APP_DOMAIN || "serpscale.com").toLowerCase();
}

// Subdomains that are NOT tenants (the app itself / api / www).
const RESERVED = new Set(["www", "app", "api", "dashboard"]);

/** Extract a tenant slug from a host or full origin/URL, or null for the main
 *  domain / localhost / an IP / a reserved subdomain. */
export function tenantSlugFromHost(hostOrOrigin: string | undefined | null): string | null {
  if (!hostOrOrigin) return null;
  let h = hostOrOrigin.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (!h || h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
  if (h.endsWith(".localhost")) {
    const s = h.slice(0, -".localhost".length).split(".")[0];
    return s && !RESERVED.has(s) ? s : null;
  }
  const d = appDomain();
  if (h.endsWith("." + d)) {
    const s = h.slice(0, h.length - d.length - 1).split(".")[0];
    return s && !RESERVED.has(s) ? s : null;
  }
  return null;
}

/** Tenant slug for an incoming request, from its Origin (browsers always send it
 *  on credentialed cross-origin calls) with Referer as a fallback. */
export function tenantSlugFromRequest(req: { headers?: Record<string, unknown> }): string | null {
  const origin = (req?.headers?.origin as string) || (req?.headers?.referer as string) || null;
  return tenantSlugFromHost(origin);
}
