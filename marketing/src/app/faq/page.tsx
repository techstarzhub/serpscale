import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, faqPage } from "@/lib/schema";

const FAQS = [
  { q: "What is SerpScale?", a: "SerpScale is an all-in-one SEO platform that combines a keyword rank tracker, technical site audit, backlink checker and keyword research in one dashboard — a faster, affordable SEMrush and Ahrefs alternative." },
  { q: "Is SerpScale a good SEMrush or Ahrefs alternative?", a: "Yes. SerpScale offers the same core SEO tools — rank tracking, site audits, backlinks and keyword research — at a lower price, with a free plan and white-label reporting built for agencies." },
  { q: "How does the keyword rank tracker work?", a: "SerpScale checks daily keyword positions on desktop and mobile by location, and shows visibility trends and rank changes for every campaign." },
  { q: "What does the site audit check?", a: "The site audit crawls every page, scores site health, checks Core Web Vitals, and returns a prioritized list of technical SEO fixes." },
  { q: "Can I check backlinks and competitors?", a: "Yes. The backlink checker tracks backlinks and referring domains, flags toxic links, and benchmarks your authority against competitors." },
  { q: "Do you connect to Google Search Console and Analytics?", a: "Yes. SerpScale connects to Google Search Console, Analytics 4 and Business Profile with one-click OAuth, and caches the data for fast dashboards." },
];

export const metadata: Metadata = {
  title: "SerpScale FAQ — Common Questions About Our SEO Platform",
  description:
    "Common questions about SerpScale — the all-in-one SEO platform and affordable SEMrush alternative with rank tracker, site audit, backlinks and keyword research.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "SerpScale FAQ — Common Questions About Our SEO Platform",
    description:
      "Everything you need to know about SerpScale's rank tracker, site audit, backlink checker and keyword research — the affordable SEMrush and Ahrefs alternative for agencies.",
    url: "/faq",
    type: "website",
  },
};

export default function FaqPage() {
  return (
    <>
      <JsonLd data={[breadcrumb([{ name: "Home", path: "/" }, { name: "FAQ", path: "/faq" }]), faqPage(FAQS)]} />
      <Header />
      <main>
        <Frag file="faq.raw.html" />
      </main>
      <Footer />
    </>
  );
}
