import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, faqPage, softwareApp, DEFAULT_OG_IMAGE } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rank Tracker — Daily Keyword Rank Tracking Tool",
  description:
    "SerpScale is a daily keyword rank tracker that checks your Google positions on desktop, mobile and by location. Track keyword rankings for free.",
  keywords: ["rank tracker","keyword rank tracker","SEO rank tracker","rank tracking tool","keyword tracker","google rank tracker","serp tracker","keyword position tracker","local rank tracker","enterprise rank tracker","mobile rank tracker","online rank tracker","free rank tracker","best rank tracker","rank tracker tool","rank tracker software","daily rank tracking","SERP tracking","share of voice","visibility index","google ranking checker","keyword ranking tool","track keyword rankings","bing rank tracker"],
  alternates: { canonical: "/rank-tracker" },
  openGraph: {
    images: [DEFAULT_OG_IMAGE],
    title: "Rank Tracker — Daily Keyword & SEO Rank Tracking Tool | SerpScale",
    description:
      "Track keyword rankings daily on desktop and mobile with SerpScale's local and enterprise rank tracker — visibility index, share-of-voice and a 7-day free trial.",
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
    a: "SerpScale is a daily rank tracker, so your keyword positions refresh automatically every 24 hours. You can also trigger an on-demand refresh from any campaign the moment you publish a change and want to see where you land.",
  },
  {
    q: "Can I track local and mobile rankings?",
    a: "Yes. Our local rank tracker records positions for any city, region or country, so you can see exactly how you rank where your customers search. Every keyword also includes mobile & desktop rank tracking, letting you compare device performance and optimize for the platform driving your traffic.",
  },
  {
    q: "Can I try the rank tracker?",
    a: "Yes. Book a quick demo to see the rank tracker in action, then pick the plan that fits your keyword volume. It's a full serp tracker with daily desktop and mobile updates — see pricing or talk to us to get started.",
  },
  {
    q: "How is it better than SEMrush's rank tracker?",
    a: "SerpScale delivers the same daily keyword position tracking, local coverage and visibility reporting you expect from SEMrush's rank tracker, at a fraction of the cost. It also pairs your ranks with real Google Search Console data and white-label reports built for agencies — one tool instead of three.",
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
