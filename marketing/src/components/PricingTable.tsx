"use client";

import { useState, type CSSProperties } from "react";
import type { Plan, PricingTier } from "@/lib/plans";

// The marketing site has no Tailwind (Bootstrap + custom CSS), so this comparison
// table is built entirely with self-contained inline styles.
const ACCENT = "#7B1FE4";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.serpscale.com";

function fmtPrice(cents: number, currency: string): string {
  const sym = currency?.toLowerCase() === "inr" ? "₹" : "$";
  const v = cents / 100;
  return `${sym}${v % 1 === 0 ? v.toLocaleString() : v.toFixed(2)}`;
}
function sortedTiers(plan: Plan): PricingTier[] {
  return Array.isArray(plan.pricingTiers) ? [...plan.pricingTiers].sort((a, b) => a.keywords - b.keywords) : [];
}
function featureSet(plan: Plan): Set<string> {
  // Prefer server-provided human labels (derived from the feature catalog);
  // fall back to raw feature values for older payloads.
  if (Array.isArray(plan.featureLabels) && plan.featureLabels.length) return new Set(plan.featureLabels);
  const arr = Array.isArray(plan.features)
    ? plan.features.filter((f): f is string => typeof f === "string")
    : plan.features
      ? Object.entries(plan.features).filter(([, v]) => v === true).map(([k]) => k)
      : [];
  return new Set(arr);
}
// Any numeric limit → display string. Large numbers read as "Unlimited".
function limitLabel(plan: Plan, key: string): string {
  const n = plan.limits?.[key];
  if (n == null || n === 0) return "—";
  return n >= 1000 ? "Unlimited" : n.toLocaleString();
}
// Monthly AI blog allowance — shows the REAL number (never "Unlimited", since it's
// a genuine metered cap). 0 / missing content plan → "—".
function blogLabel(plan: Plan): string {
  const n = plan.limits?.blogsPerMonth;
  if (n == null) return "Unlimited";
  if (n <= 0) return "—";
  return `${n.toLocaleString()}/mo`;
}
// Whether the plan includes the content tools (AI blog + auto images).
function hasContent(plan: Plan): boolean {
  return Array.isArray(plan.features) ? plan.features.includes("content") : false;
}

const labelCell: CSSProperties = {
  padding: "14px 16px", textAlign: "left", fontSize: 14, fontWeight: 500,
  color: "#111827", borderBottom: "1px solid #eef0f4",
  background: "#ffffff", minWidth: 230,
};
const cell: CSSProperties = {
  padding: "14px 16px", textAlign: "center", fontSize: 14, color: "#374151",
  borderBottom: "1px solid #eef0f4", borderLeft: "1px solid #f4f5f8", minWidth: 170,
};
const Check = () => <span style={{ color: ACCENT, fontWeight: 700, fontSize: 16 }}>✓</span>;
const Dash = () => <span style={{ color: "#d1d5db" }}>—</span>;

function SectionRow({ label, cols }: { label: string; cols: number }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: ACCENT, background: "#faf7ff", borderBottom: "1px solid #eef0f4" }}>
        {label}
      </td>
    </tr>
  );
}

