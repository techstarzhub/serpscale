import { robotsBlocksResources, EXPOSED_FILES } from "./tech-checks";

describe("robotsBlocksResources", () => {
  it("flags robots that block css/js/asset paths for *", () => {
    expect(robotsBlocksResources("User-agent: *\nDisallow: /assets")).toBe(true);
    expect(robotsBlocksResources("User-agent: *\nDisallow: /_next/")).toBe(true);
    expect(robotsBlocksResources("User-agent: *\nDisallow: /*.css")).toBe(true);
  });

  it("does not flag normal disallows", () => {
    expect(robotsBlocksResources("User-agent: *\nDisallow: /admin\nDisallow: /cart")).toBe(false);
  });

  it("ignores rules scoped to other bots", () => {
    expect(robotsBlocksResources("User-agent: BadBot\nDisallow: /assets")).toBe(false);
  });
});

describe("EXPOSED_FILES signatures", () => {
  it("match real file contents, not an SPA HTML shell", () => {
    const cfg = EXPOSED_FILES.find((f) => f.path === "/.git/config")!;
    expect(cfg.sig.test("[core]\n\trepositoryformatversion = 0")).toBe(true);
    expect(cfg.sig.test("<!doctype html><html>...")).toBe(false);

    const env = EXPOSED_FILES.find((f) => f.path === "/.env")!;
    expect(env.sig.test("APP_KEY=base64:xxxx\nDB_HOST=localhost")).toBe(true);
    expect(env.sig.test("<html>not found</html>")).toBe(false);
  });
});
