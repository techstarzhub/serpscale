// Structured-data (JSON-LD) validity checker.
//
// The crawler already records WHICH schema types are present; this verifies they
// are actually COMPLETE. A schema block missing its required fields is invalid to
// Google and silently drops the page from rich-result eligibility — presence
// alone is a false sense of security. Field requirements mirror Google's
// rich-result docs, kept high-precision so we only flag genuine gaps.
import type { Issue } from "./crawler";

// Required fields per schema type (Google rich-result requirements, trimmed to
// the fields whose absence actually disqualifies the result).
const REQUIRED: Record<string, string[]> = {
  Organization: ["name"],
  LocalBusiness: ["name", "address", "telephone"],
  Article: ["headline", "author", "datePublished"],
  BlogPosting: ["headline", "author", "datePublished"],
  NewsArticle: ["headline", "author", "datePublished"],
  BreadcrumbList: ["itemListElement"],
  Review: ["author", "reviewRating"],
  Recipe: ["name", "recipeIngredient"],
  Event: ["name", "startDate", "location"],
  FAQPage: ["mainEntity"],
  VideoObject: ["name", "thumbnailUrl", "uploadDate"],
  JobPosting: ["title", "datePosted", "hiringOrganization", "jobLocation"],
};

// Every schema.org type that inherits LocalBusiness — they all need NAP fields.
const LOCALBUSINESS_SUBTYPES = new Set([
  "LocalBusiness", "Restaurant", "Store", "ProfessionalService", "MedicalBusiness",
  "LegalService", "FinancialService", "HomeAndConstructionBusiness", "AutomotiveBusiness",
  "FoodEstablishment", "Dentist", "Physician", "Attorney", "Plumber", "Electrician",
  "GeneralContractor", "RealEstateAgent", "InsuranceAgency", "AccountingService",
  "HealthAndBeautyBusiness", "BeautySalon", "HairSalon", "DaySpa", "Gym", "Hotel", "Lodging",
]);

type Node = Record<string, unknown>;

function isObj(v: unknown): v is Node {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// A field counts as present only if it's a non-empty value / array / object.
function has(node: Node, field: string): boolean {
  const v = node[field];
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as Node).length > 0;
  return true;
}

function typesOf(node: Node): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

// Walk every node in a JSON-LD tree (handles @graph and nested arrays/objects).
function walk(data: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(data)) {
    data.forEach((d) => walk(d, visit));
  } else if (isObj(data)) {
    if (typesOf(data).length) visit(data);
    for (const key of Object.keys(data)) {
      if (key === "@type" || key === "@context") continue;
      walk(data[key], visit);
    }
  }
}

function offerComplete(offers: unknown): boolean {
  const list = Array.isArray(offers) ? offers : [offers];
  return list.some((o) => {
    if (!isObj(o) || !has(o, "priceCurrency")) return false;
    // Offer needs a flat price; AggregateOffer (a price range) needs lowPrice/highPrice instead.
    if (typesOf(o).includes("AggregateOffer")) return has(o, "lowPrice") && has(o, "highPrice");
    return has(o, "price");
  });
}

// Validate parsed JSON-LD objects; returns one issue per type that is incomplete.
export function validateStructuredData(objects: unknown[]): Issue[] {
  const missingByType = new Map<string, Set<string>>();
  const note = (type: string, field: string) => {
    let s = missingByType.get(type);
    if (!s) { s = new Set(); missingByType.set(type, s); }
    s.add(field);
  };

  for (const obj of objects) {
    walk(obj, (node) => {
      for (const type of typesOf(node)) {
        // LocalBusiness family (any subtype) shares the NAP requirement.
        if (LOCALBUSINESS_SUBTYPES.has(type)) {
          for (const f of REQUIRED.LocalBusiness) if (!has(node, f)) note(type, f);
          continue;
        }
        const req = REQUIRED[type];
        if (req) for (const f of req) if (!has(node, f)) note(type, f);

        // Product needs name + a purchasing/rating signal, and complete offers.
        if (type === "Product") {
          if (!has(node, "name")) note("Product", "name");
          if (!has(node, "offers") && !has(node, "review") && !has(node, "aggregateRating"))
            note("Product", "offers/review/aggregateRating");
          else if (has(node, "offers") && !offerComplete(node.offers))
            note("Product", "offers.price/priceCurrency");
        }
      }
    });
  }

  const issues: Issue[] = [];
  for (const [type, fields] of missingByType) {
    issues.push({
      code: "incomplete-structured-data",
      severity: "warning",
      category: "technical",
      message: `${type} schema is missing required field(s): ${[...fields].join(", ")} — invalid for rich results`,
    });
  }
  return issues;
}
