import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, faqPage, softwareApp } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Backlink Checker — Check Backlinks & Referring Domains",
  description:
    "Free backlink checker to analyze any backlink profile. Check backlinks, referring domains, anchor text and toxic links, and benchmark competitors.",
  alternates: { canonical: "/backlink-checker" },
  openGraph: {
    title: "Backlink Checker — Analyze Any Backlink Profile",
    description:
      "Check backlinks and referring domains for any site. Spot toxic links, track new & lost backlinks, and compare competitors with SerpScale.",
    url: "/backlink-checker",
  },
};

const faqs = [
  {
    q: "What is a backlink checker?",
    a: "A backlink checker is a tool that finds and lists the external links pointing to a website. SerpScale's backlink checker tool crawls the web to show your backlinks, referring domains and anchor text, then turns that raw data into clear backlink analysis so you can see how strong your backlink profile really is.",
  },
  {
    q: "What does the backlink checker show?",
    a: "SerpScale's backlink checker shows your backlinks, referring domains, anchor text and dofollow/nofollow split, and scores link quality so you can see how strong your profile is. Book a demo to see it on your own domain, then pick the plan that fits how many domains you track.",
  },
  {
    q: "How many backlinks can I check?",
    a: "Each plan scales up the number of referring domains and backlinks you can analyze and monitor. Whether you need a quick site backlink checker for one project or ongoing analysis across many clients, there is a plan that fits — see pricing or talk to us to choose one.",
  },
  {
    q: "How do you find toxic backlinks?",
    a: "SerpScale scores every referring domain on signals like spam level, relevance and link patterns, then highlights toxic backlinks that could put your rankings at risk. Backlink monitoring alerts you when new harmful links appear, and you can export a disavow-ready list to send to Google.",
  },
  {
    q: "How is it different from the Ahrefs backlink checker?",
    a: "The Ahrefs backlink checker is powerful but built around a premium standalone tool. SerpScale gives you a website backlink checker, competitor backlink checker, rank tracking and site audits together in one affordable platform, so most teams get the backlink analysis they need at a fraction of the cost.",
  },
];

export default function Page() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumb([
            { name: "Home", path: "/" },
            { name: "Backlink Checker", path: "/backlink-checker" },
          ]),
          faqPage(faqs),
          softwareApp({
            name: "SerpScale Backlink Checker",
            description:
              "Backlink checker to analyze any backlink profile — check backlinks, referring domains, anchor text and toxic links, and benchmark competitors.",
            url: "/backlink-checker",
            rating: { value: "4.8", count: "180" },
          }),
        ]}
      />
      <Header />
      <main>
        <Frag file="backlink-checker.raw.html" />
      </main>
      <Footer />
    </>
  );
}
