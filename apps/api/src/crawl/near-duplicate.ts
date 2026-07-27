// Near-duplicate content detection with cross-page boilerplate removal.
//
// Naive SimHash flags pages that merely SHARE a template (same hero / CTA /
// testimonials repeated site-wide) even when their real content differs. To
// avoid that, we fingerprint each page as a SET of content shingles, then drop
// the shingles that appear on MANY pages (site-wide boilerplate) before
// comparing. Two pages are near-duplicates only when their UNIQUE (non-
// boilerplate) content overlaps heavily (Jaccard). Pure + unit-tested.

const MASK32 = 0xffffffff;

// FNV-1a 32-bit hash (compact — shingle sets stay small in memory).
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) & MASK32;
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 2);
}

// Overlapping k-word shingles → a set of hashes (order-sensitive, de-duped).
export function contentShingles(text: string, k = 5, cap = 800): number[] {
  const tokens = tokenize(text);
  if (tokens.length < k) return [];
  const set = new Set<number>();
  for (let i = 0; i + k <= tokens.length && set.size < cap; i++) {
    set.add(fnv1a32(tokens.slice(i, i + k).join(" ")));
  }
  return [...set];
}

function jaccard(a: Set<number>, b: Set<number>): number {
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

class DSU {
  private p: number[];
  constructor(n: number) { this.p = Array.from({ length: n }, (_, i) => i); }
  find(x: number): number { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; }
  union(a: number, b: number): void { this.p[this.find(a)] = this.find(b); }
}

export interface DupCluster { urls: string[] }

export function detectNearDuplicates(
  pages: { url: string; shingles: number[] }[],
  opts: { minJaccard?: number; minContent?: number; max?: number } = {},
): { clusters: DupCluster[]; pagesInvolved: number } {
  const minJaccard = opts.minJaccard ?? 0.6;
  const minContent = opts.minContent ?? 8;

  // De-dupe by URL.
  const byUrl = new Map<string, number[]>();
  for (const p of pages) if (p.shingles.length && !byUrl.has(p.url)) byUrl.set(p.url, p.shingles);
  const rows = [...byUrl.entries()].slice(0, opts.max ?? 2000).map(([url, shingles]) => ({ url, shingles }));
  if (rows.length < 2) return { clusters: [], pagesInvolved: 0 };

  // Document frequency of each shingle → anything on many pages is boilerplate.
  const df = new Map<number, number>();
  for (const r of rows) for (const s of r.shingles) df.set(s, (df.get(s) ?? 0) + 1);
  const boilerplateAt = Math.max(4, Math.ceil(rows.length * 0.25));

  // Keep only each page's UNIQUE (non-boilerplate) content shingles.
  const content = rows.map((r) => ({
    url: r.url,
    set: new Set(r.shingles.filter((s) => (df.get(s) ?? 0) < boilerplateAt)),
  }));
  // Pages that are almost entirely boilerplate can't be judged — skip them.
  const idx = content.map((c, i) => (c.set.size >= minContent ? i : -1)).filter((i) => i >= 0);

  const dsu = new DSU(content.length);
  for (let a = 0; a < idx.length; a++) {
    for (let b = a + 1; b < idx.length; b++) {
      const i = idx[a], j = idx[b];
      if (jaccard(content[i].set, content[j].set) >= minJaccard) dsu.union(i, j);
    }
  }

  const members = new Map<number, string[]>();
  for (const i of idx) {
    const root = dsu.find(i);
    const arr = members.get(root) ?? [];
    arr.push(content[i].url);
    members.set(root, arr);
  }

  const clusters: DupCluster[] = [];
  let pagesInvolved = 0;
  for (const urls of members.values()) {
    if (urls.length < 2) continue;
    pagesInvolved += urls.length;
    clusters.push({ urls });
  }
  clusters.sort((a, b) => b.urls.length - a.urls.length);
  return { clusters: clusters.slice(0, 50), pagesInvolved };
}
