import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://serpscale.com/sitemap.xml",
    host: "https://serpscale.com",
  };
}
