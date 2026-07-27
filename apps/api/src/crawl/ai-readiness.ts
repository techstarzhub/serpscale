// Unified AI-Readiness (GEO) score.
//
// The crawl already emits the individual AI/answer-engine signals (schema
// coverage & validity, llms.txt, AI-crawler access, chunkable answer structure,
// render-independence). This folds them into ONE 0-100 score with a weighted
// breakdown, so "how visible is this site to ChatGPT / Perplexity / AI Overviews"
// is a single headline number the UI can show next to the health score.
//
// Pure and deterministic — takes counts, returns the score — so it is trivially
// unit-tested and never touches the network.

export interface AiReadinessInput {
  pagesCrawled: number;
  poorAnswerStructurePages: number; // pages flagged "poor-answer-structure"
  pagesNoSchema: number; // pages with no structured data
  pagesIncompleteSchema: number; // pages whose schema is missing required fields
  jsDependentPages: number; // pages whose content only appears after JS
  hasLlmsTxt: boolean;
  aiCrawlersBlocked: boolean;
}

export interface AiReadinessFactor {
  key: string;
  label: string;
  score: number; // 0-100 for this factor
  weight: number; // 0-1
  detail: string;
}

export interface AiReadiness {
  score: number; // 0-100 overall
  grade: "A" | "B" | "C" | "D" | "F";
  factors: AiReadinessFactor[];
}

function grade(score: number): AiReadiness["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function computeAiReadiness(input: AiReadinessInput): AiReadiness {
  const pages = Math.max(0, input.pagesCrawled);
  const frac = (n: number) => (pages > 0 ? Math.max(0, Math.min(1, n / pages)) : 0);

  // Schema coverage: reward pages that have VALID structured data. A page with
  // schema present but incomplete counts as a partial miss.
  const withSchema = Math.max(0, pages - input.pagesNoSchema);
  const validSchema = Math.max(0, withSchema - input.pagesIncompleteSchema);
  const schemaScore = pages > 0 ? (validSchema / pages) * 100 : 0;

  // Answer structure: fraction of pages that are chunkable (not a wall of text).
  // With no pages we have no positive evidence, so it scores 0 (not a free 100).
  const answerScore = pages > 0 ? (1 - frac(input.poorAnswerStructurePages)) * 100 : 0;

  // Render independence: content visible without executing JS.
  const renderScore = pages > 0 ? (1 - frac(input.jsDependentPages)) * 100 : 0;

  // Access + llms.txt are binary site-level gates.
  const accessScore = input.aiCrawlersBlocked ? 0 : 100;
  const llmsScore = input.hasLlmsTxt ? 100 : 0;

  const factors: AiReadinessFactor[] = [
    {
      key: "structured-data",
      label: "Structured data coverage & validity",
      score: clamp(schemaScore),
      weight: 0.3,
      detail: `${validSchema}/${pages} pages have valid schema`,
    },
    {
      key: "answer-structure",
      label: "Chunkable answer structure",
      score: clamp(answerScore),
      weight: 0.25,
      detail: `${input.poorAnswerStructurePages} page(s) are a wall of text`,
    },
    {
      key: "ai-crawler-access",
      label: "AI crawler access (robots.txt)",
      score: accessScore,
      weight: 0.2,
      detail: input.aiCrawlersBlocked ? "AI answer-engine crawlers are blocked" : "AI crawlers allowed",
    },
    {
      key: "render-independence",
      label: "Content visible without JavaScript",
      score: clamp(renderScore),
      weight: 0.15,
      detail: `${input.jsDependentPages} page(s) need JS to show content`,
    },
    {
      key: "llms-txt",
      label: "llms.txt present",
      score: llmsScore,
      weight: 0.1,
      detail: input.hasLlmsTxt ? "llms.txt found" : "No llms.txt",
    },
  ];

  const score = clamp(factors.reduce((sum, f) => sum + f.score * f.weight, 0));
  return { score, grade: grade(score), factors };
}
