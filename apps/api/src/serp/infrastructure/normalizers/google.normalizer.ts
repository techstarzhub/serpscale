import { createHash } from "crypto";
import type { ISerpNormalizer } from "../../domain/ports";
import type {
  NormalizedSerp,
  OrganicItem,
  PaaItem,
  RawProviderResult,
  RelatedItem,
  SerpFeatureItem,
} from "../../domain/serp.types";

/** Maps the Google scraper's raw payload into the normalized SERP contract. */
export class GoogleNormalizer implements ISerpNormalizer {
  readonly provider = "google-scraper";

  normalize(raw: RawProviderResult): NormalizedSerp {
    const p = raw.payload as GoogleRaw;

    const organic: OrganicItem[] = (p.organic ?? []).map((r, i) => ({
      position: i + 1,
      rank: i + 1,
      title: r.title,
      url: r.url,
      domain: hostOf(r.url),
      snippet: r.snippet || undefined,
    }));

    const features: SerpFeatureItem[] = [];
    if (p.featured?.text) features.push({ type: "featured_snippet", position: 0, content: p.featured.text, sourceUrl: organic[0]?.url ?? "" });
    if (p.hasAi) features.push({ type: "ai_overview", position: 1, present: true });

    const peopleAlsoAsk: PaaItem[] = (p.paa ?? []).map((q, i) => ({ position: i + 1, question: q.question }));
    const relatedSearches: RelatedItem[] = (p.related ?? []).map((r, i) => ({ position: i + 1, query: r.query }));

    const contentHash = createHash("sha256")
      .update(JSON.stringify({ e: raw.request.engine, l: raw.request.locale, d: raw.request.device, o: organic.map((o) => o.url) }))
      .digest("hex");

    return {
      query: raw.request.query,
      engine: raw.request.engine,
      locale: raw.request.locale,
      device: raw.request.device,
      fetchedAt: new Date().toISOString(),
      totalResults: p.totalResults,
      organic,
      features,
      aiOverview: p.hasAi ? { content: "AI Overview present on this SERP", sources: [], citedDomains: [] } : undefined,
      peopleAlsoAsk,
      relatedSearches,
      metadata: {
        provider: raw.provider,
        latencyMs: raw.latencyMs,
        contentHash,
        totalOrganic: organic.length,
        featureTypes: features.map((f) => f.type),
      },
    };
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

interface GoogleRaw {
  organic?: { title: string; url: string; snippet: string }[];
  paa?: { question: string }[];
  related?: { query: string }[];
  featured?: { text: string } | null;
  hasAi?: boolean;
  totalResults?: number;
}
