import type { Metadata, Viewport } from "next";
import Script from "next/script";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7B1FE4",
};

const CSS = [
  "bootstrap.min.css",
  "all.min.css",
  "animate.css",
  "magnific-popup.css",
  "meanmenu.css",
  "swiper-bundle.min.css",
  "nice-select.css",
  "main.css",
  "serpscale.css",
];

// jQuery + all template plugins + main.js, concatenated in load order into one
// ordered bundle (single script → guaranteed execution order across the stack).

export const metadata: Metadata = {
  metadataBase: new URL("https://www.serpscale.com"),
  title: {
    default: "SerpScale — The All-in-One SEO Tool & SEMrush Alternative",
    template: "%s | SerpScale",
  },
  description:
    "SerpScale is the all-in-one SEO platform: rank tracker, site audit, backlink checker and keyword research in one dashboard. A faster, affordable SEMrush & Ahrefs alternative built for agencies.",
  applicationName: "SerpScale",
  keywords: ["SEO tools","SEO tool","SEO software","SEO platform","all-in-one SEO tool","best SEO tools","SEO marketing tools","SEO optimization tools","free SEO tools","SEO tools for agencies","rank tracker","keyword rank tracker","backlink checker","check backlinks","site audit tool","website SEO checker","keyword research tool","SEO reporting tool","white label SEO","SEMrush alternative","Ahrefs alternative","SEO dashboard","competitor analysis tool","SEO audit tool","keyword tracking"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "SerpScale",
    title: "SerpScale — The All-in-One SEO Tool & SEMrush Alternative",
    description:
      "Rank tracking, site audits, backlinks and keyword research in one platform. The affordable SEMrush & Ahrefs alternative for agencies.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "SerpScale — The All-in-One SEO Platform",
    description: "Rank tracker, site audit, backlink checker & keyword research in one dashboard.",
  },
  robots: { index: true, follow: true },
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.serpscale.com/#organization",
      name: "SerpScale",
      url: "https://www.serpscale.com",
      description:
        "SerpScale is an all-in-one SEO platform: rank tracker, site audit, backlink checker and keyword research in one dashboard.",
      sameAs: ["https://twitter.com/serpscale", "https://www.linkedin.com/company/serpscale"],
    },
    {
      "@type": "WebSite",
      "@id": "https://www.serpscale.com/#website",
      url: "https://www.serpscale.com",
      name: "SerpScale",
      publisher: { "@id": "https://www.serpscale.com/#organization" },
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to Google Fonts (main.css @imports DM Sans + Open Sans) — improves LCP. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        {CSS.map((f) => (
          <link key={f} rel="stylesheet" href={`/assets/css/${f}?v=5`} />
        ))}
      </head>
      <body>
        {children}
        <Script src="/assets/js/_bundle.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
