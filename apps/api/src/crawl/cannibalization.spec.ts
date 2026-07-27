import { detectCannibalization } from "./cannibalization";

const start = "https://acme.com";

describe("detectCannibalization", () => {
  it("clusters pages competing for the same keywords", () => {
    const pages = [
      { url: "https://acme.com/video-editing-services", title: "Video Editing Services | Acme" },
      { url: "https://acme.com/professional-video-editing", title: "Professional Video Editing Services" },
      { url: "https://acme.com/about", title: "About Our Team" },
    ];
    const res = detectCannibalization(pages, start);
    expect(res.clusters).toHaveLength(1);
    expect(res.clusters[0].pages.map((p) => p.url).sort()).toEqual([
      "https://acme.com/professional-video-editing",
      "https://acme.com/video-editing-services",
    ]);
    expect(res.clusters[0].keywords).toEqual(expect.arrayContaining(["video", "editing"]));
    expect(res.pagesInvolved).toBe(2);
  });

  it("does not link unrelated pages", () => {
    const pages = [
      { url: "https://acme.com/pricing", title: "Pricing Plans" },
      { url: "https://acme.com/careers", title: "Careers and Jobs" },
    ];
    expect(detectCannibalization(pages, start).clusters).toHaveLength(0);
  });

  it("strips the brand name so it can't create false clusters", () => {
    const pages = [
      { url: "https://acme.com/a", title: "Acme Widgets" },
      { url: "https://acme.com/b", title: "Acme Gadgets" },
    ];
    // Only shared token is the brand -> no cluster.
    expect(detectCannibalization(pages, start).clusters).toHaveLength(0);
  });

  it("groups 3 transitively-competing pages into one cluster", () => {
    const pages = [
      { url: "https://acme.com/1", title: "Cheap Flights to Paris" },
      { url: "https://acme.com/2", title: "Cheap Flights Paris Deals" },
      { url: "https://acme.com/3", title: "Book Cheap Flights Paris" },
    ];
    const res = detectCannibalization(pages, start);
    expect(res.clusters).toHaveLength(1);
    expect(res.clusters[0].pages).toHaveLength(3);
  });

  it("ignores pages without a title", () => {
    const pages = [
      { url: "https://acme.com/1", title: null },
      { url: "https://acme.com/2", title: "" },
    ];
    expect(detectCannibalization(pages, start).pagesInvolved).toBe(0);
  });
});
