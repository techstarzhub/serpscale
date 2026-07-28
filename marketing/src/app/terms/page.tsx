import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions — SerpScale",
  description:
    "Read the SerpScale Terms & Conditions covering accounts, billing, acceptable use and your data on our all-in-one SEO platform.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms & Conditions — SerpScale",
    description:
      "The terms that govern your use of SerpScale, the all-in-one SEO platform — accounts, billing, acceptable use and data.",
    url: "/terms",
  },
};

export default function Terms() {
  return (
    <>
      <JsonLd data={breadcrumb([{ name: "Home", path: "/" }, { name: "Terms & Conditions", path: "/terms" }])} />
      <Header />
      <main>
        <Frag file="terms.raw.html" />
      </main>
      <Footer />
    </>
  );
}
