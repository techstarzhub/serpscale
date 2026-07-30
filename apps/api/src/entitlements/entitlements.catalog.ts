// SINGLE SOURCE OF TRUTH for what a plan can gate. Everything — the admin plan
// editor (checkboxes), the /auth/me entitlements, the backend feature guard and
// the dashboard tab gating — derives from THIS file. Nothing about plans is
// hardcoded per-place; the super admin toggles these per plan, and the values
// (which features / how many of each limit) are 100% data-driven.
//
// A module `key` intentionally matches the dashboard tab key where one exists,
// so gating needs no extra mapping: a project tab is shown iff the plan's
// `features` array contains that tab's key.

export interface ModuleDef {
  key: string; // stable id stored in Plan.features and matched by tab key
  label: string; // human name shown to the super admin + on pricing
  tab?: string; // dashboard tab this unlocks (omitted for non-tab capabilities)
  group: string; // grouping for the admin editor
}

export interface LimitDef {
  key: string; // stored in Plan.limits
  label: string;
  // What to count for usage/enforcement: a Prisma model scoped to the org.
  countModel?: "project" | "user" | "client" | "rankKeyword" | "savedKeyword";
}

// Gateable capabilities. `overview` is intentionally omitted — it is always on.
export const MODULE_CATALOG: ModuleDef[] = [
  { key: "keywords", label: "Keyword research", tab: "keywords", group: "Research" },
  { key: "content", label: "Content tools (blog, meta, rewriter)", tab: "content", group: "Research" },
  { key: "ranks", label: "Rank tracking", tab: "ranks", group: "Tracking" },
  { key: "competitors", label: "Competitor analysis", tab: "competitors", group: "Research" },
  { key: "traffic", label: "Traffic analytics (GA4)", tab: "traffic", group: "Analytics" },
  { key: "backlinks", label: "Backlink monitoring", tab: "backlinks", group: "Analytics" },
  { key: "domain", label: "Domain analysis", tab: "domain", group: "Analytics" },
  { key: "ai", label: "AI Visibility (ChatGPT, Perplexity, Gemini)", tab: "ai", group: "AI" },
  { key: "audit", label: "Site audit", tab: "audit", group: "Tracking" },
  { key: "copilot", label: "AI Copilot", tab: "copilot", group: "AI" },
  { key: "white_label", label: "White-label reports", group: "Agency" },
  { key: "client_dashboards", label: "Dedicated client dashboards", group: "Agency" },
];

// Numeric caps a plan can set (∞ when unset / <= 0).
export const LIMIT_CATALOG: LimitDef[] = [
  { key: "projects", label: "Campaigns", countModel: "project" },
  { key: "keywords", label: "Keywords", countModel: "rankKeyword" },
  { key: "seats", label: "Team members", countModel: "user" },
  { key: "clients", label: "Clients", countModel: "client" },
  { key: "rankChecksPerDay", label: "Rank checks / day" },
  { key: "crawlPagesPerMonth", label: "Crawl pages / month" },
];

export const MODULE_KEYS = MODULE_CATALOG.map((m) => m.key);
export const ALWAYS_ON_TABS = ["overview", "settings"];

/** The catalog served to the admin UI + pricing, so the client never hardcodes it. */
export function catalogPayload() {
  return { modules: MODULE_CATALOG, limits: LIMIT_CATALOG };
}

const LABEL_BY_KEY = new Map(MODULE_CATALOG.map((m) => [m.key, m.label]));

/** Map stored feature keys → human labels for display (billing, pricing). */
export function featureLabels(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return (features as string[]).map((k) => LABEL_BY_KEY.get(k)).filter((v): v is string => !!v);
}

/** Attach `featureLabels` to a plan object for display surfaces. */
export function withFeatureLabels<T extends { features?: unknown }>(plan: T): T & { featureLabels: string[] } {
  return { ...plan, featureLabels: featureLabels(plan.features) };
}
