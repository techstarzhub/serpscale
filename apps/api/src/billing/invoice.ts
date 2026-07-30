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

function invoiceHtml(d: InvoiceData): string {
  const sub = money(d.amountCents, d.currency);
  const gatewayLabel = d.gateway === "stripe" ? "Card (Stripe)" : d.gateway === "paypal" ? "PayPal" : "Manual";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;font-size:14px;line-height:1.5}
    .page{padding:56px 56px 40px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2563EB;padding-bottom:22px}
    .brand{display:flex;align-items:center;gap:12px}
    .brand .wm{font-size:26px;font-weight:800;letter-spacing:-.03em}
    .brand .wm .s{color:#2563EB}.brand .wm .c{color:#111827}
    .brand .sub{color:#6b7280;font-size:12px;margin-top:2px}
    .inv h1{font-size:26px;font-weight:800;letter-spacing:.04em;color:#2563EB;text-align:right}
    .inv .meta{color:#6b7280;font-size:12.5px;text-align:right;margin-top:6px}
    .inv .meta b{color:#111827}
    .parties{display:flex;justify-content:space-between;gap:30px;margin-top:30px}
    .parties h4{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:6px}
    .parties .name{font-weight:700;font-size:15px}
    .parties .muted{color:#6b7280;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-top:34px}
    thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb}
    thead th.r,tbody td.r{text-align:right}
    tbody td{padding:16px 14px;border-bottom:1px solid #f1f5f9;vertical-align:top}
    tbody .desc{font-weight:600}
    tbody .descsub{color:#6b7280;font-size:12.5px;margin-top:2px}
    .totals{margin-top:18px;margin-left:auto;width:280px}
    .totals .row{display:flex;justify-content:space-between;padding:7px 14px;color:#4b5563}
    .totals .grand{border-top:2px solid #111827;margin-top:6px;padding-top:12px;font-size:17px;font-weight:800;color:#111827}
    .pay{margin-top:34px;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:16px 20px}
    .pay .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af}
    .pay .val{font-weight:700;margin-top:2px}
    .foot{margin-top:44px;border-top:1px solid #eef2f7;padding-top:16px;color:#9ca3af;font-size:12px;display:flex;justify-content:space-between}
    .thanks{margin-top:30px;color:#374151}
  </style></head><body><div class="page">
    <div class="top">
      <div class="brand">
        ${logoSvg()}
        <div><div class="wm"><span class="s">Serp</span><span class="c">Scale</span></div>
        <div class="sub">The all-in-one SEO platform</div></div>
      </div>
      <div class="inv"><h1>INVOICE</h1>
        <div class="meta">Invoice <b>#${d.invoiceNo}</b><br>Date <b>${d.date}</b><br>${statusChip(d.status)}</div>
      </div>
    </div>

    <div class="parties">
      <div><h4>Billed to</h4><div class="name">${d.orgName}</div><div class="muted">${d.orgEmail}</div></div>
      <div style="text-align:right"><h4>From</h4><div class="name">${d.product}</div><div class="muted">${d.supportEmail || "billing@serpscale.com"}</div></div>
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
      <div class="row grand"><span>Total</span><span>${sub}</span></div>
    </div>

    <div class="pay">
      <div><div class="lbl">Payment method</div><div class="val">${gatewayLabel}</div></div>
      <div style="text-align:right"><div class="lbl">Status</div><div class="val">${statusChip(d.status)}</div></div>
    </div>

    <div class="thanks">Thank you for your business. This invoice was generated by ${d.product}.</div>

    <div class="foot"><span>${d.product}</span><span>Questions? ${d.supportEmail || "billing@serpscale.com"}</span></div>
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
