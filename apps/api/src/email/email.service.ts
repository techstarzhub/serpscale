import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { PrismaService } from "../prisma/prisma.service";

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

  /** Send using an explicit config (used by the admin's "send test" button). */
  async sendWith(
    cfg: any,
    to: string,
    subject: string,
    html: string,
    attachments?: { filename: string; content: Buffer }[],
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
    attachments?: { filename: string; content: Buffer }[],
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

  /** Minimal branded wrapper for transactional emails. */
  wrap(title: string, body: string, cta?: { label: string; url: string }): string {
    const brand = process.env.BRAND_NAME || "SEO Platform";
    const button = cta ? `<a href="${cta.url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;margin-top:12px">${cta.label}</a>` : "";
    return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2430">
      <div style="font-size:12px;font-weight:700;letter-spacing:.5px;color:#4f46e5;text-transform:uppercase">${brand}</div>
      <h2 style="font-size:18px;margin:8px 0 12px">${title}</h2>
      <div style="font-size:14px;line-height:1.6;color:#374151">${body}</div>
      ${button}
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #eef0f4;font-size:11px;color:#9aa1ad">Sent by ${brand}. If you didn't expect this, you can ignore it.</div>
    </div>`;
  }
}
