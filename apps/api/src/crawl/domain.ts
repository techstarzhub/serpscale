// Accurate registrable-domain helpers backed by the public-suffix list (tldts),
// so "same site" is correct for multi-level TLDs (example.co.uk) and subdomains
// (blog.example.com ⇔ example.com) — far more reliable than stripping "www.".
import { getDomain } from "tldts";

export function registrableDomain(urlOrHost: string): string {
  return getDomain(urlOrHost) || "";
}

// True when both URLs/hosts belong to the same registrable domain.
export function sameSite(a: string, b: string): boolean {
  const da = getDomain(a);
  const db = getDomain(b);
  return !!da && !!db && da === db;
}
