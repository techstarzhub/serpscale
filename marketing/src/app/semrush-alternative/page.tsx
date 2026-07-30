import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, faqPage } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SEMrush Alternative — SerpScale vs SEMrush & Ahrefs",
  description:
    "Looking for the best SEMrush alternative? SerpScale gives you rank tracking, site audits, backlinks and keyword research in one platform from $5/mo. Start free.",
  keywords: ["SEMrush alternative","SEMrush alternatives","Ahrefs alternative","free SEMrush alternative","cheap SEMrush alternative","best SEMrush alternative","alternative to SEMrush","cheaper alternative to SEMrush","affordable SEO tool","SEMrush competitors","SEO tool comparison","SEMrush vs SerpScale","Ahrefs vs SerpScale","all-in-one SEO platform","rank tracker","site audit tool","backlink checker","keyword research tool","white label SEO","SEO software for agencies","budget SEO tools","SEMrush pricing alternative"],
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
    a: "Yes. SerpScale covers the core tools most teams use in SEMrush — daily rank tracking, technical site audits, a backlink checker and keyword research — in one dashboard, with white-label reporting and a 7-day free trial, at a lower price.",
  },
  {
    q: "How is SerpScale cheaper than SEMrush and Ahrefs?",
    a: "We keep the tools agencies use every day — rank tracking, audits, backlinks, keyword research and reporting — and skip the expensive enterprise extras most teams never open. Less bloat, lower price.",
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
