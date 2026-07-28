import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SerpScale",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "All-in-one SEO platform: rank tracker, site audit, backlink checker and keyword research in one dashboard. A faster, affordable SEMrush & Ahrefs alternative for agencies.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  aggregateRating: { "@type": "AggregateRating", ratingValue: "4.8", ratingCount: "180" },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Header />
      <main>
        <Frag file="home.raw.html" />
      </main>
      <Footer />
    </>
  );
}
