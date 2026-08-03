import type { NextConfig } from "next";

const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Allows exactly what the template + admin-configurable scripts (GTM, GA4,
// custom head/body script) actually load — see app/layout.tsx. No nonce-based
// script-src since GTM/GA4/custom scripts are injected as static inline HTML,
// not per-request, so 'unsafe-inline' is required for script-src here.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: https:",
  `connect-src 'self' ${apiOrigin} https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com`,
  "frame-src https://www.googletagmanager.com",
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self' ${apiOrigin}`,
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Scope file tracing to this app (silences the multi-lockfile workspace-root
  // warning and keeps standalone output correct in the monorepo).
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Fingerprinted template assets never change — cache them hard.
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
