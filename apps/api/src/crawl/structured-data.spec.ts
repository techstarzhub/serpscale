import { validateStructuredData } from "./structured-data";

describe("validateStructuredData", () => {
  it("passes a complete LocalBusiness", () => {
    const obj = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Acme Co",
      address: { "@type": "PostalAddress", streetAddress: "1 Main St" },
      telephone: "+1-555-0100",
    };
    expect(validateStructuredData([obj])).toHaveLength(0);
  });

  it("flags a LocalBusiness missing address + telephone", () => {
    const obj = { "@type": "LocalBusiness", name: "Acme Co" };
    const issues = validateStructuredData([obj]);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("incomplete-structured-data");
    expect(issues[0].message).toContain("address");
    expect(issues[0].message).toContain("telephone");
  });

  it("treats LocalBusiness subtypes (Restaurant) as needing NAP", () => {
    const issues = validateStructuredData([{ "@type": "Restaurant", name: "Diner" }]);
    expect(issues[0].message).toContain("Restaurant");
    expect(issues[0].message).toContain("address");
  });

  it("walks @graph nodes", () => {
    const doc = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Acme" },
        { "@type": "Article", headline: "Hi" }, // missing author + datePublished
      ],
    };
    const issues = validateStructuredData([doc]);
    const article = issues.find((i) => i.message.startsWith("Article"));
    expect(article).toBeDefined();
    expect(article!.message).toContain("author");
    expect(article!.message).toContain("datePublished");
  });

  it("requires a purchasing signal + complete offers on Product", () => {
    const noSignal = validateStructuredData([{ "@type": "Product", name: "Widget" }]);
    expect(noSignal[0].message).toContain("offers/review/aggregateRating");

    const badOffer = validateStructuredData([
      { "@type": "Product", name: "Widget", offers: { "@type": "Offer", price: "9.99" } },
    ]);
    expect(badOffer[0].message).toContain("priceCurrency");

    const good = validateStructuredData([
      { "@type": "Product", name: "Widget", offers: { price: "9.99", priceCurrency: "USD" } },
    ]);
    expect(good).toHaveLength(0);
  });

  it("handles array @type and treats empty arrays as missing", () => {
    const issues = validateStructuredData([
      { "@type": ["FAQPage"], mainEntity: [] },
    ]);
    expect(issues[0].message).toContain("mainEntity");
  });

  it("ignores unknown types", () => {
    expect(validateStructuredData([{ "@type": "SomethingWeird", foo: 1 }])).toHaveLength(0);
  });
});
