import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, faqPage, softwareApp, DEFAULT_OG_IMAGE } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Keyword Research Tool — Free Keyword Finder",
  description:
    "SerpScale is an affordable keyword research tool — find keyword ideas, real search volume, difficulty and intent. Start free.",
  keywords: ["keyword research tool","keyword research","keyword research for SEO","SEO keyword research","keyword tool","free keyword research tool","keyword finder","keyword generator","keyword ideas","long-tail keywords","keyword difficulty","search volume","keyword suggestions","search intent","related keywords","keyword gap analysis","keyword clustering","question keywords","keyword volume checker","keyword metrics","seed keyword","CPC data","topic clusters","keyword explorer","keyword research tools"],
  alternates: { canonical: "/keyword-research" },
  openGraph: {
    images: [DEFAULT_OG_IMAGE],
    title: "Keyword Research Tool — Free Keyword Finder for SEO",
    description:
      "Find keyword ideas, search volume, difficulty and intent in one dashboard. An affordable SEO keyword research tool — start free.",
    url: "/keyword-research",
  },
};

const faqs = [
  {
    q: "What is a keyword research tool?",
    a: "A keyword research tool helps you discover the terms people type into search engines and shows how valuable each one is. SerpScale turns a single seed phrase into thousands of keyword ideas with real search volume, keyword difficulty, CPC and search intent, so you can build content around keywords that actually drive traffic.",
  },
  {
    q: "Where does the search volume data come from?",
    a: "Our search volume figures are built on Google keyword data blended with clickstream signals and refreshed regularly. That gives you accurate monthly volume, trends and CPC for each keyword, so the numbers you plan around reflect what people really search.",
  },
  {
    q: "Can I find long-tail keywords?",
    a: "Yes. SerpScale surfaces question-based and long-tail keywords with lower keyword difficulty, which are often the fastest to rank for. Filter keyword suggestions by word count, volume or intent to build out a full topic cluster of related keywords around your main term.",
  },
  {
    q: "Can I try the keyword research tool?",
    a: "Yes. Book a demo to see keyword research in action — generate keyword ideas and check search volume, difficulty and intent — then choose the plan that fits your needs. See pricing or talk to us to get started with keyword gap analysis and full competitor data.",
  },
  {
    q: "How does it compare to SEMrush's keyword research tool?",
    a: "SerpScale covers the core of the SEMrush keyword research tool — keyword ideas, search volume, keyword difficulty, search intent and keyword gap analysis — at a fraction of the cost. If you want SEMrush-style insight without the enterprise bill, it's the keyword research tool most teams actually end up using day to day.",
  },
  {
    q: "Is there a free keyword research tool?",
    a: "Yes — you can start with SerpScale's free keyword research tool and generate keyword ideas, check real search volume and see difficulty without a credit card. It works as both a keyword generator for fresh ideas and a keyword finder when you already have a phrase in mind, and you can upgrade when you need more searches or full competitor data.",
  },
];

export default function Page() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumb([
            { name: "Home", path: "/" },
            { name: "Keyword Research", path: "/keyword-research" },
          ]),
          faqPage(faqs),
          softwareApp({
            name: "SerpScale Keyword Research",
            description:
              "Affordable keyword research tool for SEO with keyword ideas, real search volume, keyword difficulty, search intent and keyword gap analysis.",
            url: "/keyword-research",
          }),
        ]}
      />
      <Header />
      <main>
        <Frag file="keyword-research.raw.html" />
      </main>
      <Footer />
    </>
  );
}
