import { chromium } from "playwright";

interface ReportProject {
  name: string;
  domain: string;
}
interface ReportCrawl {
  healthScore: number | null;
  pagesCrawled: number;
  errors: number;
  warnings: number;
  notices: number;
  finishedAt: Date | null;
  issuesSummary: unknown;
  pagespeed: unknown;
  linkGraph: unknown;
  technologies: unknown;
}

// White-label branding for a report: agency/org name + optional logo (data URL).
export interface ReportBrand {
  name: string;
  logo: string | null;
  logoBg: string | null;
}

// Extra SEO datasets (Search Console, Analytics, DataForSEO) folded into the report.
export interface ReportExtra {
  gsc?: any;
  ga?: any;
  backlinks?: any;
  ranked?: any;
  competitors?: any;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const fmtN = (n: unknown): string => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(v);
};
const pctOf = (v: unknown) => `${((Number(v) || 0) * 100).toFixed(1)}%`;
const posColor = (p: number | null) => (p == null ? GREY : p <= 3 ? GREEN : p <= 10 ? AMBER : GREY);
const rootDomain = (u: string) => String(u ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

const GREEN = "#16a34a", AMBER = "#d97706", RED = "#dc2626", GREY = "#6b7280";
const healthColor = (v: number) => (v >= 80 ? GREEN : v >= 50 ? AMBER : RED);
const sevColor = (s: string) => (s === "error" ? RED : s === "warning" ? AMBER : GREY);
const scoreColor = (v: number | null) => (v == null ? GREY : v >= 90 ? GREEN : v >= 50 ? AMBER : RED);
const shortUrl = (u: string) => { try { const x = new URL(u); return x.pathname === "/" ? "/" : x.pathname; } catch { return u; } };
const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${Math.round(n)} B`);
const fmtMs = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);

const CAT_LABELS: Record<string, string> = {
  crawlability: "Crawlability", indexability: "Indexability", onpage: "On-page", content: "Content",
  technical: "Technical", performance: "Performance", security: "Security", links: "Links",
};

// Inline, brand-accurate SVG marks for section headers (no emoji, print-safe).
const ICONS: Record<string, string> = {
  // Google Search Console — blue magnifier.
  gsc: `<svg viewBox="0 0 24 24" fill="none" stroke="#458CF5" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.4-4.4"/></svg>`,
  // Google Analytics — ascending rounded bars.
  ga: `<svg viewBox="0 0 24 24"><rect x="16" y="3" width="5" height="18" rx="2.5" fill="#E8710A"/><rect x="9.5" y="8" width="5" height="13" rx="2.5" fill="#F9AB00"/><circle cx="5.5" cy="18" r="2.6" fill="#F9AB00"/></svg>`,
  // Keyword rankings — trophy.
  rankings: `<svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12v4a6 6 0 0 1-12 0V4z"/><path d="M6 6H4a2 2 0 0 0 2 2M18 6h2a2 2 0 0 1-2 2M9 20h6M12 14v6"/></svg>`,
  // Backlinks — chain link.
  backlinks: `<svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round"><path d="M9 12h6"/><path d="M8.5 8H7a4 4 0 0 0 0 8h1.5M15.5 8H17a4 4 0 0 1 0 8h-1.5"/></svg>`,
  // Competitors — crosshair.
  competitors: `<svg viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
  // Technical audit — shield check.
  audit: `<svg viewBox="0 0 24 24" fill="none" stroke="#0f766e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.4-3 7.5-7 9-4-1.5-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
  // Lighthouse / PageSpeed — gauge.
  performance: `<svg viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 14l4-3"/></svg>`,
  // Internal linking — nodes.
  linking: `<svg viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7.5l3.2 8M16 7.5l-3.2 8M8 6h8"/></svg>`,
  // Detected technologies — chip.
  tech: `<svg viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3"/></svg>`,
};

