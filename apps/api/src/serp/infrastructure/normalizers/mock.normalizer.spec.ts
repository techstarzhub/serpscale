import { MockSerpProvider } from "../providers/mock.provider";
import { MockNormalizer } from "./mock.normalizer";
import type { SerpRequest } from "../../domain/serp.types";

const req: SerpRequest = { query: "seo tools", engine: "google", locale: { country: "US", language: "en" }, device: "desktop" };

describe("MockNormalizer (contract)", () => {
  const provider = new MockSerpProvider();
  const normalizer = new MockNormalizer();

  it("maps a raw provider payload into the normalized SERP shape", async () => {
    const raw = await provider.fetch(req);
    const serp = normalizer.normalize(raw);

    expect(serp.query).toBe("seo tools");
    expect(serp.engine).toBe("google");
    expect(serp.organic).toHaveLength(10);
    expect(serp.organic[0]).toMatchObject({ position: 1, rank: 1 });
    expect(serp.organic.every((o) => o.domain && o.url.startsWith("https://"))).toBe(true);
    expect(serp.metadata.contentHash).toHaveLength(64); // sha256 hex
    expect(serp.metadata.totalOrganic).toBe(10);
    expect(serp.peopleAlsoAsk.length).toBeGreaterThan(0);
    expect(serp.relatedSearches.length).toBeGreaterThan(0);
  });

  it("produces a stable content hash for the same query (deterministic)", async () => {
    const a = normalizer.normalize(await provider.fetch(req));
    const b = normalizer.normalize(await provider.fetch(req));
    expect(a.metadata.contentHash).toBe(b.metadata.contentHash);
  });

  it("differs for different queries", async () => {
    const a = normalizer.normalize(await provider.fetch(req));
    const b = normalizer.normalize(await provider.fetch({ ...req, query: "keyword research" }));
    expect(a.metadata.contentHash).not.toBe(b.metadata.contentHash);
  });
});
