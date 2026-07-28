import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Frag } from "@/components/Frag";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumb } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact SerpScale — Book a Demo or Get Support",
  description:
    "Contact SerpScale to book a demo or ask a question. Email hello@serpscale.com for SEO platform support — the affordable SEMrush & Ahrefs alternative.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact SerpScale — Book a Demo or Get Support",
    description:
      "Book a demo or reach SEO platform support at SerpScale. Email hello@serpscale.com — the affordable SEMrush & Ahrefs alternative for agencies.",
    url: "/contact",
  },
};

const contactPoint = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://serpscale.com/#organization",
  name: "SerpScale",
  url: "https://serpscale.com",
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
      </main>
      <Footer />
    </>
  );
}
