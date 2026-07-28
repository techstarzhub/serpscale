import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — SerpScale",
  description:
    "How SerpScale collects, uses and protects your data on our all-in-one SEO platform — integrations, cookies, retention and your privacy rights.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy — SerpScale",
    description:
      "How SerpScale collects, uses and protects your data — integrations, cookies, retention and your privacy rights.",
    url: "/privacy",
  },
};

export default function Privacy() {
  return (
    <>
      <JsonLd data={breadcrumb([{ name: "Home", path: "/" }, { name: "Privacy Policy", path: "/privacy" }])} />
      <Header />
      <main>
        <Frag file="privacy.raw.html" />
      </main>
      <Footer />
    </>
  );
}
