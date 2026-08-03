import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PricingTable } from "@/components/PricingTable";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, productOffers, faqPage, DEFAULT_OG_IMAGE } from "@/lib/schema";
import { getPlans } from "@/lib/plans";
import type { Metadata } from "next";

const faqs = [
  {
    q: "How much does this SEO software cost?",
    a: "SerpScale is affordable SEO software with plans from just $5/mo. The Starter plan starts with a 7-day free trial and includes one campaign, 35 tracked keywords, site audits and Google Search Console & GA4 integration. You only pick how many keywords you need and scale up as you grow.",
  },
  {
    q: "Do I need a credit card to start?",
    a: "No. You can start a 7-day free trial on the Starter plan without entering any card details. You only add a payment method when you decide to keep using SerpScale after the trial.",
  },
  {
    q: "Can I cancel or change plans anytime?",
    a: "Absolutely. Upgrade, downgrade or cancel at any time from your billing settings. Changes take effect immediately and there are no long-term contracts or cancellation fees.",
  },
  {
    q: "Why is SerpScale cheaper than SEMrush or Ahrefs?",
    a: "SerpScale focuses on the tools agencies use every day — rank tracking, site audits, backlinks, keyword research and reporting — so we deliver the same core value from $5/mo instead of the $129–$139/mo SEMrush and Ahrefs charge.",
  },
  {
    q: "Which plan includes white-label SEO reports?",
    a: "The Agency plan and above include white-label PDF reports, branded client portals, unlimited campaigns and custom team roles — everything a white-label SEO agency needs to resell SEO under its own brand.",
  },
];

export const metadata: Metadata = {
  title: "SEO Software Pricing — Plans from $5/mo",
  description:
    "Simple, transparent SEO software pricing from $5/mo. Start free, then scale — the affordable SEMrush alternative agencies love.",
  keywords: ["SEO software pricing","affordable SEO tools","cheap SEO tools","SEO reporting tool","white label SEO","SEO tools pricing","budget SEO software","SEO platform pricing","free SEO tool","SEO software plans","agency SEO tools","SEO tools for small business","rank tracker pricing","SEMrush alternative pricing","all-in-one SEO tool","SEO tool free trial","SEO tool for agencies","affordable SEO software","SEO subscription","value SEO tools"],
  alternates: { canonical: "/pricing" },
  openGraph: {
    images: [DEFAULT_OG_IMAGE],
    title: "Pricing — Affordable SEO Software Plans",
    description:
      "Simple, transparent SEO tool pricing. Start free and scale with an affordable SEMrush & Ahrefs alternative built for agencies.",
    url: "/pricing",
  },
};

export default async function Pricing() {
  const plans = await getPlans();
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
              "All-in-one SEO software: rank tracker, site audit, backlink checker and keyword research.",
            url: "/pricing",
            // Dynamic — mirrors the super-admin authored plans, nothing hardcoded.
            offers: plans.map((p) => ({ name: p.name, price: String(p.priceCents / 100) })),
          }),
          faqPage(faqs),
        ]}
      />
      <Header />
      <main>
        <PricingTable plans={plans} />
      </main>
      <Footer />
    </>
  );
}
