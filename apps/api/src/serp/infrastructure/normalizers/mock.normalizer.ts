import { createHash } from "crypto";
import type { ISerpNormalizer } from "../../domain/ports";
import type {
  AiOverviewItem,
  NormalizedSerp,
  OrganicItem,
  PaaItem,
  RawProviderResult,
  RelatedItem,
  SerpFeatureItem,
} from "../../domain/serp.types";

/**
 * Maps the mock provider's raw payload into the normalized model. This is the
 * anti-corruption boundary — the ONLY place that understands the mock's shape.
 */
export class MockNormalizer implements ISerpNormalizer {
  readonly provider = "mock";

  normalize(raw: RawProviderResult): NormalizedSerp {
    const p = raw.payload as MockPayload;

    const organic: OrganicItem[] = (p.organic_results ?? []).map((r, i) => ({
      position: r.pos,
      rank: i + 1,
      title: r.heading,
      url: r.link,
      domain: r.host,
      snippet: r.text,
    }));

    const features: SerpFeatureItem[] = [];
    if (p.answer_box) features.push({ type: "featured_snippet", position: 0, content: p.answer_box.snippet, sourceUrl: p.answer_box.link });
    if (p.ai_overview) features.push({ type: "ai_overview", position: 1, present: true });

    const aiOverview: AiOverviewItem | undefined = p.ai_overview
      ? {
          content: p.ai_overview.text,
          sources: (p.ai_overview.references ?? []).map((ref) => ({ title: ref.title, url: ref.link, domain: hostOf(ref.link) })),
          citedDomains: [...new Set((p.ai_overview.references ?? []).map((ref) => hostOf(ref.link)))],
        }
      : undefined;

    const peopleAlsoAsk: PaaItem[] = (p.related_questions ?? []).map((q, i) => ({ position: i + 1, question: q.question, snippet: q.snippet, url: q.link }));
    const relatedSearches: RelatedItem[] = (p.related_searches ?? []).map((r, i) => ({ position: i + 1, query: r.query }));

    const contentHash = createHash("sha256")
      .update(JSON.stringify({ e: raw.request.engine, l: raw.request.locale, d: raw.request.device, o: organic.map((o) => o.url) }))
      .digest("hex");

    return {
      query: raw.request.query,
      engine: raw.request.engine,
      locale: raw.request.locale,
      device: raw.request.device,
      fetchedAt: new Date().toISOString(),
      totalResults: p.search_information?.total_results,
      organic,
      features,
      aiOverview,
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

interface MockPayload {
  search_information?: { total_results?: number };
  organic_results?: { pos: number; heading: string; link: string; host: string; text: string }[];
  answer_box?: { snippet: string; link: string };
  ai_overview?: { text: string; references?: { title: string; link: string }[] };
  related_questions?: { question: string; snippet?: string; link?: string }[];
  related_searches?: { query: string }[];
}
