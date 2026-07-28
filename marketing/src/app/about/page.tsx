import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb } from "@/lib/schema";

export const metadata: Metadata = {
  title: "About SerpScale — The All-in-One SEO Platform",
  description:
    "SerpScale is the all-in-one SEO platform for agencies — rank tracker, site audit, backlink checker and keyword research in one affordable SEMrush alternative.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About SerpScale — The All-in-One SEO Platform",
    description:
      "Our mission: make professional SEO affordable and unified. One platform replacing SEMrush, Ahrefs, a rank tracker and a reporting tool — built for agencies.",
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
