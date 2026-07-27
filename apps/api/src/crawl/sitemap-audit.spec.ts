import { parseDisallows, pathBlocked } from "./sitemap-audit";

describe("parseDisallows", () => {
  it("collects Disallow rules under User-agent: *", () => {
    const robots = [
      "User-agent: *",
      "Disallow: /admin",
      "Disallow: /cart",
      "Allow: /",
    ].join("\n");
    expect(parseDisallows(robots)).toEqual(["/admin", "/cart"]);
  });

  it("ignores rules scoped to other agents", () => {
    const robots = [
      "User-agent: Googlebot",
      "Disallow: /secret",
      "User-agent: *",
      "Disallow: /admin",
    ].join("\n");
    expect(parseDisallows(robots)).toEqual(["/admin"]);
  });

  it("skips comments and empty Disallow", () => {
    const robots = "User-agent: *\n# a comment\nDisallow:\nDisallow: /x # inline";
    expect(parseDisallows(robots)).toEqual(["/x"]);
  });
});

describe("pathBlocked", () => {
  it("matches by prefix", () => {
    expect(pathBlocked("/admin/settings", "/admin")).toBe(true);
    expect(pathBlocked("/about", "/admin")).toBe(false);
  });

  it("honours the * wildcard", () => {
    expect(pathBlocked("/blog/2024/post", "/blog/*/post")).toBe(true);
    expect(pathBlocked("/p/abc.php", "/*.php")).toBe(true);
  });

  it("honours the $ end-anchor", () => {
    expect(pathBlocked("/page.html", "/*.html$")).toBe(true);
    expect(pathBlocked("/page.html?x=1", "/*.html$")).toBe(false);
  });
});
