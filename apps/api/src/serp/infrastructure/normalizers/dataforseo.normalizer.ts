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

/** Maps DataForSEO's Google Organic result payload into the normalized contract. */
export class DataForSeoNormalizer implements ISerpNormalizer {
  readonly provider = "dataforseo";

  normalize(raw: RawProviderResult): NormalizedSerp {
    const r = raw.payload as DfsResult;
    const items = r.items ?? [];

    const organic: OrganicItem[] = items
      .filter((i) => i.type === "organic")
      .map((i, idx) => ({
        position: i.rank_absolute ?? idx + 1,
        rank: i.rank_group ?? idx + 1,
        title: i.title ?? "",
        url: i.url ?? "",
        domain: i.domain ?? hostOf(i.url ?? ""),
        snippet: i.description ?? undefined,
      }));

    const features: SerpFeatureItem[] = [];
    const featured = items.find((i) => i.type === "featured_snippet");
    if (featured) features.push({ type: "featured_snippet", position: featured.rank_absolute ?? 0, content: featured.description ?? featured.title ?? "", sourceUrl: featured.url ?? "" });
    const aiItem = items.find((i) => i.type === "ai_overview");
    if (aiItem) features.push({ type: "ai_overview", position: aiItem.rank_absolute ?? 1, present: true });
    if (items.some((i) => i.type === "video")) features.push({ type: "video_pack", position: 2, count: 1 });

    const aiOverview: AiOverviewItem | undefined = aiItem
      ? {
          content: extractAiText(aiItem),
          sources: (aiItem.references ?? []).map((ref) => ({ title: ref.title ?? "", url: ref.url ?? "", domain: ref.domain ?? hostOf(ref.url ?? "") })),
          citedDomains: [...new Set((aiItem.references ?? []).map((ref) => ref.domain ?? hostOf(ref.url ?? "")).filter(Boolean))],
        }
      : undefined;

    const paaBlock = items.find((i) => i.type === "people_also_ask");
    const peopleAlsoAsk: PaaItem[] = (paaBlock?.items ?? []).map((q: any, idx: number) => ({
      position: idx + 1,
      question: q.title ?? "",
      snippet: q.expanded_element?.[0]?.description ?? undefined,
      url: q.expanded_element?.[0]?.url ?? undefined,
    }));

    const relatedBlock = items.find((i) => i.type === "related_searches");
    const relatedSearches: RelatedItem[] = (relatedBlock?.items ?? []).map((q: any, idx: number) => ({
      position: idx + 1,
      query: typeof q === "string" ? q : q.title ?? q.keyword ?? "",
    }));

    const contentHash = createHash("sha256")
      .update(JSON.stringify({ e: raw.request.engine, l: raw.request.locale, d: raw.request.device, o: organic.map((o) => o.url) }))
      .digest("hex");

    return {
      query: raw.request.query,
      engine: raw.request.engine,
      locale: raw.request.locale,
      device: raw.request.device,
      fetchedAt: new Date().toISOString(),
      totalResults: r.se_results_count,
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

function extractAiText(ai: any): string {
  let text = typeof ai.markdown === "string" ? ai.markdown : (ai.items ?? []).map((el: any) => el.text ?? el.title ?? "").filter(Boolean).join(" ");
  // Strip markdown citation artifacts: [[1]](url) → "", [text](url) → "text".
  text = text
    .replace(/\[\[?\d+\]?\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || "AI Overview present on this SERP";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

interface DfsItem {
  type: string;
  rank_group?: number;
  rank_absolute?: number;
  title?: string;
  url?: string;
  domain?: string;
  description?: string;
  items?: any[];
  references?: { title?: string; url?: string; domain?: string }[];
  markdown?: string;
}
interface DfsResult {
  keyword?: string;
  se_results_count?: number;
  items?: DfsItem[];
}
