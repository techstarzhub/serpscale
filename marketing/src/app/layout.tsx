import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { getSeo } from "@/lib/seo";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7B1FE4",
};

const DEFAULT_TITLE = "SerpScale — The All-in-One SEO Tool & SEMrush Alternative";
const DEFAULT_DESC =
  "SerpScale is the all-in-one SEO platform — rank tracker, site audit, backlink checker & keyword research. An affordable SEMrush & Ahrefs alternative.";
const DEFAULT_KEYWORDS = ["SEO tools","SEO tool","SEO software","SEO platform","all-in-one SEO tool","best SEO tools","SEO marketing tools","SEO optimization tools","free SEO tools","SEO tools for agencies","rank tracker","keyword rank tracker","backlink checker","check backlinks","site audit tool","website SEO checker","keyword research tool","SEO reporting tool","white label SEO","SEMrush alternative","Ahrefs alternative","SEO dashboard","competitor analysis tool","SEO audit tool","keyword tracking"];

// Loaded render-blocking: needed for correct layout/visibility of above-the-fold
// content (grid, icons, WOW.js fade-in target visibility, brand styles).
// local-fonts.css must come before main.css (which references these families).
const CSS = ["local-fonts.css", "bootstrap.min.css", "all.min.css", "animate.css", "main.css", "serpscale.css"];

// Loaded non-blocking (preload + swap to stylesheet on load): each backs an
// isolated interactive widget (mobile menu, lightbox, custom <select>, carousel)
// that isn't part of first paint — worst case before it loads is an unstyled-but
// -functional widget, never invisible/missing content.
const DEFERRED_CSS = ["meanmenu.css", "magnific-popup.css", "nice-select.css", "swiper-bundle.min.css"];

// jQuery + all template plugins + main.js, concatenated in load order into one
// ordered bundle (single script → guaranteed execution order across the stack).

// Metadata is generated at request/revalidate time so the super admin's SEO
// settings (title, description, keywords, verification tokens, OG image) flow in
// without a redeploy. Falls back to the built-in defaults when unset.
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeo();
  const title = seo.metaTitle?.trim() || DEFAULT_TITLE;
  const description = seo.metaDescription?.trim() || DEFAULT_DESC;
  const keywords = seo.metaKeywords?.trim()
    ? seo.metaKeywords.split(",").map((k) => k.trim()).filter(Boolean)
    : DEFAULT_KEYWORDS;
  // Falls back to the branded generated image (opengraph-image.tsx) on every
  // route — otherwise only the homepage gets an og:image, since Next.js only
  // auto-applies file-based OG images to the segment they're colocated in.
  const images = [seo.ogImage?.trim() || "https://www.serpscale.com/opengraph-image"];

  // Non-Google verification tokens map to their standard <meta name> tags.
  const other: Record<string, string> = {};
  if (seo.bingVerification?.trim()) other["msvalidate.01"] = seo.bingVerification.trim();
  if (seo.pinterestVerification?.trim()) other["p:domain_verify"] = seo.pinterestVerification.trim();
  if (seo.facebookDomainVerification?.trim()) other["facebook-domain-verification"] = seo.facebookDomainVerification.trim();

  return {
    metadataBase: new URL("https://www.serpscale.com"),
    title: { default: title, template: "%s | SerpScale" },
    description,
    applicationName: "SerpScale",
    keywords,
    // Site-wide authorship signal (E-E-A-T) — renders <meta name="author">.
    authors: [{ name: "SerpScale Team", url: "https://www.serpscale.com/about" }],
    alternates: { canonical: "/" },
    openGraph: { type: "website", siteName: "SerpScale", title, description, url: "/", images },
    twitter: { card: "summary_large_image", title, description, images },
    robots: seo.robotsIndex === false ? { index: false, follow: false } : { index: true, follow: true },
    verification: {
      ...(seo.googleVerification?.trim() ? { google: seo.googleVerification.trim() } : {}),
      ...(seo.yandexVerification?.trim() ? { yandex: seo.yandexVerification.trim() } : {}),
      ...(Object.keys(other).length ? { other } : {}),
    },
  };
}

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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const seo = await getSeo();
  const gtmId = seo.gtmId?.trim();
  const ga4Id = seo.ga4Id?.trim();
  return (
    <html lang="en">
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        {CSS.map((f) => (
          <link key={f} rel="stylesheet" href={`/assets/css/${f}?v=5`} />
        ))}
        {/* Load these off the render-blocking path via preload + swap-on-load. A
            <link onload=...> literal isn't expressible through React's JSX props
            (onLoad expects a real function, not a Server Component), so this uses
            a small inline script instead — same effect, valid inside <head>. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(f){f.forEach(function(n){var l=document.createElement("link");l.rel="preload";l.as="style";l.href="/assets/css/"+n+"?v=5";l.onload=function(){l.onload=null;l.rel="stylesheet";};document.head.appendChild(l);});})(${JSON.stringify(DEFERRED_CSS)});`,
          }}
        />
        <noscript>
          {DEFERRED_CSS.map((f) => (
            <link key={f} rel="stylesheet" href={`/assets/css/${f}?v=5`} />
          ))}
        </noscript>
        {/* Google Tag Manager (super-admin configured) */}
        {gtmId && (
          <Script id="gtm" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');` }} />
        )}
        {/* Google Analytics 4 (super-admin configured) */}
        {ga4Id && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}');` }} />
          </>
        )}
        {/* Custom head script (super-admin authored, inline JS) */}
        {seo.customHeadScript?.trim() && (
          <Script id="custom-head" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: seo.customHeadScript }} />
        )}
      </head>
      <body>
        {/* GTM noscript fallback (must be immediately after <body>) */}
        {gtmId && (
          <noscript>
            <iframe src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} />
          </noscript>
        )}
        {children}
        <Script src="/assets/js/_bundle.js" strategy="afterInteractive" />
        {/* Custom body script (super-admin authored, inline JS) */}
        {seo.customBodyScript?.trim() && (
          <Script id="custom-body" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: seo.customBodyScript }} />
        )}
      </body>
    </html>
  );
}
