/**
 * Provider-agnostic normalized SERP model — the anti-corruption contract.
 *
 * Every provider (mock, DataForSEO, SerpAPI, scraper) maps INTO this shape via a
 * normalizer. No feature or use-case ever sees a provider's raw JSON, so swapping
 * providers never touches business logic.
 */

export type Engine = "google" | "bing" | "yahoo" | "duckduckgo";
export type DeviceName = "desktop" | "mobile" | "tablet";

export interface Locale {
  country: string; // ISO-3166 alpha-2, e.g. "US"
  language: string; // ISO-639, e.g. "en"
}

export interface Sitelink {
  title: string;
  url: string;
}

export interface OrganicItem {
  /** Absolute position on the page (features included). */
  position: number;
  /** Organic-only rank (features excluded) — what rank tracking reports. */
  rank: number;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  sitelinks?: Sitelink[];
}

/** Discriminated union → exhaustive, compiler-checked feature handling. */
export type SerpFeatureItem =
  | { type: "featured_snippet"; position: number; content: string; sourceUrl: string; ownedByDomain?: string }
  | { type: "ai_overview"; position: number; present: true }
  | { type: "video_pack"; position: number; count: number }
  | { type: "image_pack"; position: number; count: number }
  | { type: "ads"; position: "top" | "bottom"; count: number }
  | { type: "local_pack"; position: number; count: number };

export interface AiOverviewItem {
  content: string;
  sources: { title: string; url: string; domain: string }[];
  citedDomains: string[];
}

export interface PaaItem {
  position: number;
  question: string;
  snippet?: string;
  url?: string;
}

export interface RelatedItem {
  position: number;
  query: string;
}

export interface SerpMetadataItem {
  provider: string;
  latencyMs: number;
  contentHash: string;
  totalOrganic: number;
  featureTypes: string[];
}

export interface NormalizedSerp {
  query: string;
  engine: Engine;
  locale: Locale;
  device: DeviceName;
  fetchedAt: string; // ISO-8601
  totalResults?: number;
  organic: OrganicItem[];
  features: SerpFeatureItem[];
  aiOverview?: AiOverviewItem;
  peopleAlsoAsk: PaaItem[];
  relatedSearches: RelatedItem[];
  metadata: SerpMetadataItem;
}

/** Request handed to a provider (already validated + locale-resolved). */
export interface SerpRequest {
  query: string;
  engine: Engine;
  locale: Locale;
  device: DeviceName;
}

/** Opaque raw provider payload — only its matching normalizer understands it. */
export interface RawProviderResult {
  provider: string;
  latencyMs: number;
  request: SerpRequest;
  payload: unknown;
}
