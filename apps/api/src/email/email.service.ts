import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";

type Attachment = { filename: string; content: Buffer; cid?: string };

/** Sends transactional email via the SMTP the super admin configured
 *  (PlatformSetting "smtp"). No-ops gracefully when SMTP isn't set up. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  constructor(private readonly prisma: PrismaService) {}

  private async platformConfig(): Promise<any> {
    const s = await this.prisma.platformSetting.findUnique({ where: { key: "smtp" } }).catch(() => null);
    return (s?.value as any) ?? {};
  }

  private valid(c: any): boolean {
    return !!(c && c.host && c.user);
  }

  /**
   * Resolve which SMTP to use: the org's own if the admin configured one,
   * otherwise the platform default. This is what makes an agency's team emails
   * go from the agency's own mail server.
   */
  private async config(orgId?: string | null): Promise<any> {
    if (orgId) {
      const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { smtp: true } }).catch(() => null);
      if (this.valid(org?.smtp as any)) return org!.smtp as any;
    }
    return this.platformConfig();
  }

  async isConfigured(orgId?: string | null): Promise<boolean> {
    return this.valid(await this.config(orgId));
  }

  /** True only when the PLATFORM SMTP can actually send (host + user + password).
   *  Used to gate email OTP: no point requiring a code we can't deliver. */
  async platformReady(): Promise<boolean> {
    const c = await this.platformConfig();
    return !!(c && c.host && c.user && c.pass);
  }

  /** Send using an explicit config (used by the admin's "send test" button). */
  async sendWith(
    cfg: any,
    to: string,
    subject: string,
    html: string,
    attachments?: Attachment[],
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.valid(cfg)) return { ok: false, error: "SMTP host and username are required." };
    try {
      const transport = nodemailer.createTransport({
        host: cfg.host,
        port: Number(cfg.port) || 587,
        secure: !!cfg.secure || Number(cfg.port) === 465,
        auth: { user: cfg.user, pass: cfg.pass },
      });
      const from = cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail || cfg.user}>` : cfg.fromEmail || cfg.user;
      await transport.sendMail({ from, to, subject, html, attachments });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e as any)?.message ?? e).slice(0, 200) };
    }
  }

  async send(
    to: string,
    subject: string,
    html: string,
    orgId?: string | null,
    attachments?: Attachment[],
  ): Promise<boolean> {
    const cfg = await this.config(orgId);
    if (!this.valid(cfg)) {
      this.logger.warn(`SMTP not configured — email to ${to} not sent ("${subject}")`);
      return false;
    }
    const res = await this.sendWith(cfg, to, subject, html, attachments);
    if (!res.ok) this.logger.warn(`email send failed (${to}): ${res.error}`);
    return res.ok;
  }

  // The platform (SerpScale) email logo, read once from disk as a Buffer.
  private platformLogoCache: Buffer | null | undefined;
  private platformLogo(): Buffer | null {
    if (this.platformLogoCache !== undefined) return this.platformLogoCache;
    const candidates = [
      path.resolve(process.cwd(), "assets/brand-logo.png"),
      path.resolve(process.cwd(), "apps/api/assets/brand-logo.png"),
      path.resolve(__dirname, "../../assets/brand-logo.png"),
    ];
    for (const p of candidates) {
      try { this.platformLogoCache = fs.readFileSync(p); return this.platformLogoCache; } catch { /* next */ }
    }
    this.platformLogoCache = null;
    return null;
  }

  // Decode a base64 data URL (an agency's uploaded logo) into a Buffer.
  private decodeDataUrl(url?: string): Buffer | null {
    if (!url) return null;
    const m = /^data:[^;]+;base64,(.+)$/i.exec(url.trim());
    try { return m ? Buffer.from(m[1], "base64") : null; } catch { return null; }
  }

  /** Resolve the brand for an email: a white-label org's own name + logo when set,
   *  otherwise the platform (SerpScale) default. `logo` is the actual image bytes,
   *  embedded inline via CID so it renders in every email client. */
  async brandFor(orgId?: string | null): Promise<{ name: string; logo: Buffer | null }> {
    if (orgId) {
      const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { branding: true } }).catch(() => null);
      const b: any = org?.branding ?? {};
      if (b.agencyName || b.logoDataUrl) {
        return { name: b.agencyName || "", logo: this.decodeDataUrl(b.logoDataUrl) };
      }
    }
    const platform: any = (await this.prisma.platformSetting.findUnique({ where: { key: "branding" } }).catch(() => null))?.value ?? {};
    return { name: platform.productName || process.env.BRAND_NAME || "SerpScale", logo: this.platformLogo() };
  }

  /** Branded email HTML. When `hasLogo` is true the header shows the brand logo
   *  (referenced by cid:brandlogo — attach it via sendBranded) beside the name. */
  wrap(title: string, body: string, cta?: { label: string; url: string }, brand?: { name: string; hasLogo?: boolean }): string {
    const name = brand?.name || "SerpScale";
    const isSerp = name.trim().toLowerCase() === "serpscale";
    const header = brand?.hasLogo
      ? `<span style="display:inline-block;vertical-align:middle"><img src="cid:brandlogo" alt="${name}" height="40" style="height:40px;width:auto;max-width:160px;max-height:44px;object-fit:contain;border:0;outline:none;vertical-align:middle" /></span><span style="vertical-align:middle;margin-left:11px;font-size:20px;font-weight:800;letter-spacing:-.02em;color:#111827">${isSerp ? '<span style="color:#2563EB">Serp</span>Scale' : name}</span>`
      : isSerp
        ? `<div style="font-size:22px;font-weight:800;letter-spacing:-.02em"><span style="color:#2563EB">Serp</span><span style="color:#111827">Scale</span></div>`
        : `<div style="font-size:22px;font-weight:800;letter-spacing:-.02em;color:#111827">${name}</div>`;
    const button = cta ? `<a href="${cta.url}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;margin-top:14px">${cta.label}</a>` : "";
    return `<div style="background:#f4f6fb;padding:28px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;color:#111827;box-shadow:0 8px 30px -18px rgba(0,0,0,.25)">
        ${header}
        <div style="height:2px;background:#2563EB;width:44px;border-radius:2px;margin:12px 0 20px"></div>
        <h2 style="font-size:19px;margin:0 0 12px;color:#111827">${title}</h2>
        <div style="font-size:14.5px;line-height:1.65;color:#374151">${body}</div>
        ${button}
        <div style="margin-top:26px;padding-top:14px;border-top:1px solid #eef0f4;font-size:11.5px;color:#9aa1ad">Sent by ${name}. If you didn't expect this email, you can safely ignore it.</div>
      </div>
    </div>`;
  }

  /** Resolve the org's brand, build the branded HTML with its logo, and send —
   *  the logo rides along as an inline CID attachment so it shows everywhere. */
  async sendBranded(
    to: string,
    subject: string,
    title: string,
    body: string,
    cta?: { label: string; url: string },
    orgId?: string | null,
    extraAttachments?: Attachment[],
  ): Promise<boolean> {
    const brand = await this.brandFor(orgId);
    const html = this.wrap(title, body, cta, { name: brand.name, hasLogo: !!brand.logo });
    const attachments: Attachment[] = [...(extraAttachments ?? [])];
    if (brand.logo) attachments.push({ filename: "logo.png", content: brand.logo, cid: "brandlogo" });
    return this.send(to, subject, html, orgId, attachments.length ? attachments : undefined);
  }

  /** Back-compat: branded HTML string (no inline logo — prefer sendBranded). */
  async wrapBranded(orgId: string | null | undefined, title: string, body: string, cta?: { label: string; url: string }): Promise<string> {
    const brand = await this.brandFor(orgId);
    return this.wrap(title, body, cta, { name: brand.name, hasLogo: false });
  }

  /** A large, centred one-time code block for OTP emails. */
  codeBlock(code: string): string {
    return `<div style="margin:18px 0;text-align:center"><div style="display:inline-block;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;font-weight:800;letter-spacing:10px;color:#111827;background:#f4f6fb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 26px">${code}</div></div>`;
  }
}
