import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { HomePricing } from "@/components/HomePricing";
import { getPlans } from "@/lib/plans";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SerpScale",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "All-in-one SEO platform: rank tracker, site audit, backlink checker and keyword research in one dashboard. A faster, affordable SEMrush & Ahrefs alternative for agencies.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default async function Home() {
  // Live, super-admin-authored plans — same source as the /pricing page.
  const plans = await getPlans();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Header />
      <main>
        <Frag file="home-top.raw.html" />

        {/* Dynamic pricing — real prices + keyword tiers from the API. HomePricing
            renders its own heading + "Compare all features" link. */}
        <section className="section-padding fix" style={{ background: "#f7f8fc" }}>
          <div className="container">
            <HomePricing plans={plans} />
          </div>
        </section>

        <Frag file="home-bottom.raw.html" />
      </main>
      <Footer />
    </>
  );
}
