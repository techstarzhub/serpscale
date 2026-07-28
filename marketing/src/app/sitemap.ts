import type { MetadataRoute } from "next";
import { getSlugs } from "@/lib/blog";

const BASE = "https://serpscale.com";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/features", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/pricing", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/backlink-checker", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/rank-tracker", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/site-audit", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/keyword-research", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/semrush-alternative", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/blog", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/faq", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/contact", priority: 0.5, changeFrequency: "yearly" as const },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
  ];
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = routes.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Published blog posts from the CMS.
  const slugs = await getSlugs();
  const postEntries: MetadataRoute.Sitemap = slugs.map((s) => ({
    url: `${BASE}/blog/${s.slug}`,
    lastModified: new Date(s.updatedAt),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...postEntries];
}
