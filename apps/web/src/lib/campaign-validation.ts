// Shared client-side validation for the campaign create/edit wizard (step 1).
// These rules mirror the server DTO (apps/api/src/projects/dto/project.dto.ts) so
// the user gets instant, identical feedback before the request is ever sent.

// Dashboard tab keys that map to real tabs on the campaign detail page.
export const VALID_TAB_IDS = [
  "overview", "copilot", "keywords", "content", "ranks",
  "competitors", "traffic", "backlinks", "domain", "ai", "audit",
] as const;

// A registrable public domain: one or more DNS labels + a 2+ letter TLD.
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;

// Strip protocol, path and casing so "https://WWW.Example.com/pricing" becomes
// "www.example.com" — matches cleanDomain() on the server.
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

// Rejects obviously-internal targets (localhost, private/loopback/link-local IPs,
// *.local/.internal) — mirrors isInternalDomain() on the server.
function isInternalDomain(domain: string): boolean {
  const host = domain.replace(/:\d+$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

/** Returns an error message for the campaign name, or null when it's valid. */
export function validateName(name: string): string | null {
  const v = name.trim();
  if (!v) return "Campaign name is required.";
  if (v.length < 2) return "Campaign name must be at least 2 characters.";
  if (v.length > 120) return "Campaign name must be 120 characters or fewer.";
  return null;
}

/** Returns an error message for the domain, or null when it's valid. */
export function validateDomain(domain: string): string | null {
  if (!domain.trim()) return "Domain is required.";
  const d = normalizeDomain(domain);
  if (/\s/.test(d)) return "Domain cannot contain spaces.";
  if (d.length > 253) return "Domain is too long.";
  if (!DOMAIN_RE.test(d)) return "Enter a valid domain like example.com (no http:// or paths).";
  if (isInternalDomain(d)) return "That domain isn't allowed.";
  return null;
}
