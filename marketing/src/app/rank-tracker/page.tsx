import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, faqPage, softwareApp } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Keyword Rank Tracker — Daily SEO Rank Tracking Tool",
  description:
    "SerpScale is a daily keyword rank tracker that checks your Google positions on desktop, mobile and by location. Track keyword rankings for free.",
  alternates: { canonical: "/rank-tracker" },
  openGraph: {
    title: "Keyword Rank Tracker — Daily SEO Rank Tracking Tool | SerpScale",
    description:
      "Track keyword rankings daily on desktop and mobile with SerpScale's local and enterprise rank tracker — visibility index, share-of-voice and a free plan.",
    url: "/rank-tracker",
    type: "website",
  },
};

const faqs = [
  {
    q: "What is a rank tracker?",
    a: "A rank tracker is an SEO tool that monitors where your website appears in search results for specific keywords. SerpScale is a keyword rank tracker that checks your positions daily on Google, on both desktop and mobile, and turns them into clear trends so you can measure and improve your rankings over time.",
  },
  {
    q: "How often are rankings updated?",
    a: "SerpScale is a daily rank tracker, so your keyword positions refresh automatically every 24 hours. You can also trigger an on-demand refresh from any campaign whenever you want an instant seo rank checker tool reading after publishing changes.",
  },
  {
    q: "Can I track local and mobile rankings?",
    a: "Yes. Our local rank tracker records positions for any city, region or country, so you can see exactly how you rank where your customers search. Every keyword also includes mobile & desktop rank tracking, letting you compare device performance and optimize for the platform driving your traffic.",
  },
  {
    q: "Can I try the rank tracker?",
    a: "Yes. Book a quick demo to see the rank tracker in action, then pick the plan that fits your keyword volume. It is a genuine online rank tracker with daily desktop and mobile updates — see pricing or talk to us to get started.",
  },
  {
    q: "How is it better than SEMrush's rank tracker?",
    a: "SerpScale delivers the same daily keyword position tracking, local coverage and visibility reporting you expect from SEMrush's rank tracker, at a fraction of the cost. As an all-in-one rank tracking tool, it also pairs your ranks with real Google Search Console data and white-label reports built for agencies.",
  },
];

export default function Page() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumb([
            { name: "Home", path: "/" },
            { name: "Rank Tracker", path: "/rank-tracker" },
          ]),
          faqPage(faqs),
          softwareApp({
            name: "SerpScale Rank Tracker",
            description:
              "Daily keyword rank tracker that checks Google positions on desktop and mobile, by location, with visibility index and share-of-voice reporting.",
            url: "/rank-tracker",
            rating: { value: "4.8", count: "180" },
          }),
        ]}
      />
      <Header />
      <main>
        <Frag file="rank-tracker.raw.html" />
      </main>
      <Footer />
    </>
  );
}
