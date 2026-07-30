// One-off technical site checks that need their own targeted requests (not part
// of the page crawl): compression, HTTP→HTTPS enforcement, www/non-www
// duplication, publicly-exposed sensitive files, and robots.txt blocking the
// CSS/JS Google needs to render the page. Network-bound but bounded by timeouts;
// pure helpers are exported for unit tests.
import { fetch as uFetch } from "undici";
import { isPublicUrl, type Issue } from "./crawler";

const UA = "Mozilla/5.0 (compatible; SEOPlatformBot/1.0; +https://seo-platform.local) AppleWebKit/537.36";

// Sensitive files that must never be publicly served. Each has a content
// signature so an SPA that returns 200 + HTML for everything is NOT a false hit.
export const EXPOSED_FILES: { path: string; sig: RegExp }[] = [
  { path: "/.git/config", sig: /\[core\]/ },
  { path: "/.git/HEAD", sig: /ref:\s/ },
  { path: "/.env", sig: /^[A-Z0-9_]+=/m },
  { path: "/.htaccess", sig: /RewriteEngine|Order\s+allow|deny\s+from/i },
  { path: "/wp-config.php.bak", sig: /DB_PASSWORD|DB_NAME/ },
];

// Does robots.txt disallow the CSS/JS/asset paths Google must fetch to render?
export function robotsBlocksResources(robots: string): boolean {
  const rules: string[] = [];
  let applies = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") applies = val === "*";
    else if (applies && key === "disallow" && val) rules.push(val.toLowerCase());
  }
  return rules.some((r) => /\.css|\.js|\/assets|\/static|\/_next|\/wp-content|\/wp-includes/.test(r));
}

async function head(url: string, redirect: "manual" | "follow") {
  try {
    if (!(await isPublicUrl(url))) return null; // SSRF guard
    const r = await uFetch(url, { method: "GET", redirect, signal: AbortSignal.timeout(12000), headers: { "User-Agent": UA } });
    return r;
  } catch {
    return null;
  }
}

export async function technicalSiteChecks(startUrl: string): Promise<Issue[]> {
  const out: Issue[] = [];
  let origin: URL;
  try { origin = new URL(startUrl); } catch { return out; }
  const host = origin.hostname;

  // ---- Compression (homepage) ----
  const home = await head(origin.origin + "/", "follow");
  if (home) {
    const enc = (home.headers.get("content-encoding") || "").toLowerCase();
    if (!enc.includes("gzip") && !enc.includes("br") && !enc.includes("deflate"))
      out.push({ code: "no-compression", severity: "warning", category: "performance", message: "Responses are not compressed (no gzip/brotli) — pages download larger and slower" });
  }

  // ---- HTTP → HTTPS enforcement ----
  const httpRes = await head(`http://${host}/`, "manual");
  if (httpRes) {
    const loc = (httpRes.headers.get("location") || "").toLowerCase();
    const redirectsToHttps = httpRes.status >= 300 && httpRes.status < 400 && loc.startsWith("https://");
    if (!redirectsToHttps && httpRes.status < 400)
      out.push({ code: "no-https-redirect", severity: "warning", category: "security", message: "The http:// version does not redirect to https:// — split signals and a security risk" });
  }

  // ---- www vs non-www duplication ----
  const bare = host.replace(/^www\./, "");
  const [wwwRes, nonRes] = await Promise.all([head(`https://www.${bare}/`, "manual"), head(`https://${bare}/`, "manual")]);
  const ok = (r: Awaited<ReturnType<typeof head>>) => !!r && r.status >= 200 && r.status < 300;
  if (ok(wwwRes) && ok(nonRes))
    out.push({ code: "www-duplicate", severity: "warning", category: "indexability", message: "Both www and non-www resolve without redirecting — pick one and 301 the other to avoid duplicate content" });

  // ---- Publicly exposed sensitive files ----
  const exposed: string[] = [];
  await Promise.all(
    EXPOSED_FILES.map(async ({ path, sig }) => {
      const r = await head(origin.origin + path, "follow");
      if (r && r.status === 200) {
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("text/html")) {
          const body = await r.text().catch(() => "");
          if (sig.test(body)) exposed.push(path);
        }
      }
    }),
  );
  if (exposed.length)
    out.push({ code: "exposed-files", severity: "error", category: "security", message: `Sensitive file(s) publicly accessible: ${exposed.join(", ")} — block these immediately` });

  // ---- robots.txt blocking render resources ----
  const robots = await head(origin.origin + "/robots.txt", "follow");
  if (robots && robots.status === 200) {
    const txt = await robots.text().catch(() => "");
    if (txt && robotsBlocksResources(txt))
      out.push({ code: "robots-blocks-resources", severity: "warning", category: "crawlability", message: "robots.txt blocks CSS/JS/asset paths — Google may not be able to render the page correctly" });
  }

  return out;
}
