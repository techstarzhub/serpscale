import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, faqPage } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SEMrush Alternative — SerpScale vs SEMrush & Ahrefs",
  description:
    "Looking for a SEMrush alternative? SerpScale gives you rank tracking, site audits, backlinks and keyword research in one platform from $49/mo. Start free.",
  alternates: { canonical: "/semrush-alternative" },
  openGraph: {
    title: "SEMrush Alternative — SerpScale vs SEMrush & Ahrefs",
    description:
      "SerpScale is the affordable SEMrush & Ahrefs alternative: rank tracker, site audit, backlink checker and keyword research in one platform. Start free.",
    url: "/semrush-alternative",
    type: "website",
  },
};

const FAQS = [
  {
    q: "Is SerpScale a good SEMrush alternative?",
    a: "Yes. SerpScale covers the core tools most teams use in SEMrush — daily rank tracking, technical site audits, a backlink checker and keyword research — in one dashboard, with white-label reporting and a free plan, at a lower price.",
  },
  {
    q: "How is SerpScale cheaper than SEMrush and Ahrefs?",
    a: "SerpScale runs on efficient, heavily-cached data pipelines and focuses on the tools agencies use every day rather than bundling large enterprise suites. Plans start free and scale from $49/mo, compared with $129+/mo for SEMrush or Ahrefs.",
  },
  {
    q: "Can I migrate from SEMrush or Ahrefs?",
    a: "Yes. Add your website, connect Google Search Console and Analytics, import the keywords you already track, and SerpScale starts collecting daily ranks, audit data and backlinks right away.",
  },
];

export default function SemrushAlternative() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumb([{ name: "Home", path: "/" }, { name: "SEMrush Alternative", path: "/semrush-alternative" }]),
          faqPage(FAQS),
        ]}
      />
      <Header />
      <main>
        <Frag file="semrush-alternative.raw.html" />
      </main>
      <Footer />
    </>
  );
}
