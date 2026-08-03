import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, DEFAULT_OG_IMAGE } from "@/lib/schema";

export const metadata: Metadata = {
  title: "About SerpScale — Our SEO Company Story",
  description:
    "SerpScale is the SEO company on a mission to make professional-grade optimization accessible for every agency — meet the team and read our story.",
  keywords: ["about SerpScale","SerpScale team","SEO company","affordable SEO software","SEO company story","SEO software company","professional SEO software","SEO tools for marketers","SEO analytics platform"],
  alternates: { canonical: "/about" },
  openGraph: {
    images: [DEFAULT_OG_IMAGE],
    title: "About SerpScale — Our SEO Company Story",
    description:
      "Meet the SEO company on a mission to make professional-grade optimization accessible for every agency. Our story, our team, our why.",
    url: "/about",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <>
      <JsonLd data={breadcrumb([{ name: "Home", path: "/" }, { name: "About", path: "/about" }])} />
      <Header />
      <main>
        <Frag file="about.raw.html" />
      </main>
      <Footer />
    </>
  );
}
