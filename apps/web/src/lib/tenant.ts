// Resolve the white-label tenant subdomain from the current host, e.g.
// techstarz-hub.serpscale.com → "techstarz-hub" (dev: techstarz-hub.localhost).
// Returns null on the main domain / localhost / a reserved subdomain.
const RESERVED = new Set(["www", "app", "api", "dashboard"]);

export function tenantSubdomain(): string | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hostname.toLowerCase();
  if (!h || h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
  if (h.endsWith(".localhost")) {
    const s = h.slice(0, -".localhost".length).split(".")[0];
    return s && !RESERVED.has(s) ? s : null;
  }
  const d = (process.env.NEXT_PUBLIC_APP_DOMAIN || "serpscale.com").toLowerCase();
  if (h.endsWith("." + d)) {
    const s = h.slice(0, h.length - d.length - 1).split(".")[0];
    return s && !RESERVED.has(s) ? s : null;
  }
  return null;
}
