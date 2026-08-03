import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, softwareApp, DEFAULT_OG_IMAGE } from "@/lib/schema";

export const metadata: Metadata = {
  title: "SEO Tool Features — Rank Tracker & More",
  description:
    "Explore every SerpScale feature: rank tracker, site audit, backlink checker, keyword research and AI SEO copilot in one platform.",
  keywords: ["SEO tool features","SEO platform features","SEO tool for agencies","rank tracker","site audit tool","backlink checker","keyword research tool","competitor gap analysis","AI SEO copilot","AI content writer","white label reports","SEO reporting","AI visibility tracking","Google Search Console integration","GA4 integration","all-in-one SEO platform","technical SEO","SEO dashboard","SEO automation","local rank tracking"],
  alternates: { canonical: "/features" },
  openGraph: {
    images: [DEFAULT_OG_IMAGE],
    title: "SEO Tool Features — Rank Tracker, Site Audit, AI Copilot & More",
    description:
      "Rank tracking, site audits, backlinks, keyword research, competitor gap analysis, an AI SEO copilot, AI visibility tracking and white-label reports in one affordable SEO platform built for agencies.",
    url: "/features",
    type: "website",
  },
};

export default function FeaturesPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumb([{ name: "Home", path: "/" }, { name: "Features", path: "/features" }]),
          softwareApp({
            name: "SerpScale",
            description:
              "All-in-one SEO platform: daily rank tracker, site audit, backlink checker, keyword research, competitor gap analysis, AI SEO copilot, AI visibility tracking, AI content writer and white-label reporting.",
            url: "/features",
          }),
        ]}
      />
      <Header />
      <main>
        <Frag file="features.raw.html" />
      </main>
      <Footer />
    </>
  );
}