// One Lighthouse strategy's Core Web Vitals table.
function vitalsTable(rep: any): string {
  if (!rep?.lab) return "";
  const rows = [
    ["LCP", rep.lab.lcp], ["CLS", rep.lab.cls], ["TBT", rep.lab.tbt],
    ["FCP", rep.lab.fcp], ["Speed Index", rep.lab.speedIndex], ["TTFB", rep.lab.ttfb],
  ].map(([label, m]: any) => {
    const score = typeof m?.score === "number" ? m.score : null;
    const color = score == null ? GREY : score >= 0.9 ? GREEN : score >= 0.5 ? AMBER : RED;
    return `<tr><td>${label}</td><td class="right" style="color:${color};font-weight:600">${esc(m?.display ?? "—")}</td></tr>`;
  }).join("");
  return `<table class="mini"><tbody>${rows}</tbody></table>`;
}

function scoreBlock(rep: any, title: string): string {
  if (!rep?.scores) return "";
  const cards = [["performance", "Performance"], ["accessibility", "Accessibility"], ["bestPractices", "Best Practices"], ["seo", "SEO"]]
    .map(([k, l]) => `<div class="scard"><div class="sval" style="color:${scoreColor(rep.scores[k])}">${rep.scores[k] ?? "—"}</div><div class="slabel">${l}</div></div>`)
    .join("");
  return `<div class="ps-col"><div class="ps-h">${title}</div><div class="scores">${cards}</div>${vitalsTable(rep)}</div>`;
}

// --- Inline SVG charts (print-safe, no libs) --------------------------------

