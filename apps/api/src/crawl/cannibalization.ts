// Keyword cannibalization detector.
//
// Finds pages that target the SAME search intent and therefore compete with each
// other in Google (splitting rankings, backlinks and CTR). Runs entirely on data
// the crawl already stored (page title + meta description) — no re-crawl, no
// external embedding API — so it plugs in as a pure post-crawl pass.
//
// Signal: normalized title tokens are the strongest cheap proxy for "what this
// page is trying to rank for". We cluster pages whose title token-sets overlap
// heavily (Jaccard) and that share ≥2 meaningful keywords.

export interface CannibalPage {
  url: string;
  title: string | null;
  metaDescription?: string | null;
}

export interface CannibalCluster {
  keywords: string[]; // the shared keyword tokens driving the overlap
  pages: { url: string; title: string | null }[];
}

export interface CannibalResult {
  clusters: CannibalCluster[];
  pagesInvolved: number;
}

// Common English + generic web stopwords that carry no keyword intent.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "you", "our", "are", "was", "were", "from", "that", "this",
  "have", "has", "will", "can", "all", "any", "how", "what", "why", "when", "who", "get", "best",
  "top", "new", "one", "two", "into", "out", "over", "more", "most", "than", "then", "now", "not",
  "but", "his", "her", "its", "their", "they", "them", "she", "him", "may", "use", "using", "used",
  "about", "page", "home", "welcome", "site", "website", "services", "service", "solutions", "company",
  "inc", "llc", "ltd", "official", "www", "com",
]);

function tokenize(text: string, brand: Set<string>): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !brand.has(t) && !/^\d+$/.test(t));
}

// Brand tokens (from the domain) are stripped: every page shares the brand, so it
// would create false cannibalization links between unrelated pages.
function brandTokens(startUrl: string): Set<string> {
  try {
    const host = new URL(startUrl).hostname.replace(/^www\./, "");
    return new Set(host.split(".")[0].split(/[^a-z0-9]+/i).map((s) => s.toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function jaccard(a: Set<string>, b: Set<string>): { score: number; shared: string[] } {
  const shared: string[] = [];
  for (const t of a) if (b.has(t)) shared.push(t);
  const union = a.size + b.size - shared.length;
  return { score: union === 0 ? 0 : shared.length / union, shared };
}

// Union-find so transitive competitors (A~B, B~C) land in one cluster.
class DSU {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

export function detectCannibalization(
  pages: CannibalPage[],
  startUrl: string,
  opts: { minJaccard?: number; minShared?: number; maxPages?: number } = {},
): CannibalResult {
  const minJaccard = opts.minJaccard ?? 0.5;
  const minShared = opts.minShared ?? 2;
  const maxPages = opts.maxPages ?? 1500;

  const brand = brandTokens(startUrl);
  // De-dupe by URL first so the same page can't appear twice in a cluster.
  const seenUrl = new Set<string>();
  const unique = pages.filter((p) => (seenUrl.has(p.url) ? false : (seenUrl.add(p.url), true)));
  // Only pages with a usable title; the title carries the ranking intent.
  const rows = unique
    .filter((p) => p.title && p.title.trim().length > 0)
    .slice(0, maxPages)
    .map((p) => {
      const tokens = new Set(tokenize(p.title || "", brand));
      // Fold in a few meta-description tokens for pages with near-identical titles.
      for (const t of tokenize(p.metaDescription || "", brand).slice(0, 8)) tokens.add(t);
      return { url: p.url, title: p.title, tokens };
    })
    .filter((r) => r.tokens.size >= 2);

  const dsu = new DSU(rows.length);
  // Track the shared keywords that linked each merged pair, per root cluster.
  const pairShared = new Map<number, Set<string>>();

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const { score, shared } = jaccard(rows[i].tokens, rows[j].tokens);
      if (score >= minJaccard && shared.length >= minShared) {
        dsu.union(i, j);
        const root = dsu.find(i);
        let s = pairShared.get(root);
        if (!s) { s = new Set(); pairShared.set(root, s); }
        for (const k of shared) s.add(k);
      }
    }
  }

  // Gather members per cluster root.
  const members = new Map<number, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const root = dsu.find(i);
    const arr = members.get(root) ?? [];
    arr.push(i);
    members.set(root, arr);
  }

  const clusters: CannibalCluster[] = [];
  let pagesInvolved = 0;
  for (const [root, idxs] of members) {
    if (idxs.length < 2) continue; // a cluster of one isn't cannibalization
    pagesInvolved += idxs.length;
    // Re-derive shared keywords across the whole cluster (intersection is too
    // strict for 3+ pages; use the keywords that appear in ≥2 of the members).
    const freq = new Map<string, number>();
    for (const i of idxs) for (const t of rows[i].tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
    const keywords = [...freq.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k);
    // Fall back to the pairwise-linked keywords if the frequency pass is empty.
    const kw = keywords.length ? keywords : [...(pairShared.get(root) ?? [])].slice(0, 6);
    clusters.push({
      keywords: kw,
      pages: idxs.map((i) => ({ url: rows[i].url, title: rows[i].title })),
    });
  }

  // Biggest / most-competitive clusters first.
  clusters.sort((a, b) => b.pages.length - a.pages.length);
  return { clusters: clusters.slice(0, 50), pagesInvolved };
}
