import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SerpScale — The All-in-One SEO Platform",
    short_name: "SerpScale",
    description:
      "Rank tracker, site audit, backlink checker and keyword research in one dashboard — an affordable SEMrush & Ahrefs alternative.",
    start_url: "/",
    display: "standalone",
    background_color: "#05060a",
    theme_color: "#7B1FE4",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