export function PricingTable({ plans }: { plans: Plan[] }) {
  const [sel, setSel] = useState<Record<string, number>>({});
  const idxOf = (slug: string) => sel[slug] ?? 0;
  const setIdx = (slug: string, i: number) => setSel((s) => ({ ...s, [slug]: i }));

  if (!plans.length) {
    return (
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "128px 16px", textAlign: "center" }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: "var(--foreground)" }}>Pricing</h1>
        <p style={{ marginTop: 12, color: "#6b7280" }}>Plans are being updated — please check back shortly.</p>
      </section>
    );
  }

  // Union of every plan's features (first-seen order) → the comparison rows.
  const allFeatures: string[] = [];
  const seen = new Set<string>();
  for (const p of plans) for (const f of featureSet(p)) if (!seen.has(f)) { seen.add(f); allFeatures.push(f); }

  const priceFor = (p: Plan) => {
    const t = sortedTiers(p);
    return t.length ? t[Math.min(idxOf(p.slug), t.length - 1)].priceCents : p.priceCents;
  };
  const kwFor = (p: Plan): number | null => {
    const t = sortedTiers(p);
    return t.length ? t[Math.min(idxOf(p.slug), t.length - 1)].keywords : (p.limits?.keywords ?? null);
  };
  const cols = plans.length + 1;

  return (
    <section style={{ maxWidth: 1280, margin: "0 auto", padding: "128px 16px 72px" }}>
      <div style={{ textAlign: "center", marginBottom: 46 }}>
        <span style={{ display: "inline-block", padding: "6px 16px", borderRadius: 999, background: `${ACCENT}14`, color: ACCENT, fontWeight: 800, letterSpacing: 1.4, fontSize: 12.5, textTransform: "uppercase" }}>Pricing &amp; Packages</span>
        <h1 style={{ fontSize: 52, fontWeight: 900, color: "var(--foreground)", margin: "16px 0 0", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
          One platform.{" "}
          <span style={{ background: `linear-gradient(90deg,#A121CA,${ACCENT})`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: ACCENT }}>Every SEO tool.</span>
          <br />Priced to grow with you.
        </h1>
        <p style={{ maxWidth: 690, margin: "18px auto 0", color: "#4b5563", fontSize: 17.5, lineHeight: 1.6, fontWeight: 500 }}>
          From independent marketers to full-scale agencies — every plan comes with the{" "}
          <strong style={{ color: "#111827", fontWeight: 700 }}>complete toolkit</strong>: rank tracking, site audits, backlinks and keyword research.
          Just choose your keyword volume and{" "}
          <strong style={{ color: "#111827", fontWeight: 700 }}>scale up the moment you grow</strong>. No bloat, no surprises.
        </p>
        <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: "10px 14px", justifyContent: "center", fontSize: 14, color: "#111827", fontWeight: 600 }}>
          {["7-day free trial on Starter", "No long-term contracts", "Cancel anytime", "Switch plans instantly"].map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 999, background: "#ffffff", border: "1px solid #ece8f6", boxShadow: "0 2px 8px -4px rgba(20,10,40,.12)" }}>
              <span style={{ display: "inline-flex", width: 18, height: 18, borderRadius: 999, background: ACCENT, color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>✓</span>
              {t}
            </span>
          ))}
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, background: "#ffffff" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...labelCell, borderBottom: "1px solid #e5e7eb", verticalAlign: "bottom", position: "sticky", top: 80, zIndex: 4 }} />
              {plans.map((p) => {
                const tiers = sortedTiers(p);
                return (
                  <th key={p.id} style={{ padding: "20px 16px", textAlign: "center", borderBottom: "1px solid #e5e7eb", borderLeft: "1px solid #f1f2f5", verticalAlign: "top", minWidth: 180, position: "sticky", top: 80, background: "#ffffff", zIndex: 3, boxShadow: "0 1px 0 #e5e7eb" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{p.name}</div>
                    <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3 }}>
                      <span style={{ fontSize: 30, fontWeight: 800, color: "#111827", lineHeight: 1 }}>{fmtPrice(priceFor(p), p.currency)}</span>
                      <span style={{ fontSize: 13, color: "#6b7280" }}>/{p.interval === "year" ? "yr" : "mo"}</span>
                    </div>
                    {tiers.length > 0 ? (
                      <select
                        aria-label={`Tracked keywords for the ${p.name} plan`}
                        value={idxOf(p.slug)}
                        onChange={(e) => setIdx(p.slug, Number(e.target.value))}
                        style={{ marginTop: 10, width: "100%", borderRadius: 8, border: "1px solid #d1d5db", padding: "6px 8px", fontSize: 13, fontWeight: 500, color: "#111827", background: "#ffffff" }}
                      >
                        {tiers.map((t, i) => (
                          <option key={i} value={i}>{t.keywords.toLocaleString()} keywords</option>
                        ))}
                      </select>
                    ) : (p.trialDays ?? 0) > 0 ? (
                      <div style={{ marginTop: 10, height: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#047857", background: "#ecfdf5", borderRadius: 8 }}>
                        <span style={{ fontSize: 14 }}>&#10004;</span> {p.trialDays}-day free trial
                      </div>
                    ) : (
                      <div style={{ marginTop: 10, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#9ca3af" }}>Fixed price</div>
                    )}
                    {(p.trialDays ?? 0) > 0 ? (
                      <>
                        <a
                          href={`${APP_URL}/signup?plan=${encodeURIComponent(p.slug)}&trial=1`}
                          style={{ marginTop: 12, display: "block", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 600, color: "#ffffff", background: ACCENT, textDecoration: "none" }}
                        >
                          Start free trial
                        </a>
                        <a
                          href={`${APP_URL}/signup?plan=${encodeURIComponent(p.slug)}`}
                          style={{ marginTop: 8, display: "block", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: ACCENT, background: "#ffffff", border: `1px solid ${ACCENT}`, textDecoration: "none" }}
                        >
                          Get started
                        </a>
                      </>
                    ) : (
                      <a
                        href={`${APP_URL}/signup?plan=${encodeURIComponent(p.slug)}${tiers.length ? `&keywords=${tiers[Math.min(idxOf(p.slug), tiers.length - 1)].keywords}` : ""}`}
                        style={{ marginTop: 12, display: "block", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 600, color: "#ffffff", background: ACCENT, textDecoration: "none" }}
                      >
                        Get started
                      </a>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <SectionRow label="Usage" cols={cols} />
            <tr>
              <td style={labelCell}>Campaigns</td>
              {plans.map((p) => <td key={p.id} style={cell}>{limitLabel(p, "projects")}</td>)}
            </tr>
            <tr>
              <td style={labelCell}>Keywords tracked</td>
              {plans.map((p) => <td key={p.id} style={{ ...cell, fontWeight: 700, color: "#111827" }}>{kwFor(p)?.toLocaleString() ?? "—"}</td>)}
            </tr>
            <tr>
              <td style={labelCell}>Team members</td>
              {plans.map((p) => <td key={p.id} style={cell}>{limitLabel(p, "seats")}</td>)}
            </tr>
            <tr>
              <td style={labelCell}>Clients</td>
              {plans.map((p) => <td key={p.id} style={cell}>{limitLabel(p, "clients")}</td>)}
            </tr>

            <SectionRow label="AI content &amp; images" cols={cols} />
            <tr>
              <td style={labelCell}>AI blog posts / month</td>
              {plans.map((p) => <td key={p.id} style={{ ...cell, fontWeight: 700, color: "#111827" }}>{blogLabel(p)}</td>)}
            </tr>
            <tr>
              <td style={labelCell}>AI images auto-added to blogs</td>
              {plans.map((p) => <td key={p.id} style={cell}>{hasContent(p) ? <Check /> : <Dash />}</td>)}
            </tr>

            <SectionRow label="Features included" cols={cols} />
            {allFeatures.map((f) => (
              <tr key={f}>
                <td style={labelCell}>{f}</td>
                {plans.map((p) => (
                  <td key={p.id} style={cell}>{featureSet(p).has(f) ? <Check /> : <Dash />}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
