import { contentShingles, detectNearDuplicates } from "./near-duplicate";

// Marketing template repeated on EVERY page (nav/hero/footer/CTA boilerplate).
const boiler =
  "welcome to tech starz hub the best digital marketing agency in india we help businesses grow " +
  "contact us today for a free quote and consultation follow us on social media platforms subscribe now";

// Genuinely different page bodies.
const seo = "search engine optimization services improve your google rankings organic traffic keyword research technical site audits quality backlink building local seo strategy for small business";
const web = "web development services using react and nextjs custom ecommerce websites progressive mobile applications rest api integration cloud deployment database design and devops";
const app = "mobile app development with flutter react native native ios and android cross platform performance push notifications offline support app store submission and maintenance";
const blog = "how to grow your instagram followers organically in twenty twenty six using reels stories consistent posting engagement strategy hashtag research and community building tips";

const page = (body: string) => contentShingles(`${boiler} ${body}`);

describe("contentShingles", () => {
  it("produces shingle hashes and skips thin text", () => {
    expect(contentShingles(seo).length).toBeGreaterThan(5);
    expect(contentShingles("too short")).toEqual([]);
  });
});

describe("detectNearDuplicates (boilerplate-aware)", () => {
  it("does NOT flag pages that only share the site template (different real content)", () => {
    const pages = [
      { url: "/services/seo", shingles: page(seo) },
      { url: "/services/web", shingles: page(web) },
      { url: "/services/app", shingles: page(app) },
      { url: "/blog", shingles: page(blog) },
    ];
    // All share `boiler`, but real bodies differ → no cluster.
    expect(detectNearDuplicates(pages).clusters).toHaveLength(0);
  });

  it("DOES flag pages whose real content is near-identical", () => {
    const pages = [
      { url: "/services/web", shingles: page(web) },
      { url: "/services/app", shingles: page(app) },
      { url: "/blog", shingles: page(blog) },
      // Two pages with the SAME body (e.g. a template copied per city) → real dup.
      { url: "/seo-india", shingles: page(seo + " serving clients across india") },
      { url: "/seo-mumbai", shingles: page(seo + " serving clients across mumbai") },
    ];
    const res = detectNearDuplicates(pages);
    expect(res.clusters).toHaveLength(1);
    expect(res.clusters[0].urls.sort()).toEqual(["/seo-india", "/seo-mumbai"]);
  });

  it("skips pages without shingles and returns empty for <2 pages", () => {
    expect(detectNearDuplicates([{ url: "/a", shingles: [] }]).clusters).toHaveLength(0);
    expect(detectNearDuplicates([]).pagesInvolved).toBe(0);
  });
});
