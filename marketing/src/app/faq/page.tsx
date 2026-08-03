import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, faqPage, DEFAULT_OG_IMAGE } from "@/lib/schema";

const FAQS = [
  { q: "What is SerpScale?", a: "SerpScale is an all-in-one SEO platform that combines a rank tracker, site audit, backlink checker and keyword research in a single dashboard. Instead of juggling separate tools, agencies and marketers get every core SEO workflow in one place. It is built to be fast, affordable and easy to use." },
  { q: "Is SerpScale a good SEMrush or Ahrefs alternative?", a: "Yes. SerpScale delivers the same core features you rely on in SEMrush and Ahrefs at a much lower price. It is purpose-built for agencies that need reliable rank tracking, audits and backlink data without the enterprise bill." },
  { q: "How does the keyword rank tracker work?", a: "The rank tracker checks your keyword positions daily on both desktop and mobile, localized to any city or country you target. You can watch visibility trends over time and see exactly which pages are gaining or losing ground." },
  { q: "What does the site audit check?", a: "The site audit runs a full crawl of your website and returns an overall health score with prioritized issues. It flags Core Web Vitals, broken links, indexing problems and other technical fixes so you know exactly what to improve first." },
  { q: "Can I check backlinks and competitors?", a: "Yes. The backlink checker shows your backlinks and referring domains, warns you about toxic links, and lets you compare competitor authority side by side. It is an easy way to spot link-building opportunities and monitor your profile." },
  { q: "Do you connect to Google Search Console and Analytics?", a: "Yes. SerpScale connects to Google Search Console and Google Analytics with one-click OAuth, and also integrates with Google Business Profile. Your traffic, impressions and ranking data all live in the same dashboard. Agencies can also white-label reports, spin up client portals and set custom roles, and every plan starts free — Starter is free forever and Pro comes with a 14-day trial, no card required." },
];

export const metadata: Metadata = {
  title: "SerpScale FAQ — SEO Platform Questions",
  description:
    "Common questions about SerpScale — the all-in-one SEO platform with rank tracker, site audit, backlinks and keyword research.",
  keywords: ["SerpScale FAQ","SEO tool FAQ","SEO platform questions","SEMrush alternative","SEO software","rank tracker","site audit tool","backlink checker","keyword research tool","SEO tool pricing","free SEO tool","white label SEO","all-in-one SEO platform","SEO tools","Google Search Console integration","SEO reporting","Ahrefs alternative","how SerpScale works","free SEO trial","SEO audit tool","SEO rank tracker","SEO tool for agencies","GA4 integration"],
  alternates: { canonical: "/faq" },
  openGraph: {
    images: [DEFAULT_OG_IMAGE],
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
