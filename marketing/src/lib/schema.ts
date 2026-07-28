// schema.org JSON-LD builders for SerpScale marketing pages.

const BASE = "https://serpscale.com";
const ORG = { "@id": `${BASE}/#organization` };

export function breadcrumb(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${BASE}${it.path}`,
    })),
  };
}

export function faqPage(qas: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qas.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: { "@type": "Answer", text: x.a },
    })),
  };
}

export function softwareApp(opts: {
  name: string;
  description: string;
  url: string;
  price?: string;
  rating?: { value: string; count: string };
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: opts.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: opts.description,
    url: `${BASE}${opts.url}`,
    publisher: ORG,
    offers: { "@type": "Offer", price: opts.price ?? "0", priceCurrency: "USD" },
    ...(opts.rating
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: opts.rating.value, ratingCount: opts.rating.count } }
      : {}),
  };
}

export function blogPosting(opts: {
  headline: string;
  description: string;
  slug: string;
  datePublished: string;
  image?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: opts.headline,
    description: opts.description,
    image: opts.image ? `${BASE}${opts.image}` : undefined,
    datePublished: opts.datePublished,
    dateModified: opts.datePublished,
    author: { "@type": "Organization", name: "SerpScale", url: BASE },
    publisher: ORG,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE}/blog/${opts.slug}` },
    url: `${BASE}/blog/${opts.slug}`,
  };
}

export function productOffers(opts: {
  name: string;
  description: string;
  url: string;
  offers: { name: string; price: string }[];
  rating?: { value: string; count: string };
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.name,
    description: opts.description,
    brand: { "@type": "Brand", name: "SerpScale" },
    url: `${BASE}${opts.url}`,
    ...(opts.rating
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: opts.rating.value, ratingCount: opts.rating.count } }
      : {}),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: Math.min(...opts.offers.map((o) => Number(o.price))).toString(),
      highPrice: Math.max(...opts.offers.map((o) => Number(o.price))).toString(),
      offerCount: opts.offers.length.toString(),
    },
  };
}
