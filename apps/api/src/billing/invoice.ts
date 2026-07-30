import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

export interface InvoiceData {
  product: string; // platform brand, e.g. "SerpScale"
  supportEmail: string;
  invoiceNo: string;
  date: string; // human date
  orgName: string;
  orgEmail: string;
  planName: string;
  amountCents: number;
  currency: string;
  status: string; // succeeded | pending | failed | refunded
  gateway: string; // stripe | paypal | manual
}

// The SerpScale logo mark, read once from disk. Falls back to an empty string
// (the wordmark alone) if the asset can't be located in this environment.
let LOGO_CACHE: string | null = null;
function logoSvg(): string {
  if (LOGO_CACHE != null) return LOGO_CACHE;
  const candidates = [
    path.resolve(process.cwd(), "../web/public/serpscale-logo.svg"),
    path.resolve(process.cwd(), "../../apps/web/public/serpscale-logo.svg"),
    path.resolve(__dirname, "../../../web/public/serpscale-logo.svg"),
  ];
  for (const p of candidates) {
    try {
      LOGO_CACHE = fs.readFileSync(p, "utf8").replace('width="512" height="512"', 'width="40" height="40"');
      return LOGO_CACHE;
    } catch {
      /* try next */
    }
  }
  LOGO_CACHE = "";
  return LOGO_CACHE;
}

const money = (cents: number, cur = "usd") =>
  `${cur.toLowerCase() === "usd" ? "$" : cur.toUpperCase() + " "}${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusChip = (s: string) => {
  const t = s.toLowerCase();
  const map: Record<string, [string, string, string]> = {
    succeeded: ["#059669", "#ecfdf5", "Paid"],
    pending: ["#b45309", "#fffbeb", "Pending"],
    failed: ["#dc2626", "#fef2f2", "Failed"],
    refunded: ["#4b5563", "#f3f4f6", "Refunded"],
  };
  const [fg, bg, label] = map[t] ?? ["#4b5563", "#f3f4f6", s];
  return `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:700;letter-spacing:.02em">${label}</span>`;
};

// Payment-method icon + branded label. PayPal uses its real logo (inline SVG),
// Stripe a card glyph — so the invoice shows a proper brand mark, not plain text.
function payMethod(gateway: string): { icon: string; label: string } {
  if (gateway === "paypal") {
    const icon = `<svg viewBox="0 0 384 512" width="18" height="18" style="vertical-align:middle"><path fill="#003087" d="M111.4 295.9c-3.5 19.2-17.4 108.7-21.5 134-.3 1.8-1 2.5-3 2.5H12.3c-7.6 0-13.1-6.6-12.1-13.9L58.8 46.6c1.5-9.6 10.1-16.9 20-16.9 152.3 0 165.1-3.7 204 11.4 60.1 23.3 65.6 79.5 44 140.3-21.5 62.6-72.5 89.5-140.1 90.3-43.4.7-69.5-7-77.3 24.2z"/><path fill="#009cde" d="M357.1 152c-1.8-1.3-2.5-1.8-3 1.3-2 11.4-5.1 22.5-8.8 33.6-39.9 113.8-150.5 103.9-204.5 103.9-6.1 0-10.1 3.3-10.9 9.4-22.6 140.4-27.1 169.7-27.1 169.7-1 7.1 3.5 12.9 10.6 12.9h63.5c8.6 0 15.7-6.3 17.4-14.9.7-5.4-1.1 6.1 14.4-91.3 4.6-22 14.3-19.7 29.3-19.7 71 0 126.4-28.8 142.9-112.3 6.5-34.8 4.6-71.4-23.3-95.5z"/></svg>`;
    return { icon, label: `<span style="color:#003087">Pay</span><span style="color:#009cde">Pal</span>` };
  }
  if (gateway === "stripe") {
    const icon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#2563EB" stroke-width="2" style="vertical-align:middle"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`;
    return { icon, label: "Card" };
  }
  return { icon: "", label: "Manual" };
}

