// Dynamic SEO/head config authored by the super admin (dashboard → SEO) and
// served from the API. Injected into the marketing site's <head>/<body>:
// verification metas, analytics IDs, default meta and custom scripts.
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface SeoSettings {
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string; // comma-separated
  ogImage?: string;
  robotsIndex?: boolean; // false → noindex,nofollow

  // Site-verification tokens (rendered as their respective <meta> tags).
  googleVerification?: string;
  bingVerification?: string;
  yandexVerification?: string;
  pinterestVerification?: string;
  facebookDomainVerification?: string;

  // Analytics IDs (rendered as proper tag snippets).
  ga4Id?: string; // G-XXXXXXX
  gtmId?: string; // GTM-XXXXXX

  // Free-form inline JavaScript injected at the end of <head> / <body>
  // (e.g. tracking pixels, chat widgets). JavaScript only — no <script> wrapper.
  customHeadScript?: string;
  customBodyScript?: string;
}

export async function getSeo(): Promise<SeoSettings> {
  try {
    const res = await fetch(`${API}/public/seo`, { next: { revalidate: 60 } });
    if (!res.ok) return {};
    return (await res.json()) as SeoSettings;
  } catch {
    return {};
  }
}
