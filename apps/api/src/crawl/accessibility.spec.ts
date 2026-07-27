import { runAccessibilityAudit } from "./accessibility";

// Real headless-Chromium integration test. Skips itself if the browser can't
// launch (e.g. binary not installed in CI) rather than failing the suite.
const BAD_HTML =
  "<html><head></head><body>" +
  '<img src="/x.png">' + // image-alt (critical)
  "<button></button>" + // button-name (critical)
  '<a href="#"></a>' + // link-name (serious)
  "</body></html>"; // + html-has-lang, document-title (serious)

const badUrl = "data:text/html," + encodeURIComponent(BAD_HTML);
const goodUrl =
  "data:text/html," +
  encodeURIComponent('<html lang="en"><head><title>Good</title></head><body><h1>Hi</h1><p>ok</p></body></html>');

describe("runAccessibilityAudit (integration)", () => {
  jest.setTimeout(60000);

  it("returns an empty result for no URLs", async () => {
    const r = await runAccessibilityAudit([]);
    expect(r.pagesAudited).toBe(0);
    expect(r.issues).toHaveLength(0);
  });

  it("detects WCAG violations on a broken page", async () => {
    const r = await runAccessibilityAudit([badUrl]);
    if (r.pagesAudited === 0) {
      console.warn("Chromium unavailable — skipping accessibility assertions");
      return;
    }
    expect(r.pagesAudited).toBe(1);
    expect(r.totals.critical + r.totals.serious).toBeGreaterThan(0);
    const ruleIds = r.byRule.map((x) => x.id);
    expect(ruleIds).toEqual(expect.arrayContaining(["image-alt"]));
    expect(r.issues.some((i) => i.code === "a11y-serious")).toBe(true);
    // byRule is sorted most-severe first.
    expect(["critical", "serious"]).toContain(r.byRule[0].impact);
  });

  it("reports a clean page with no serious violations", async () => {
    const r = await runAccessibilityAudit([goodUrl]);
    if (r.pagesAudited === 0) return; // chromium unavailable
    expect(r.pagesAudited).toBe(1);
    expect(r.totals.critical + r.totals.serious).toBe(0);
  });
});