// Horizontal bar chart: labelled rows with a value on the right.
function barsSvg(items: { label: string; value: number; color?: string }[], max?: number): string {
  const data = items.filter((i) => i.label != null).slice(0, 8);
  if (!data.length) return "";
  const m = max ?? Math.max(1, ...data.map((i) => i.value));
  const W = 640, labelW = 150, valW = 52, rowH = 22, gap = 8;
  const barW = W - labelW - valW;
  const H = data.length * (rowH + gap) - gap;
  const rows = data.map((it, i) => {
    const y = i * (rowH + gap);
    const bw = Math.max(3, (it.value / m) * barW);
    const c = it.color || "#4f46e5";
    return `<g transform="translate(0,${y})">
      <text x="0" y="15" font-size="11.5" fill="#374151">${esc(it.label.length > 26 ? it.label.slice(0, 25) + "…" : it.label)}</text>
      <rect x="${labelW}" y="3" width="${barW}" height="15" rx="7.5" fill="#f1f2f5"/>
      <rect x="${labelW}" y="3" width="${bw.toFixed(1)}" height="15" rx="7.5" fill="${c}"/>
      <text x="${W}" y="15" font-size="11.5" font-weight="700" fill="#111827" text-anchor="end">${fmtN(it.value)}</text>
    </g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${rows}</svg>`;
}

// Trend area chart with an optional second series (e.g. clicks + impressions).
function areaSvg(series: { values: number[]; color: string }[]): string {
  const W = 640, H = 120, pad = 6;
  const n = Math.max(...series.map((s) => s.values.length), 0);
  if (n < 2) return "";
  const all = series.flatMap((s) => s.values);
  const max = Math.max(1, ...all), min = Math.min(0, ...all), range = max - min || 1;
  const xy = (vals: number[]) => vals.map((v, i) => [(i / (vals.length - 1)) * W, H - pad - ((v - min) / range) * (H - pad * 2)] as const);
  const paths = series.map((s, si) => {
    const pts = xy(s.values);
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${W},${H} L0,${H} Z`;
    return `${si === 0 ? `<path d="${area}" fill="${s.color}" fill-opacity="0.10"/>` : ""}<path d="${line}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
  }).join("");
  const grid = [0.25, 0.5, 0.75].map((g) => `<line x1="0" y1="${(H * g).toFixed(0)}" x2="${W}" y2="${(H * g).toFixed(0)}" stroke="#eef0f4" stroke-width="1"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="max-width:${W}px;height:${H}px">${grid}${paths}</svg>`;
}

// A small legend row (dot + label).
function legend(items: { label: string; color: string }[]): string {
  return `<div class="legend">${items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join("")}</div>`;
}

// A titled chart panel.
function chartBox(title: string, svg: string, legendHtml = ""): string {
  return svg ? `<div class="chart"><div class="chart-h">${esc(title)}${legendHtml}</div>${svg}</div>` : "";
}

// Circular progress gauge (donut) for a 0–100 score, with the value centred.
function gaugeSvg(value: number, color: string, sub = "of 100"): string {
  const r = 52, cx = 60, cy = 60, C = 2 * Math.PI * r;
  const arc = Math.max(0, Math.min(1, value / 100)) * C;
  return `<svg viewBox="0 0 120 120" width="112" height="112">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#edeff3" stroke-width="11"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${arc.toFixed(1)} ${(C - arc).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="32" font-weight="800" fill="#111827">${value}</text>
    <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="10.5" font-weight="600" fill="#9aa1ad">${esc(sub)}</text>
  </svg>`;
}

// A compact donut for a distribution (e.g. issue severity) with a centre total.
function donutSvg(parts: { value: number; color: string }[], centerTop: string, centerSub: string): string {
  const r = 46, cx = 60, cy = 60, C = 2 * Math.PI * r, sw = 16;
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let offset = 0;
  const segs = parts.filter((p) => p.value > 0).map((p) => {
    const len = (p.value / total) * C;
    const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${sw}" stroke-dasharray="${(len - 1.5).toFixed(1)} ${(C - len + 1.5).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
    return el;
  }).join("");
  return `<svg viewBox="0 0 120 120" width="112" height="112"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#edeff3" stroke-width="${sw}"/>${segs}<text x="${cx}" y="${cy}" text-anchor="middle" font-size="24" font-weight="800" fill="#111827">${esc(centerTop)}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#9aa1ad">${esc(centerSub)}</text></svg>`;
}

export function buildReportHtml(project: ReportProject, crawl: ReportCrawl | null, brand: ReportBrand | string, extra: ReportExtra = {}): string {
  // Back-compat: accept a plain brand name or the full {name, logo} object.
  const b: ReportBrand = typeof brand === "string" ? { name: brand, logo: null, logoBg: null } : brand;
  const brandName = b.name || "SerpScale";
  const logoHtml = b.logo
    ? `<div class="logo" style="${b.logoBg ? `background:${esc(b.logoBg)}` : ""}"><img src="${esc(b.logo)}" alt="${esc(brandName)}"/></div>`
    : `<div class="logo logo-fallback">${esc(brandName.charAt(0).toUpperCase())}</div>`;
  // Faint full-page background watermark (agency logo if set, else brand name).
  const watermarkHtml = b.logo
    ? `<div class="wm"><img src="${esc(b.logo)}" alt=""/></div>`
    : `<div class="wm wm-text">${esc(brandName)}</div>`;
  // Allow a report even before the first crawl — SEO datasets still render.
  crawl = crawl ?? { healthScore: null, pagesCrawled: 0, errors: 0, warnings: 0, notices: 0, finishedAt: null, issuesSummary: [], pagespeed: null, linkGraph: null, technologies: [] };
  const hasCrawl = (crawl.pagesCrawled ?? 0) > 0;
  const health = crawl.healthScore ?? 0;
  const label = health >= 80 ? "Good" : health >= 50 ? "Needs work" : "Poor";
  const date = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const summary = (Array.isArray(crawl.issuesSummary) ? crawl.issuesSummary : []) as any[];
  const ps = crawl.pagespeed as any;
  const lg = crawl.linkGraph as any;
  const tech = (Array.isArray(crawl.technologies) ? crawl.technologies : []) as any[];
  const mob = ps?.mobile, desk = ps?.desktop;

  const catTotals = new Map<string, number>();
  for (const s of summary) catTotals.set(s.category, (catTotals.get(s.category) ?? 0) + s.count);
  const catRows = Object.entries(CAT_LABELS).map(([k, l]) =>
    `<div class="catcell"><div class="catn">${catTotals.get(k) ?? 0}</div><div class="catl">${l}</div></div>`).join("");

  // Full issue list, sorted by severity then count.
  const order: Record<string, number> = { error: 0, warning: 1, notice: 2 };
  const allIssues = [...summary].sort((a, b) => (order[a.severity] - order[b.severity]) || b.count - a.count);
  const issueRows = allIssues.map((s) => `
    <tr>
      <td><span class="dot" style="background:${sevColor(s.severity)}"></span>${esc(s.message)}</td>
      <td class="muted">${esc(CAT_LABELS[s.category] || s.category)}</td>
      <td class="cap muted">${esc(s.severity)}</td>
      <td class="num">${s.count}</td>
    </tr>`).join("");

  // PageSpeed opportunities + diagnostics (from mobile).
  const oppRows = (mob?.opportunities ?? []).map((o: any) =>
    `<tr><td>${esc(o.title)}</td><td class="num" style="color:${AMBER};font-weight:600">${o.savingsMs ? `−${fmtMs(o.savingsMs)}` : ""}</td></tr>`).join("");
  const diagRows = (mob?.diagnostics ?? []).map((d: any) =>
    `<tr><td>${esc(d.title)}</td><td class="num muted">${esc(d.display ?? "")}</td></tr>`).join("");
  const auditRows = (mob?.audits ?? []).map((a: any) =>
    `<tr><td>${esc(a.title)}</td><td class="muted">${esc(a.category)}</td><td class="num muted">${esc(a.display ?? "")}</td></tr>`).join("");

  // Internal linking detail.
  const brokenRows = (lg?.broken ?? []).map((b: any) =>
    `<tr><td><span class="dot" style="background:${RED}"></span>${esc(shortUrl(b.url))}</td><td class="num" style="color:${RED};font-weight:600">${esc(b.statusCode ?? "ERR")}</td><td class="num muted">${b.referrers?.length ?? 0}</td></tr>`).join("");
  const orphanRows = (lg?.orphans ?? []).slice(0, 40).map((o: any) =>
    `<tr><td>${esc(shortUrl(o.url))}</td><td class="num muted">depth ${o.depth}</td></tr>`).join("");
  const topLinkedRows = (lg?.topLinked ?? []).slice(0, 15).map((p: any) =>
    `<tr><td>${esc(shortUrl(p.url))}</td><td class="num" style="font-weight:600">${p.inlinks}</td></tr>`).join("");
  const depthRows = Object.entries(lg?.depthDist ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([d, n]) => `<tr><td>${d === "0" ? "Homepage" : `Depth ${d}`}</td><td class="num" style="font-weight:600">${n}</td></tr>`).join("");

  const section = (title: string, body: string, icon = "") =>
    body ? `<div class="sec"><h2>${icon ? `<span class="ic">${ICONS[icon] ?? ""}</span>` : ""}${title}</h2>${body}</div>` : "";
  const table = (head: string, rows: string, empty = "No data") =>
    `<table><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="9" class="muted" style="padding:14px">${empty}</td></tr>`}</tbody></table>`;
  const kpi = (v: string, l: string, color = "#1f2430") => `<div class="catcell"><div class="catn" style="color:${color}">${v}</div><div class="catl">${l}</div></div>`;
  const kpis = (cards: string) => `<div class="cats">${cards}</div>`;

  // ---- Search Console (GSC) ----
  const gsc = extra.gsc;
  const gscLive = gsc?.connected && gsc?.matched;
  const gscKpis = gscLive ? kpis(
    kpi(fmtN(gsc.totals?.clicks), "Clicks") + kpi(fmtN(gsc.totals?.impressions), "Impressions") +
    kpi(pctOf(gsc.totals?.ctr), "Avg. CTR") + kpi((gsc.totals?.position ?? 0).toFixed(1), "Avg. position")) : "";
  const gscQueryRows = (gsc?.queries ?? []).slice(0, 25).map((q: any) =>
    `<tr><td>${esc(q.key)}</td><td class="num">${fmtN(q.clicks)}</td><td class="num muted">${fmtN(q.impressions)}</td><td class="num muted">${pctOf(q.ctr)}</td><td class="num" style="color:${posColor(q.position)};font-weight:600">${(q.position ?? 0).toFixed(1)}</td></tr>`).join("");
  const gscTrend = (gsc?.trend ?? []) as any[];
  const gscChart = gscTrend.length > 1
    ? chartBox("Clicks & impressions — trend",
        areaSvg([{ values: gscTrend.map((t) => Number(t.clicks) || 0), color: "#458CF5" }, { values: gscTrend.map((t) => Number(t.impressions) || 0), color: "#a5c8fb" }]),
        legend([{ label: "Clicks", color: "#458CF5" }, { label: "Impressions", color: "#a5c8fb" }]))
    : "";
  const gscSection = gscLive ? section("Search performance — Google Search Console",
    `${gscKpis}${gscChart}${table(`<th>Query</th><th class="num">Clicks</th><th class="num">Impr.</th><th class="num">CTR</th><th class="num">Position</th>`, gscQueryRows, "No query data.")}`, "gsc") : "";

  // ---- Analytics (GA4) ----
  const ga = extra.ga;
  const gaLive = ga?.connected && ga?.matched;
  const gaKpis = gaLive ? kpis(
    kpi(fmtN(ga.totals?.sessions), "Sessions") + kpi(fmtN(ga.totals?.users), "Users") +
    kpi(fmtN(ga.totals?.pageviews), "Pageviews") + kpi(pctOf(ga.totals?.engagementRate), "Engagement")) : "";
  const gaChannelRows = (ga?.channels ?? []).slice(0, 10).map((c: any) =>
    `<tr><td>${esc(c.channel)}</td><td class="num" style="font-weight:600">${fmtN(c.sessions)}</td></tr>`).join("");
  const gaPageRows = (ga?.topPages ?? []).slice(0, 15).map((p: any) =>
    `<tr><td>${esc(p.path)}</td><td class="num">${fmtN(p.pageviews)}</td><td class="num muted">${fmtN(p.sessions)}</td></tr>`).join("");
  const gaTrend = (ga?.trend ?? []) as any[];
  const gaChart = gaTrend.length > 1
    ? chartBox("Sessions — trend", areaSvg([{ values: gaTrend.map((t) => Number(t.sessions) || 0), color: "#E8710A" }]), legend([{ label: "Sessions", color: "#E8710A" }]))
    : "";
  const gaChannelBars = chartBox("Traffic channels — sessions by source", barsSvg((ga?.channels ?? []).map((c: any) => ({ label: c.channel, value: Number(c.sessions) || 0, color: "#F9AB00" }))));
  const gaSection = gaLive ? section("Website traffic — Google Analytics",
    `${gaKpis}${gaChart}<div class="grid2" style="margin-top:10px">
      <div>${gaChannelBars}</div>
      <div><h2>Top pages</h2>${table(`<th>Page</th><th class="num">Views</th><th class="num">Sessions</th>`, gaPageRows)}</div>
    </div>`, "ga") : "";

  // ---- Keyword rankings (DataForSEO Labs) ----
  const ranked = extra.ranked;
  const rankedLive = ranked?.connected && (ranked?.keywords?.length ?? 0) > 0;
  const rt = ranked?.totals;
  const rankedKpis = rt ? kpis(
    kpi(fmtN(rt.count), "Ranked keywords") + kpi(fmtN(rt.pos_1 + rt.pos_2_3), "Top 3", GREEN) +
    kpi(fmtN(rt.pos_4_10), "Positions 4-10", AMBER) + kpi(fmtN(rt.etv), "Est. traffic / mo")) : "";
  const rankedRows = (ranked?.keywords ?? []).slice(0, 40).map((k: any) =>
    `<tr><td>${esc(k.keyword)}</td><td class="num" style="color:${posColor(k.position)};font-weight:600">${k.position ?? "—"}</td><td class="num muted">${fmtN(k.volume)}</td><td class="muted" style="font-size:10px">${esc(k.url ? rootDomain(k.url) + (new URL(k.url).pathname || "") : "")}</td></tr>`).join("");
  const rankDistBars = rt ? chartBox("Ranking distribution", barsSvg([
    { label: "Top 3", value: (rt.pos_1 || 0) + (rt.pos_2_3 || 0), color: "#16a34a" },
    { label: "Positions 4-10", value: rt.pos_4_10 || 0, color: "#d97706" },
    { label: "Positions 11+", value: Math.max(0, (rt.count || 0) - (rt.pos_1 || 0) - (rt.pos_2_3 || 0) - (rt.pos_4_10 || 0)), color: "#6b7280" },
  ])) : "";
  const rankedSection = rankedLive ? section("Keyword rankings",
    `${rankedKpis}${rankDistBars}${table(`<th>Keyword</th><th class="num">Position</th><th class="num">Volume</th><th>Ranking page</th>`, rankedRows)}`, "rankings") : "";

  // ---- Backlink profile (DataForSEO Backlinks) ----
  const bl = extra.backlinks;
  const blLive = bl?.connected && (bl?.summary?.backlinks ?? 0) > 0;
  const bs = bl?.summary;
  const blKpis = bs ? kpis(
    kpi(fmtN(bs.backlinks), "Backlinks") + kpi(fmtN(bs.referringDomains), "Referring domains") +
    kpi(fmtN(bs.dofollow), "Dofollow", GREEN) + kpi(`${bs.spamScore ?? 0}%`, "Spam score", (bs.spamScore ?? 0) >= 30 ? RED : GREEN)) : "";
  const blRows = (bl?.referringDomains ?? []).slice(0, 25).map((d: any) =>
    `<tr><td>${esc(d.domain)}</td><td class="num">${fmtN(d.backlinks)}</td><td class="num" style="color:${GREEN}">${fmtN(d.dofollow)}</td><td class="num muted">${d.rank ?? 0}</td></tr>`).join("");
  const blBars = chartBox("Top referring domains — by backlinks", barsSvg((bl?.referringDomains ?? []).map((d: any) => ({ label: d.domain, value: Number(d.backlinks) || 0, color: "#0ea5e9" }))));
  const blSection = blLive ? section("Backlink profile",
    `${blKpis}${blBars}${table(`<th>Referring domain</th><th class="num">Backlinks</th><th class="num">Dofollow</th><th class="num">Rank</th>`, blRows)}`, "backlinks") : "";

  // ---- Competitors (DataForSEO Labs) ----
  const comp = extra.competitors;
  const compLive = (comp?.competitors?.length ?? 0) > 0;
  const compRows = (comp?.competitors ?? []).slice(0, 20).map((c: any) =>
    `<tr><td>${esc(c.domain)}</td><td class="num" style="font-weight:600">${fmtN(c.commonKeywords)}</td><td class="num muted">${fmtN(c.keywords)}</td><td class="num" style="color:${GREEN}">${fmtN(c.top10)}</td><td class="num muted">${fmtN(c.etv)}</td></tr>`).join("");
  const compBars = chartBox("Competitors — shared keywords", barsSvg((comp?.competitors ?? []).map((c: any) => ({ label: c.domain, value: Number(c.commonKeywords) || 0, color: "#e11d48" }))));
  const compSection = compLive ? section("Organic competitors",
    `${compBars}${table(`<th>Domain</th><th class="num">Common kw</th><th class="num">Keywords</th><th class="num">Top 10</th><th class="num">Est. traffic</th>`, compRows)}`, "competitors") : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing:border-box; }
    body { font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#1f2430; margin:0; font-size:12px; -webkit-print-color-adjust:exact; }
    .page { padding:0 4px; }
    .head { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #ecedf2; padding-bottom:14px; margin-bottom:16px; }
    .brandrow { display:flex; align-items:center; gap:12px; }
    .logo { width:46px; height:46px; border-radius:12px; overflow:hidden; display:flex; align-items:center; justify-content:center; border:1px solid #e6e8ee; }
    .logo img { width:100%; height:100%; object-fit:contain; }
    .logo-fallback { background:#4f46e5; color:#fff; font-weight:800; font-size:22px; border:0; }
    .brandname { font-size:17px; font-weight:800; letter-spacing:-.2px; color:#111827; }
    .reptype { font-size:10.5px; font-weight:600; letter-spacing:.6px; color:#6b7280; text-transform:uppercase; margin-top:1px; }
    .meta { text-align:right; }
    .meta .proj { font-size:13px; font-weight:700; color:#1f2430; }
    .meta .muted { font-size:11px; }
    h2 { font-size:13.5px; margin:0 0 9px; padding-bottom:6px; border-bottom:1px solid #eef0f4; display:flex; align-items:center; gap:7px; color:#111827; }
    .ic { display:inline-flex; width:17px; height:17px; flex-shrink:0; }
    .ic svg { width:17px; height:17px; display:block; }
    .muted { color:#6b7280; }
    .cap { text-transform:capitalize; }
    .sec { margin-top:18px; }
    .sec h2 { page-break-after:avoid; }
    tr { page-break-inside:avoid; }
    .hero { display:flex; gap:24px; align-items:center; background:linear-gradient(180deg,#fbfbfd,#f6f7fa); border:1px solid #eaecf1; border-radius:14px; padding:16px 22px; }
    .gauge { flex-shrink:0; display:flex; }
    .hstats { display:flex; gap:24px; margin-top:12px; }
    .hstat { display:flex; align-items:center; gap:8px; }
    .hdot { width:9px; height:9px; border-radius:50%; display:inline-block; flex-shrink:0; }
    .hstat .v { font-size:19px; font-weight:800; line-height:1; }
    .hstat .l { font-size:10.5px; color:#6b7280; margin-top:1px; }
    .hero-right { flex-shrink:0; }
    .sevlbl { font-size:9.5px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:.4px; margin-bottom:4px; }
    .accent { height:4px; border-radius:4px; background:linear-gradient(90deg,#4f46e5,#7c3aed,#458CF5); margin-bottom:14px; }
    .cats { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
    .catcell { border:1px solid #eef0f4; border-radius:8px; padding:9px 12px; }
    .catn { font-size:18px; font-weight:700; }
    .catl { font-size:11px; color:#6b7280; }
    .ps-wrap { display:flex; gap:12px; }
    .ps-col { flex:1; border:1px solid #eef0f4; border-radius:10px; padding:12px; }
    .ps-h { font-size:12px; font-weight:700; margin-bottom:8px; color:#4b5563; }
    .scores { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:8px; }
    .scard { border:1px solid #f1f2f5; border-radius:7px; padding:8px; text-align:center; }
    .sval { font-size:20px; font-weight:800; }
    .slabel { font-size:9px; color:#6b7280; }
    table { width:100%; border-collapse:collapse; }
    th { text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:.4px; color:#9aa1ad; border-bottom:1px solid #eef0f4; padding:6px 8px; }
    td { padding:5.5px 8px; border-bottom:1px solid #f2f3f6; font-size:12px; }
    td.num, th.num, td.right, th.right { text-align:right; }
    table.mini td { padding:3px 4px; border-bottom:1px solid #f5f6f8; font-size:11px; }
    .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; vertical-align:middle; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .chips span { display:inline-block; border:1px solid #eef0f4; border-radius:6px; padding:2px 8px; margin:0 4px 4px 0; font-size:11px; }
    .chart { border:1px solid #eef0f4; border-radius:10px; padding:12px 14px; margin:10px 0; page-break-inside:avoid; }
    .chart-h { font-size:11.5px; font-weight:700; color:#4b5563; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; }
    .legend { display:flex; gap:12px; }
    .legend span { display:inline-flex; align-items:center; gap:5px; font-size:10.5px; font-weight:500; color:#6b7280; }
    .legend i { width:9px; height:9px; border-radius:2px; display:inline-block; }
    .subhead { font-size:15px; font-weight:800; margin:24px 0 2px; color:#111827; letter-spacing:-.2px; }
    .foot { margin-top:22px; padding-top:10px; border-top:1px solid #eef0f4; font-size:10px; color:#9aa1ad; text-align:center; }
    .wm { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:0; opacity:.05; pointer-events:none; }
    .wm img { width:60%; max-width:460px; }
    .wm-text { font-size:110px; font-weight:800; color:#4f46e5; transform:rotate(-28deg); letter-spacing:2px; white-space:nowrap; }
    .page { position:relative; z-index:1; }
  </style></head><body>${watermarkHtml}<div class="page">
    <div class="accent"></div>
    <div class="head">
      <div class="brandrow">
        ${logoHtml}
        <div><div class="brandname">${esc(brandName)}</div><div class="reptype">SEO Performance Report</div></div>
      </div>
      <div class="meta">
        <div class="proj">${esc(project.name)}</div>
        <div class="muted">${esc(project.domain)}</div>
        <div class="muted" style="margin-top:3px">${esc(date)}</div>
      </div>
    </div>

    ${hasCrawl ? `<div class="hero">
      <div class="gauge">${gaugeSvg(health, healthColor(health))}</div>
      <div style="flex:1">
        <div style="font-size:17px;font-weight:800;color:#111827">Site health: ${label}</div>
        <div class="muted" style="margin-top:2px">Crawled ${crawl.pagesCrawled.toLocaleString()} pages · Full technical audit</div>
        <div class="hstats">
          <div class="hstat"><span class="hdot" style="background:${RED}"></span><div><div class="v" style="color:${RED}">${crawl.errors}</div><div class="l">Errors</div></div></div>
          <div class="hstat"><span class="hdot" style="background:${AMBER}"></span><div><div class="v" style="color:${AMBER}">${crawl.warnings}</div><div class="l">Warnings</div></div></div>
          <div class="hstat"><span class="hdot" style="background:${GREY}"></span><div><div class="v" style="color:${GREY}">${crawl.notices}</div><div class="l">Notices</div></div></div>
        </div>
      </div>
      ${(() => {
        const tot = (crawl.errors || 0) + (crawl.warnings || 0) + (crawl.notices || 0);
        if (!tot) return "";
        return `<div class="hero-right">
          <div class="sevlbl" style="text-align:center">Issue breakdown</div>
          ${donutSvg([{ value: crawl.errors, color: RED }, { value: crawl.warnings, color: AMBER }, { value: crawl.notices, color: GREY }], fmtN(tot), "issues")}
        </div>`;
      })()}
    </div>` : ""}

    ${hasCrawl ? section("Issues by category", barsSvg(Object.entries(CAT_LABELS).map(([k, l]) => ({ label: l, value: catTotals.get(k) ?? 0, color: "#4f46e5" })).filter((i) => i.value > 0).sort((a, b) => b.value - a.value)), "audit") : ""}

    ${gscSection}
    ${gaSection}
    ${rankedSection}
    ${blSection}
    ${compSection}

    ${hasCrawl ? `<div class="subhead">Technical site audit</div>` : ""}

    ${(mob || desk) ? section("Performance — Lighthouse & Core Web Vitals", `<div class="ps-wrap">${scoreBlock(mob, "Mobile")}${scoreBlock(desk, "Desktop")}</div>`, "performance") : ""}

    ${lg?.totals ? section("Internal linking", `<div class="cats">
      <div class="catcell"><div class="catn">${(lg.totals.internalLinks ?? 0).toLocaleString()}</div><div class="catl">Internal links</div></div>
      <div class="catcell"><div class="catn">${lg.totals.avgInlinks}</div><div class="catl">Avg links / page</div></div>
      <div class="catcell"><div class="catn" style="color:${lg.totals.orphans > 0 ? AMBER : GREEN}">${lg.totals.orphans}</div><div class="catl">Orphan pages</div></div>
      <div class="catcell"><div class="catn" style="color:${lg.totals.broken > 0 ? RED : GREEN}">${lg.totals.broken}</div><div class="catl">Broken links</div></div>
    </div>`, "linking") : ""}

    ${hasCrawl ? section("All issues found", table(`<th>Issue</th><th>Category</th><th>Severity</th><th class="num">Pages</th>`, issueRows, "No issues found.")) : ""}

    ${oppRows ? section("PageSpeed opportunities (mobile)", table(`<th>Opportunity</th><th class="num">Est. savings</th>`, oppRows)) : ""}
    ${diagRows ? section("PageSpeed diagnostics (mobile)", table(`<th>Diagnostic</th><th class="num">Value</th>`, diagRows)) : ""}
    ${auditRows ? section("Accessibility, SEO & Best-Practice checks", table(`<th>Check</th><th>Category</th><th class="num">Value</th>`, auditRows)) : ""}

    ${brokenRows ? section("Broken internal links", table(`<th>Page</th><th class="num">Status</th><th class="num">Referrers</th>`, brokenRows)) : ""}

    <div class="sec grid2">
      ${topLinkedRows ? `<div><h2>Most-linked pages</h2>${table(`<th>Page</th><th class="num">Inlinks</th>`, topLinkedRows)}</div>` : ""}
      ${depthRows ? `<div><h2>Crawl depth</h2>${table(`<th>Level</th><th class="num">Pages</th>`, depthRows)}</div>` : ""}
    </div>

    ${orphanRows ? section("Orphan pages", table(`<th>Page</th><th class="num">Depth</th>`, orphanRows)) : ""}

    ${tech.length ? section("Detected technologies", `<div class="chips">${tech.map((t: any) => `<span>${esc(t.name)}</span>`).join("")}</div>`, "tech") : ""}

    <div class="foot">${esc(brandName)} — SEO Performance Report for ${esc(project.domain)} · Generated ${esc(date)}</div>
  </div></body></html>`;
}

// Render an HTML string to a PDF buffer via headless Chromium.
export async function renderPdf(html: string): Promise<Buffer | null> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle", timeout: 20000 });
    const buf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "14mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(buf);
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
