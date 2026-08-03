import { ImageResponse } from "next/og";

export const alt = "SerpScale — The All-in-One SEO Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded Open Graph / social-share image for the homepage. Other routes don't
// get this for free (Next only auto-applies file-based OG images to their own
// segment) — layout.tsx's generateMetadata() falls back to this same URL.
export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #4b0fb3 0%, #7B1FE4 55%, #A121CA 100%)",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 46, fontWeight: 800 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              background: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 20,
              fontSize: 38,
            }}
          >
            S
          </div>
          SerpScale
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 74, fontWeight: 800, lineHeight: 1.05, marginTop: 40 }}>
          <div style={{ display: "flex" }}>The All-in-One</div>
          <div style={{ display: "flex" }}>SEO Platform</div>
        </div>
        <div style={{ display: "flex", fontSize: 32, marginTop: 28, opacity: 0.92 }}>
          Rank tracker · Site audit · Backlink checker · Keyword research
        </div>
        <div style={{ display: "flex", fontSize: 26, marginTop: 22, opacity: 0.8 }}>
          A faster, affordable SEMrush &amp; Ahrefs alternative
        </div>
      </div>
    ),
    { ...size },
  );
}
