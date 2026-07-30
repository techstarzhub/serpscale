// Canonicalize an email so alias tricks can't spin up duplicate accounts / free
// trials, and so an invited user is stored under the exact address login resolves
// to. Plus-addressing (user+tag@) is an alias of the base address, so it's stripped
// for every provider; Gmail additionally ignores dots in the local part (and
// googlemail == gmail), so those are collapsed too. Everything else is left intact
// (dots matter outside Gmail).
export function normalizeEmail(raw: string): string {
  const e = (raw || "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus); // strip +tag alias (all providers)
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, ""); // Gmail ignores dots
  return `${local}@${domain}`;
}
