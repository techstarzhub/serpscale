import { createHash } from "crypto";
import type { ISerpProvider } from "../../domain/ports";
import type { RawProviderResult, SerpRequest } from "../../domain/serp.types";

/**
 * Deterministic mock SERP provider. Produces stable, realistic results seeded by
 * the query hash — zero external cost, perfect for local dev and tests. Its raw
 * shape is intentionally provider-specific so the normalizer earns its keep.
 */
export class MockSerpProvider implements ISerpProvider {
  readonly name = "mock";
  readonly costPerQuery = 0;

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async fetch(req: SerpRequest): Promise<RawProviderResult> {
    const seed = parseInt(createHash("md5").update(req.query).digest("hex").slice(0, 8), 16);
    const rand = mulberry32(seed);
    const slug = req.query.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const domains = ["example.com", "wikipedia.org", "github.com", "medium.com", "nytimes.com", "reddit.com", "stackoverflow.com", "forbes.com"]
      .sort(() => rand() - 0.5);

    const items = Array.from({ length: 10 }, (_, i) => {
      const domain = domains[i % domains.length];
      return {
        pos: i + 1,
        heading: `${req.query} — result ${i + 1}`,
        link: `https://www.${domain}/${slug}-${i + 1}`,
        host: domain,
        text: `Everything about ${req.query}. Result ${i + 1} from ${domain}.`,
      };
    });

    return {
      provider: this.name,
      latencyMs: Math.round(80 + rand() * 120),
      request: req,
      payload: {
        // Provider-shaped payload (not our normalized model).
        search_information: { total_results: Math.round(1_000 + rand() * 5_000_000) },
        organic_results: items,
        answer_box: rand() > 0.5 ? { snippet: `Quick answer for ${req.query}.`, link: `https://www.${domains[0]}/${slug}` } : undefined,
        ai_overview: rand() > 0.4
          ? { text: `AI overview: ${req.query} explained.`, references: items.slice(0, 3).map((it) => ({ title: it.heading, link: it.link })) }
          : undefined,
        related_questions: Array.from({ length: 4 }, (_, i) => ({ question: `What is ${req.query} #${i + 1}?`, snippet: `Answer ${i + 1}.`, link: items[i].link })),
        related_searches: Array.from({ length: 6 }, (_, i) => ({ query: `${req.query} ${["guide", "tips", "2026", "tools", "examples", "cost"][i]}` })),
      },
    };
  }
}

/** Small deterministic PRNG so results are reproducible per query. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
