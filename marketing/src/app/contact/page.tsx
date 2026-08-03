import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { ContactForm } from "@/components/ContactForm";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb, DEFAULT_OG_IMAGE } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact SerpScale — Book a Demo or Get Support",
  description:
    "Contact SerpScale to book a demo or ask a question. Email hello@serpscale.com for SEO platform support — the affordable SEMrush & Ahrefs alternative.",
  keywords: ["contact SerpScale","SerpScale support","book a demo","SEO platform demo","SEO tool support","SEMrush alternative","SEO software","all-in-one SEO platform","SEO tools","SEO agency software","SEO platform contact","request a demo","SEO tool help","customer support","Ahrefs alternative","SEO software demo","SEO tool trial","SEO tool for agencies","talk to sales","SEO platform pricing","SEO onboarding"],
  alternates: { canonical: "/contact" },
  openGraph: {
    images: [DEFAULT_OG_IMAGE],
    title: "Contact SerpScale — Book a Demo or Get Support",
    description:
      "Book a demo or reach SEO platform support at SerpScale. Email hello@serpscale.com — the affordable SEMrush & Ahrefs alternative for agencies.",
    url: "/contact",
  },
};

const contactPoint = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.serpscale.com/#organization",
  name: "SerpScale",
  url: "https://www.serpscale.com",
  email: "hello@serpscale.com",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "hello@serpscale.com",
    availableLanguage: "English",
    hoursAvailable: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "18:00",
    },
  },
};

export default function Contact() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumb([{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }]),
          contactPoint,
        ]}
      />
      <Header />
      <main>
        <Frag file="contact.raw.html" />
        <ContactForm />
      </main>
      <Footer />
    </>
  );
}
