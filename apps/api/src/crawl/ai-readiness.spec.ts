import { computeAiReadiness, type AiReadinessInput } from "./ai-readiness";

const base: AiReadinessInput = {
  pagesCrawled: 10,
  poorAnswerStructurePages: 0,
  pagesNoSchema: 0,
  pagesIncompleteSchema: 0,
  jsDependentPages: 0,
  hasLlmsTxt: true,
  aiCrawlersBlocked: false,
};

describe("computeAiReadiness", () => {
  it("gives a perfect site an A / 100", () => {
    const r = computeAiReadiness(base);
    expect(r.score).toBe(100);
    expect(r.grade).toBe("A");
  });

  it("bottoms out for a site failing every factor", () => {
    const r = computeAiReadiness({
      pagesCrawled: 10,
      poorAnswerStructurePages: 10,
      pagesNoSchema: 10,
      pagesIncompleteSchema: 0,
      jsDependentPages: 10,
      hasLlmsTxt: false,
      aiCrawlersBlocked: true,
    });
    expect(r.score).toBe(0);
    expect(r.grade).toBe("F");
  });

  it("penalizes blocked AI crawlers by exactly its weight (20 pts)", () => {
    const r = computeAiReadiness({ ...base, aiCrawlersBlocked: true });
    expect(r.score).toBe(80);
  });

  it("counts incomplete schema as a partial miss", () => {
    const allValid = computeAiReadiness({ ...base, pagesNoSchema: 0, pagesIncompleteSchema: 0 });
    const halfIncomplete = computeAiReadiness({ ...base, pagesNoSchema: 0, pagesIncompleteSchema: 5 });
    expect(halfIncomplete.score).toBeLessThan(allValid.score);
  });

  it("weights sum to 1 so the max is 100", () => {
    const total = computeAiReadiness(base).factors.reduce((s, f) => s + f.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("handles a zero-page crawl without dividing by zero", () => {
    const r = computeAiReadiness({ ...base, pagesCrawled: 0, hasLlmsTxt: false, aiCrawlersBlocked: true });
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBe(0);
  });

  it("exposes a breakdown the UI can render", () => {
    const r = computeAiReadiness(base);
    expect(r.factors.map((f) => f.key)).toEqual([
      "structured-data",
      "answer-structure",
      "ai-crawler-access",
      "render-independence",
      "llms-txt",
    ]);
  });
});
