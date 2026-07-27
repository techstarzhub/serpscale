import { RankingService } from "./ranking.service";
import type { NormalizedSerp } from "./serp.types";

function serp(domains: string[]): NormalizedSerp {
  return {
    query: "q", engine: "google", locale: { country: "US", language: "en" }, device: "desktop",
    fetchedAt: new Date().toISOString(), organic: domains.map((d, i) => ({ position: i + 1, rank: i + 1, title: d, url: `https://${d}/x`, domain: d })),
    features: [], peopleAlsoAsk: [], relatedSearches: [],
    metadata: { provider: "mock", latencyMs: 1, contentHash: "h", totalOrganic: domains.length, featureTypes: [] },
  };
}

describe("RankingService", () => {
  const svc = new RankingService();

  it("finds a domain's best rank, ignoring www", () => {
    const r = svc.findRank(serp(["a.com", "b.com", "c.com"]), "www.b.com");
    expect(r.rank).toBe(2);
    expect(r.position).toBe(2);
  });

  it("returns null rank when the domain is absent", () => {
    expect(svc.findRank(serp(["a.com"]), "z.com").rank).toBeNull();
  });

  it("computes deltas (negative = improved)", () => {
    expect(svc.computeDelta(3, 7)).toBe(-4);
    expect(svc.computeDelta(null, 7)).toBeNull();
  });

  it("scores share of voice higher for better ranks", () => {
    const top = svc.shareOfVoice([serp(["me.com", "x.com"])], "me.com");
    const low = svc.shareOfVoice([serp(["x.com", "me.com"])], "me.com");
    expect(top).toBeGreaterThan(low);
    expect(top).toBeLessThanOrEqual(1);
  });
});
