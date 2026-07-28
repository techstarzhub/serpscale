import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, faqPage, softwareApp } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SEO Site Audit Tool — Free Website SEO Checker",
  description:
    "SerpScale is a free site audit tool that crawls your website, scores site health, checks Core Web Vitals and delivers a prioritized technical SEO audit report.",
  alternates: { canonical: "/site-audit" },
  openGraph: {
    title: "SEO Site Audit Tool — Free Website SEO Checker | SerpScale",
    description:
      "Crawl your website, get a site health score, check Core Web Vitals and fix technical SEO issues with SerpScale's free site audit tool.",
    url: "/site-audit",
  },
};

const faqs = [
  {
    q: "What is an SEO site audit?",
    a: "An SEO site audit is a full technical and on-page review of your website. A site audit tool crawls every page like a search engine, then reports the issues that affect crawling, indexing and rankings. SerpScale rolls those findings into one site health score with a prioritized fix list, so you know exactly what to improve first.",
  },
  {
    q: "What does the site audit check?",
    a: "Our SEO website checker tool runs a full-site crawl and inspects technical SEO and on-page SEO together. That includes broken links, redirect chains, indexing and crawl errors, duplicate or missing titles and meta descriptions, heading structure, canonicals, structured data and thin content — every issue delivered in one SEO audit report.",
  },
  {
    q: "How often should I audit my site?",
    a: "For most sites a monthly crawl is enough to catch new issues, while large or fast-changing sites benefit from a weekly SEO site check. SerpScale can crawl your website automatically on a schedule and alert you when your site health score drops, so problems never sit undetected between manual audits.",
  },
  {
    q: "Do you check Core Web Vitals?",
    a: "Yes. This SEO auditing tool measures Core Web Vitals — LCP, INP and CLS — along with PageSpeed on real page loads. It shows which templates are slow and why, so your technical SEO audit turns performance data into specific, prioritized fixes rather than raw numbers.",
  },
  {
    q: "Is there a free site audit tool?",
    a: "Yes. SerpScale includes a free site audit tool on the forever-free Starter plan, so you can crawl your website and get a site health score without a credit card. It is an affordable alternative to the SEMrush site audit, and you can upgrade any time for daily crawls and larger sites.",
  },
];

export default function Page() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumb([
            { name: "Home", path: "/" },
            { name: "Site Audit", path: "/site-audit" },
          ]),
          faqPage(faqs.map((f) => ({ q: f.q, a: f.a }))),
          softwareApp({
            name: "SerpScale Site Audit",
            description:
              "Free SEO site audit tool that crawls your website, scores site health, checks Core Web Vitals and delivers a prioritized technical SEO audit report.",
            url: "/site-audit",
            rating: { value: "4.8", count: "180" },
          }),
        ]}
      />
      <Header />
      <main>
        <Frag file="site-audit.raw.html" />
      </main>
      <Footer />
    </>
  );
}
