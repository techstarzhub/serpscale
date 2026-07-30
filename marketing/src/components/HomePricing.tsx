"use client";

import { useState, type CSSProperties } from "react";
import type { Plan, PricingTier } from "@/lib/plans";

const ACCENT = "#7B1FE4";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.serpscale.com";
const POPULAR_SLUG = "agency"; // the plan we highlight as "Most popular"

const sortedTiers = (p: Plan): PricingTier[] =>
  Array.isArray(p.pricingTiers) ? [...p.pricingTiers].sort((a, b) => a.keywords - b.keywords) : [];
const fmt = (c: number, cur = "usd") =>
  `${cur.toLowerCase() === "usd" ? "$" : cur.toUpperCase() + " "}${Math.round(c / 100).toLocaleString()}`;
const limNum = (v: unknown) => {
  const n = Number(v);
  return v == null || !Number.isFinite(n) || n >= 100000 ? "Unlimited" : n.toLocaleString();
};

const Check = ({ on = ACCENT }: { on?: string }) => (
  <span style={{ display: "inline-flex", width: 18, height: 18, borderRadius: 999, background: `${on}1a`, color: on, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  </span>
);

const featRow: CSSProperties = { display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "#374151", lineHeight: 1.3 };
const cta = (primary: boolean): CSSProperties => ({
  display: "block", textAlign: "center", borderRadius: 10, padding: "11px 12px", fontSize: 14, fontWeight: 700, textDecoration: "none",
  color: primary ? "#fff" : ACCENT,
  background: primary ? `linear-gradient(90deg,#A121CA,${ACCENT})` : "#fff",
  border: primary ? "none" : `1.5px solid ${ACCENT}`,
});

export function HomePricing({ plans }: { plans: Plan[] }) {
  const [sel, setSel] = useState<Record<string, number>>({});
  const idx = (s: string) => sel[s] ?? 0;
  if (!plans.length) return null;

  return (
    <div style={{ maxWidth: 1220, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 44 }}>
        <span className="pp-sub-title" style={{ color: ACCENT, fontWeight: 700, letterSpacing: 1, fontSize: 13 }}>PRICING</span>
        <h2 style={{ margin: "8px 0 12px", fontSize: 38, fontWeight: 800, color: "#0f1222", letterSpacing: "-0.02em" }}>Simple, transparent pricing</h2>
        <p style={{ maxWidth: 580, margin: "0 auto", color: "#6b7280", fontSize: 16, lineHeight: 1.6 }}>
          Pick a plan and choose exactly how many keywords you need. Start free on Starter, upgrade anytime.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(216px, 1fr))", gap: 20, alignItems: "stretch" }}>
        {plans.map((p) => {
          const tiers = sortedTiers(p);
          const tier = tiers.length ? tiers[Math.min(idx(p.slug), tiers.length - 1)] : null;
          const price = tier ? tier.priceCents : p.priceCents;
          const kw = tier ? tier.keywords : (p.limits?.keywords ?? null);
          const popular = p.slug === POPULAR_SLUG;
          const trial = (p.trialDays ?? 0) > 0;
          const feats = (p.featureLabels ?? []).slice(0, 4);
          return (
            <div
              key={p.id}
              style={{
                position: "relative", display: "flex", flexDirection: "column",
                background: "#fff", borderRadius: 18, padding: "30px 24px 26px",
                border: popular ? `2px solid ${ACCENT}` : "1px solid #eceaf5",
                boxShadow: popular ? "0 24px 60px -22px rgba(123,31,228,.5)" : "0 12px 34px -22px rgba(20,10,40,.22)",
                transform: popular ? "translateY(-10px)" : "none",
                zIndex: popular ? 2 : 1,
              }}
            >
              {popular && (
                <span style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(90deg,#A121CA,${ACCENT})`, color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: 0.6, padding: "5px 15px", borderRadius: 999, whiteSpace: "nowrap" }}>
                  MOST POPULAR
                </span>
              )}
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0f1222" }}>{p.name}</div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "flex-end", gap: 4 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: "#0f1222", lineHeight: 1, letterSpacing: "-0.03em" }}>{price === 0 ? "Free" : fmt(price, p.currency)}</span>
                {price > 0 && <span style={{ fontSize: 14, color: "#6b7280", paddingBottom: 3 }}>/{p.interval === "year" ? "yr" : "mo"}</span>}
              </div>

              {tiers.length > 0 ? (
                <select
                  value={idx(p.slug)}
                  onChange={(e) => setSel((s) => ({ ...s, [p.slug]: Number(e.target.value) }))}
                  style={{ marginTop: 14, width: "100%", borderRadius: 10, border: "1px solid #d8d5e6", padding: "9px 10px", fontSize: 13, fontWeight: 600, color: "#0f1222", background: "#fbfaff", cursor: "pointer" }}
                >
                  {tiers.map((t, i) => <option key={i} value={i}>{t.keywords.toLocaleString()} keywords</option>)}
                </select>
              ) : trial ? (
                <div style={{ marginTop: 14, textAlign: "center", background: "#ecfdf5", color: "#059669", fontWeight: 700, fontSize: 12.5, borderRadius: 10, padding: "9px 8px" }}>✔ {p.trialDays}-day free trial</div>
              ) : (
                <div style={{ marginTop: 14, height: 38 }} />
              )}

              <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
                <li style={featRow}><Check /> <span><b style={{ color: "#0f1222" }}>{kw ? Number(kw).toLocaleString() : "—"}</b> keywords tracked</span></li>
                <li style={featRow}><Check /> <span><b style={{ color: "#0f1222" }}>{limNum(p.limits?.projects)}</b> campaigns</span></li>
                {feats.map((f) => <li key={f} style={featRow}><Check /> <span>{f}</span></li>)}
              </ul>

              <div style={{ marginTop: "auto", paddingTop: 22, display: "flex", flexDirection: "column", gap: 8 }}>
                {trial && <a href={`${APP_URL}/signup?plan=${encodeURIComponent(p.slug)}&trial=1`} style={cta(true)}>Start free trial</a>}
                <a href={`${APP_URL}/signup?plan=${encodeURIComponent(p.slug)}${tiers.length ? `&keywords=${tier?.keywords}` : ""}`} style={cta(popular && !trial)}>Get started</a>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center", marginTop: 30 }}>
        <a href="/pricing" style={{ color: ACCENT, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Compare all features →</a>
      </div>
    </div>
  );
}
