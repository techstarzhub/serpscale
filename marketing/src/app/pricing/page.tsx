import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, productOffers, faqPage } from "@/lib/schema";
import type { Metadata } from "next";

const faqs = [
  {
    q: "Is there a free SEO tool plan?",
    a: "Yes. The Starter plan is free forever — no credit card required. You get one campaign, 100 tracked keywords, a weekly site audit and Google Search Console & GA4 integration, so you can run real SEO on one website at no cost and upgrade only when you grow.",
  },
  {
    q: "Do I need a credit card to start?",
    a: "No. You can start on the free Starter plan or begin a 14-day Pro trial without entering any card details. You only add a payment method when you decide to stay on a paid plan.",
  },
  {
    q: "Can I cancel or change plans anytime?",
    a: "Absolutely. Upgrade, downgrade or cancel at any time from your billing settings. Changes take effect immediately and there are no long-term contracts or cancellation fees.",
  },
  {
    q: "Why is SerpScale cheaper than SEMrush or Ahrefs?",
    a: "SerpScale runs on efficient, heavily-cached data pipelines and focuses on the tools agencies use every day — rank tracking, audits, backlinks, keyword research and reporting — so we deliver the same core value from $49/mo instead of $129–$139/mo.",
  },
  {
    q: "Which plan includes white-label reports?",
    a: "The Agency plan includes white-label PDF reports, branded client portals, unlimited campaigns and custom team roles — everything an agency needs to resell SEO under its own brand. Pro adds daily tracking, competitor data and the AI copilot for in-house teams.",
  },
];

export const metadata: Metadata = {
  title: "Pricing — Affordable SEO Software Plans from $49/mo",
  description:
    "Simple, transparent SEO platform pricing. Start free, then scale with affordable SEO software from $49/mo — the SEMrush alternative pricing agencies love.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — Affordable SEO Software Plans",
    description:
      "Simple, transparent SEO tool pricing. Start free and scale with an affordable SEMrush & Ahrefs alternative built for agencies.",
    url: "/pricing",
  },
};

export default function Pricing() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumb([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" },
          ]),
          productOffers({
            name: "SerpScale SEO Platform",
            description:
              "All-in-one SEO software: rank tracker, site audit, backlink checker and keyword research. Free plan, then Pro and Agency tiers.",
            url: "/pricing",
            offers: [
              { name: "Starter", price: "0" },
              { name: "Pro", price: "49" },
              { name: "Agency", price: "149" },
            ],
            rating: { value: "4.8", count: "180" },
          }),
          faqPage(faqs),
        ]}
      />
      <Header />
      <main>
        <Frag file="pricing.raw.html" />
      </main>
      <Footer />
    </>
  );
}