function invoiceHtml(d: InvoiceData): string {
  const sub = money(d.amountCents, d.currency);
  const pm = payMethod(d.gateway);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;font-size:14px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .accent{height:8px;background:linear-gradient(90deg,#1e3a8a 0%,#2563EB 55%,#3b82f6 100%)}
    .page{padding:44px 56px 40px}
    .top{display:flex;justify-content:space-between;align-items:flex-start}
    .brand{display:flex;align-items:center;gap:13px}
    .brand .wm{font-size:26px;font-weight:800;letter-spacing:-.03em;line-height:1}
    .brand .wm .s{color:#2563EB}.brand .wm .c{color:#0f172a}
    .brand .sub{color:#6b7280;font-size:12px;margin-top:4px}
    .inv{text-align:right}
    .inv h1{font-size:30px;font-weight:800;letter-spacing:.06em;color:#2563EB;line-height:1}
    .inv .meta{color:#64748b;font-size:12.5px;margin-top:10px}
    .inv .meta b{color:#0f172a}
    .parties{display:flex;gap:16px;margin-top:32px}
    .party{flex:1;background:#f8fafc;border:1px solid #eef2f7;border-radius:14px;padding:16px 18px}
    .party.from{text-align:right}
    .party h4{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:#94a3b8;margin-bottom:7px;font-weight:700}
    .party .name{font-weight:700;font-size:15px}
    .party .muted{color:#64748b;font-size:12.5px;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin-top:30px;border:1px solid #eef2f7;border-radius:14px;overflow:hidden}
    thead th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:#64748b;padding:12px 18px;background:#f1f5f9;font-weight:700}
    thead th.r,tbody td.r{text-align:right}
    tbody td{padding:18px;border-top:1px solid #f1f5f9;vertical-align:top}
    tbody .desc{font-weight:700;font-size:14.5px}
    tbody .descsub{color:#64748b;font-size:12.5px;margin-top:3px}
    tbody td.r{font-weight:600;font-variant-numeric:tabular-nums}
    .totals{margin-top:20px;margin-left:auto;width:300px}
    .totals .row{display:flex;justify-content:space-between;padding:7px 18px;color:#475569;font-variant-numeric:tabular-nums}
    .totals .grand{margin-top:8px;padding:14px 18px;background:linear-gradient(90deg,#eff6ff,#f8fafc);border:1px solid #dbeafe;border-radius:12px;font-size:18px;font-weight:800;color:#0f172a;display:flex;justify-content:space-between}
    .totals .grand span:last-child{color:#2563EB}
    .pay{margin-top:32px;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #eef2f7;border-radius:14px;padding:18px 22px}
    .pay .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;font-weight:700}
    .pay .val{font-weight:800;margin-top:5px;display:inline-flex;align-items:center;gap:8px;font-size:15px}
    .thanks{margin-top:30px;color:#334155;font-size:13.5px}
    .thanks b{color:#0f172a}
    .foot{margin-top:36px;border-top:1px solid #eef2f7;padding-top:16px;color:#94a3b8;font-size:11.5px;display:flex;justify-content:space-between}
  </style></head><body>
    <div class="accent"></div>
    <div class="page">
    <div class="top">
      <div class="brand">
        ${logoSvg()}
        <div><div class="wm"><span class="s">Serp</span><span class="c">Scale</span></div>
        <div class="sub">The all-in-one SEO platform</div></div>
      </div>
      <div class="inv"><h1>INVOICE</h1>
        <div class="meta">Invoice <b>#${d.invoiceNo}</b><br>Date <b>${d.date}</b><br><span style="display:inline-block;margin-top:6px">${statusChip(d.status)}</span></div>
      </div>
    </div>

    <div class="parties">
      <div class="party"><h4>Billed to</h4><div class="name">${d.orgName}</div><div class="muted">${d.orgEmail}</div></div>
      <div class="party from"><h4>From</h4><div class="name">${d.product}</div><div class="muted">${d.supportEmail || "billing@serpscale.com"}</div></div>
    </div>

    <table>
      <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
      <tbody>
        <tr>
          <td><div class="desc">${d.planName} plan</div><div class="descsub">Subscription — recurring</div></td>
          <td class="r">${sub}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${sub}</span></div>
      <div class="row"><span>Tax</span><span>${money(0, d.currency)}</span></div>
      <div class="grand"><span>Total</span><span>${sub}</span></div>
    </div>

    <div class="pay">
      <div><div class="lbl">Payment method</div><div class="val">${pm.icon}<span>${pm.label}</span></div></div>
      <div style="text-align:right"><div class="lbl">Status</div><div class="val" style="margin-top:6px">${statusChip(d.status)}</div></div>
    </div>

    <div class="thanks"><b>Thank you for your business.</b> This is an official receipt for your ${d.product} subscription — keep it for your records.</div>

    <div class="foot"><span>${d.product} · The all-in-one SEO platform</span><span>Questions? ${d.supportEmail || "billing@serpscale.com"}</span></div>
  </div></body></html>`;
}

export async function renderInvoicePdf(d: InvoiceData): Promise<Buffer> {
  const html = invoiceHtml(d);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle", timeout: 20000 });
    const buf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
    return buf as Buffer;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
