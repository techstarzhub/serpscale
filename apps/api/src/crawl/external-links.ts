// External broken-link checker.
//
// The crawler only follows ON-domain links; outbound links to other domains are
// merely counted. This module takes the outbound URLs a crawl collected and
// probes each unique one, so we can flag pages that link to a dead external URL
// (embarrassing on a client site). Kept in its own file so it plugs into the
// crawl pipeline with a single call and no coupling to the crawler internals.
import { fetch as uFetch } from "undici";

const UA =
  "Mozilla/5.0 (compatible; SEOPlatformBot/1.0; +https://seo-platform.local) AppleWebKit/537.36";

export interface BrokenExternal {
  url: string;
  statusCode: number | null; // null == hard network/DNS failure
  referrers: string[]; // pages on the audited site that link to this dead URL
}

export interface ExternalLinkResult {
  broken: BrokenExternal[];
  checked: number; // unique external URLs actually probed
  total: number; // unique external URLs the crawl found
}

// Status codes that mean the destination is genuinely gone. We deliberately do
// NOT treat 401/403/429 or timeouts as broken: those are bot-blocks / rate
// limits, not dead links — flagging them would hand clients false positives on a
// client-facing report. Precision matters more than recall here.
function isDeadStatus(status: number): boolean {
  return status === 404 || status === 410 || status >= 500;
}

// Connection-level errors that mean the destination really is unreachable.
const DEAD_NET = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

// Probe a single URL. HEAD first (cheap); many edges reject HEAD, so retry with
// GET before trusting an ambiguous code or a thrown error.
async function probe(url: string, timeoutMs: number): Promise<{ status: number | null; dead: boolean }> {
  const doFetch = (method: "HEAD" | "GET") =>
    uFetch(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": UA, Accept: "*/*" },
    });

  try {
    let res = await doFetch("HEAD");
    // These codes often just mean "HEAD not allowed / bot-walled" — confirm with GET.
    if (res.status === 400 || res.status === 403 || res.status === 405 || res.status === 501) {
      try {
        res = await doFetch("GET");
      } catch {
        /* keep the HEAD result if GET also fails at the network layer */
      }
    }
    return { status: res.status, dead: isDeadStatus(res.status) };
  } catch {
    // HEAD failed at the network layer — retry once with GET (some CDNs block HEAD).
    try {
      const res = await doFetch("GET");
      return { status: res.status, dead: isDeadStatus(res.status) };
    } catch (e2) {
      const code = String(
        (e2 as { cause?: { code?: string }; code?: string; name?: string })?.cause?.code ||
          (e2 as { code?: string })?.code ||
          (e2 as { name?: string })?.name ||
          "",
      );
      // Timeouts (AbortError) are ambiguous — never flag. Only hard DNS/conn errors count.
      return { status: null, dead: DEAD_NET.has(code) };
    }
  }
}

// Probe every unique external URL a crawl collected and report the dead ones.
// Bounded by `max` (URLs), per-request `timeoutMs`, and an overall `budgetMs`
// wall-clock deadline so a slow/hostile web can never stall the audit.
export async function checkExternalLinks(
  targets: Map<string, Set<string>>,
  opts: { concurrency?: number; timeoutMs?: number; max?: number; budgetMs?: number; signal?: AbortSignal } = {},
): Promise<ExternalLinkResult> {
  const concurrency = opts.concurrency ?? 16;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const max = opts.max ?? 400;
  const budgetMs = opts.budgetMs ?? 90_000;

  const total = targets.size;
  const urls = [...targets.keys()].filter((u) => /^https?:\/\//i.test(u)).slice(0, max);
  const deadline = Date.now() + budgetMs;

  const broken: BrokenExternal[] = [];
  let checked = 0;
  let next = 0;

  const worker = async () => {
    while (next < urls.length) {
      if (opts.signal?.aborted || Date.now() > deadline) return;
      const url = urls[next++];
      const { status, dead } = await probe(url, timeoutMs);
      checked++;
      if (dead) {
        broken.push({ url, statusCode: status, referrers: [...(targets.get(url) ?? [])].slice(0, 10) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));
  return { broken, checked, total };
}
