import { buildRemediationPlan } from "./remediation";

const ctx = { domain: "acme.com", brand: "Acme" };

describe("buildRemediationPlan", () => {
  it("creates llms.txt for no-llms-txt", () => {
    const plan = buildRemediationPlan(["no-llms-txt"], ctx);
    const f = plan.files.find((x) => x.path === "public/llms.txt");
    expect(f).toBeDefined();
    expect(f!.action).toBe("create");
    expect(f!.content).toContain("acme.com");
  });

  it("creates robots.txt with a Sitemap line for no-robots", () => {
    const plan = buildRemediationPlan(["no-robots"], ctx);
    const f = plan.files.find((x) => x.path === "public/robots.txt");
    expect(f!.action).toBe("create");
    expect(f!.content).toContain("Sitemap: https://acme.com/sitemap.xml");
  });

  it("appends only the Sitemap line when robots.txt already exists", () => {
    const plan = buildRemediationPlan(["sitemap-not-in-robots"], ctx);
    const f = plan.files.find((x) => x.path === "public/robots.txt");
    expect(f!.action).toBe("append");
    expect(f!.content).toContain("Sitemap: https://acme.com/sitemap.xml");
  });

  it("prefers a full robots.txt create over the append when both codes present", () => {
    const plan = buildRemediationPlan(["no-robots", "sitemap-not-in-robots"], ctx);
    const robots = plan.files.filter((x) => x.path === "public/robots.txt");
    expect(robots).toHaveLength(1);
    expect(robots[0].action).toBe("create");
  });

  it("emits only the missing security headers", () => {
    const plan = buildRemediationPlan(["no-hsts", "no-xcto"], ctx);
    const f = plan.files.find((x) => x.path === "public/_headers");
    expect(f!.content).toContain("Strict-Transport-Security");
    expect(f!.content).toContain("X-Content-Type-Options");
    expect(f!.content).not.toContain("Content-Security-Policy");
  });

  it("routes per-page issues to the manual list, not files", () => {
    const plan = buildRemediationPlan(["missing-title", "img-no-alt"], ctx);
    expect(plan.files).toHaveLength(0);
    expect(plan.manual.map((m) => m.code).sort()).toEqual(["img-no-alt", "missing-title"]);
  });

  it("ignores unknown codes", () => {
    const plan = buildRemediationPlan(["totally-unknown-code"], ctx);
    expect(plan.files).toHaveLength(0);
    expect(plan.manual).toHaveLength(0);
  });
});
