import { prBranchName, composePrBody } from "./github";
import { buildRemediationPlan } from "./remediation";

describe("prBranchName", () => {
  it("is deterministic and filesystem-safe", () => {
    expect(prBranchName("crawl_ABC123")).toBe("seo-autofix/crawl-abc123");
    expect(prBranchName("crawl_ABC123")).toBe(prBranchName("crawl_ABC123"));
  });

  it("falls back to a default for an empty seed", () => {
    expect(prBranchName("")).toBe("seo-autofix/audit");
    expect(prBranchName("!!!")).toBe("seo-autofix/audit");
  });
});

describe("composePrBody", () => {
  it("lists changed files and manual items", () => {
    const plan = buildRemediationPlan(["no-llms-txt", "missing-title"], { domain: "acme.com" });
    const body = composePrBody(plan, { domain: "acme.com" });
    expect(body).toContain("acme.com");
    expect(body).toContain("public/llms.txt");
    expect(body).toContain("no-llms-txt");
    expect(body).toContain("Needs a manual/template change");
    expect(body).toContain("missing-title");
  });
});
