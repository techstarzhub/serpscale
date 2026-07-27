import * as cheerio from "cheerio";
import { detectOnPageIssues } from "./onpage-checks";

const ctx = (over: Partial<{ url: string; canonical: string | null; depth: number }> = {}) => ({
  url: "https://acme.com/page",
  canonical: null,
  depth: 1,
  ...over,
});
const codes = (html: string, c = ctx()) => detectOnPageIssues(cheerio.load(html), c).map((i) => i.code);

describe("detectOnPageIssues", () => {
  it("flags multiple title tags", () => {
    expect(codes("<title>A</title><title>B</title>")).toContain("multiple-title");
    expect(codes("<title>A</title>")).not.toContain("multiple-title");
  });

  it("flags missing charset and favicon", () => {
    expect(codes("<html><head></head></html>")).toEqual(expect.arrayContaining(["missing-charset", "missing-favicon"]));
    expect(codes('<meta charset="utf-8"><link rel="icon" href="/f.ico">')).toEqual(
      expect.not.arrayContaining(["missing-charset", "missing-favicon"]),
    );
  });

  it("flags images without dimensions", () => {
    expect(codes('<img src="/a.jpg">')).toContain("img-no-dimensions");
    expect(codes('<img src="/a.jpg" width="10" height="10">')).not.toContain("img-no-dimensions");
  });

  it("flags nofollow internal links", () => {
    expect(codes('<a href="/about" rel="nofollow">About</a>')).toContain("nofollow-internal");
    // external nofollow is fine, not flagged as internal-equity leak
    expect(codes('<a href="https://other.com" rel="nofollow">x</a>')).not.toContain("nofollow-internal");
  });

  it("flags generic anchor text only past the noise threshold", () => {
    expect(codes('<a href="/a">click here</a><a href="/b">read more</a>')).not.toContain("generic-anchor");
    expect(codes('<a href="/a">click here</a><a href="/b">read more</a><a href="/c">learn more</a>')).toContain("generic-anchor");
  });

  it("flags a canonical pointing to another domain", () => {
    expect(codes("", ctx({ canonical: "https://evil.com/page" }))).toContain("canonical-to-external");
    expect(codes("", ctx({ canonical: "https://www.acme.com/page" }))).not.toContain("canonical-to-external");
    expect(codes("", ctx({ canonical: "/page" }))).not.toContain("canonical-to-external");
  });

  it("flags pages buried too deep", () => {
    expect(codes("", ctx({ depth: 4 }))).toContain("deep-page");
    expect(codes("", ctx({ depth: 2 }))).not.toContain("deep-page");
  });

  it("treats a subdomain canonical as same-site (not external)", () => {
    expect(codes("", ctx({ canonical: "https://blog.acme.com/page" }))).not.toContain("canonical-to-external");
  });

  it("flags a relative canonical", () => {
    expect(codes("", ctx({ canonical: "/page" }))).toContain("canonical-relative");
    expect(codes("", ctx({ canonical: "https://acme.com/page" }))).not.toContain("canonical-relative");
  });

  it("flags empty headings and empty links", () => {
    expect(codes("<h2></h2>")).toContain("empty-heading");
    expect(codes('<a href="/x"></a>')).toContain("empty-link");
    expect(codes('<a href="/x">Real text</a>')).not.toContain("empty-link");
  });

  it("flags deprecated tags and zoom-blocking viewport", () => {
    expect(codes("<center>old</center>")).toContain("deprecated-html");
    expect(codes('<meta name="viewport" content="width=device-width, user-scalable=no">')).toContain("viewport-blocks-zoom");
  });

  it("flags duplicate id attributes", () => {
    expect(codes('<div id="a"></div><span id="a"></span>')).toContain("duplicate-id");
    expect(codes('<div id="a"></div><span id="b"></span>')).not.toContain("duplicate-id");
  });
});
