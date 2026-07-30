"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { tenantSubdomain } from "@/lib/tenant";

const MARKETING_HOME = process.env.NEXT_PUBLIC_MARKETING_URL || "https://serpscale.com";

interface Brand {
  agencyName: string | null;
  logoDataUrl: string | null;
  logoBg: string | null;
}

/**
 * White-label brand lockup for the auth pages. On a tenant subdomain it shows the
 * agency's logo + name (fetched from /public/branding/:slug); otherwise the
 * default SerpScale brand. `variant` controls sizing (large panel vs mobile mark).
 */
export function WhiteLabelBrand({ variant }: { variant: "panel" | "mark" }) {
  const [brand, setBrand] = useState<Brand | null>(null);

  useEffect(() => {
    const sub = tenantSubdomain();
    if (!sub) return;
    api.get<Brand>(`/public/branding/${encodeURIComponent(sub)}`).then((b) => {
      if (b && (b.agencyName || b.logoDataUrl)) setBrand(b);
    }).catch(() => {});
  }, []);

  const isPanel = variant === "panel";
  const logoSize = isPanel ? "h-10 w-10" : "h-9 w-9";
  const nameCls = isPanel ? "font-heading text-xl font-extrabold tracking-tight" : "font-heading text-lg font-extrabold tracking-tight";

  // Agency-branded
  if (brand) {
    return (
      <a href={MARKETING_HOME} className="flex items-center gap-3 transition-opacity hover:opacity-90">
        {brand.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoDataUrl}
            alt={brand.agencyName ?? "Logo"}
            className={`${logoSize} rounded-xl object-contain ${isPanel ? "bg-white p-1 shadow-lg" : ""}`}
            style={brand.logoBg ? { backgroundColor: brand.logoBg } : undefined}
          />
        ) : (
          <span className={`grid ${logoSize} place-items-center rounded-xl bg-white font-bold text-primary shadow-lg`}>
            {(brand.agencyName || "A").charAt(0).toUpperCase()}
          </span>
        )}
        {brand.agencyName && <span className={nameCls}>{brand.agencyName}</span>}
      </a>
    );
  }

  // Default SerpScale
  return (
    <a href={MARKETING_HOME} className="flex items-center gap-3 transition-opacity hover:opacity-90">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/serpscale-logo.svg" alt="SerpScale" className={`${logoSize} ${isPanel ? "rounded-xl bg-white p-1 shadow-lg" : ""}`} />
      <span className={nameCls}>
        {isPanel ? "SerpScale" : <><span className="text-primary">Serp</span>Scale</>}
      </span>
    </a>
  );
}
