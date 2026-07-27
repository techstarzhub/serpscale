import * as cheerio from "cheerio";
import { eeatSignals, detectEeat } from "./eeat";

const load = (html: string) => cheerio.load(html);

describe("eeatSignals", () => {
  it("detects an author byline", () => {
    expect(eeatSignals(load('<div class="author">By Jane</div>')).hasAuthor).toBe(true);
    expect(eeatSignals(load('<meta name="author" content="Jane">')).hasAuthor).toBe(true);
    expect(eeatSignals(load("<p>no author here</p>")).hasAuthor).toBe(false);
  });

  it("detects contact affordances", () => {
    expect(eeatSignals(load('<a href="tel:+15550100">Call</a>')).hasContact).toBe(true);
    expect(eeatSignals(load('<a href="/contact-us">Contact</a>')).hasContact).toBe(true);
    expect(eeatSignals(load("<address>1 Main St</address>")).hasContact).toBe(true);
    expect(eeatSignals(load("<p>nothing</p>")).hasContact).toBe(false);
  });

  it("detects testimonials and trust badges", () => {
    expect(eeatSignals(load('<section class="testimonials">...</section>')).hasTestimonial).toBe(true);
    expect(eeatSignals(load('<img alt="SSL Secured badge" src="/x.png">')).hasTrustBadge).toBe(true);
    expect(eeatSignals(load('<img alt="hero" src="/norton-verified.png">')).hasTrustBadge).toBe(true);
    expect(eeatSignals(load('<img alt="cat" src="/cat.png">')).hasTrustBadge).toBe(false);
  });
});

describe("detectEeat", () => {
  it("flags a long content page with no author", () => {
    const issues = detectEeat(load("<p>content</p>"), { wordCount: 800, structuredTypes: [] });
    expect(issues.some((i) => i.code === "no-author")).toBe(true);
  });

  it("flags an Article schema page with no author regardless of length", () => {
    const issues = detectEeat(load("<p>short</p>"), { wordCount: 100, structuredTypes: ["BlogPosting"] });
    expect(issues.some((i) => i.code === "no-author")).toBe(true);
  });

  it("does not flag a short thin page for authorship", () => {
    const issues = detectEeat(load("<p>hi</p>"), { wordCount: 120, structuredTypes: [] });
    expect(issues.some((i) => i.code === "no-author")).toBe(false);
  });

  it("raises weak-eeat when a page shows zero trust signals", () => {
    const issues = detectEeat(load("<p>text</p>"), { wordCount: 400, structuredTypes: [] });
    expect(issues.some((i) => i.code === "weak-eeat")).toBe(true);
  });

  it("does not raise weak-eeat when any trust signal exists", () => {
    const issues = detectEeat(load('<a href="tel:+15550100">call</a><p>text</p>'), { wordCount: 400, structuredTypes: [] });
    expect(issues.some((i) => i.code === "weak-eeat")).toBe(false);
  });
});
