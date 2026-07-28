import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, softwareApp } from "@/lib/schema";

export const metadata: Metadata = {
  title: "SEO Tool Features — Rank Tracker, Site Audit, AI Copilot & More",
  description:
    "Explore every SerpScale feature: daily rank tracker, site audit, backlink checker, keyword research, AI SEO copilot and white-label reports in one SEO platform.",
  alternates: { canonical: "/features" },
  openGraph: {
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
            rating: { value: "4.8", count: "180" },
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
