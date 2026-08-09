import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { CaptchaService } from "./captcha.service";
import { ContactDto, SubscribeDto, SupportDto } from "./dto/public-forms.dto";

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Handles the marketing site's public contact + newsletter forms: captcha +
 *  honeypot validation, persistence, and branded email notifications. */
@Injectable()
export class PublicFormsService {
  private readonly logger = new Logger(PublicFormsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly captcha: CaptchaService,
  ) {}

  /** Platform admin recipients — the SUPER_ADMIN accounts, with sensible fallbacks. */
  private async adminEmails(): Promise<string[]> {
    const admins = await this.prisma.user
      .findMany({ where: { role: "SUPER_ADMIN", isActive: true }, select: { email: true } })
      .catch(() => [] as { email: string }[]);
    const emails = admins.map((a) => a.email).filter(Boolean);
    if (emails.length) return emails;
    const fallback = process.env.CONTACT_INBOX || process.env.SUPPORT_EMAIL || "hello@serpscale.com";
    return [fallback];
  }

  /** Shared gate for every public form: honeypot + captcha. Returns true when the
   *  submission should be silently dropped (bot caught by the honeypot). */
  private guard(website: string | undefined, token: string, answer: string): boolean {
    if (website && website.trim() !== "") return true; // honeypot filled → bot; drop silently
    if (!this.captcha.verify(token, answer)) {
      throw new BadRequestException("Captcha verification failed. Please try again.");
    }
    return false;
  }

  async contact(dto: ContactDto, ip?: string, userAgent?: string): Promise<{ ok: true }> {
    if (this.guard(dto.website, dto.captchaToken, dto.captchaAnswer)) return { ok: true };

    // Strip any CR/LF before the name goes into an email Subject header —
    // defense-in-depth against header injection (nodemailer also sanitizes).
    const safeName = dto.name.replace(/[\r\n]+/g, " ").trim().slice(0, 120);

    const msg = await this.prisma.contactMessage.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        company: dto.company?.trim() || null,
        message: dto.message.trim(),
        ip: ip || null,
        userAgent: userAgent?.slice(0, 300) || null,
      },
    });

    // Notify the platform admins with the full message.
    const admins = await this.adminEmails();
    const adminBody = `
      <p style="margin:0 0 14px">You've received a new message from the SerpScale website contact form.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280;width:90px">Name</td><td style="padding:6px 0;font-weight:600">${esc(dto.name)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0"><a href="mailto:${esc(dto.email)}">${esc(dto.email)}</a></td></tr>
        ${dto.company ? `<tr><td style="padding:6px 0;color:#6b7280">Company</td><td style="padding:6px 0">${esc(dto.company)}</td></tr>` : ""}
      </table>
      <div style="margin:16px 0 4px;color:#6b7280;font-size:13px">Message</div>
      <div style="white-space:pre-wrap;background:#f8f9fc;border:1px solid #eef0f4;border-radius:10px;padding:14px;font-size:14px;line-height:1.6">${esc(dto.message)}</div>`;
    await Promise.all(
      admins.map((to) =>
        this.email
          .sendBranded(to, `New contact message from ${safeName}`, "New contact form submission", adminBody, { label: `Reply to ${safeName}`, url: `mailto:${dto.email}` }, null)
          .catch((e) => this.logger.warn(`contact admin email failed (${to}): ${e}`)),
      ),
    );

    // Confirmation to the person who wrote in.
    const userBody = `
      <p style="margin:0 0 12px">Hi ${esc(dto.name)},</p>
      <p style="margin:0 0 12px">Thanks for reaching out to SerpScale — we've received your message and a member of our team will get back to you within one business day.</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Your message</p>
      <div style="white-space:pre-wrap;background:#f8f9fc;border:1px solid #eef0f4;border-radius:10px;padding:14px;font-size:14px;line-height:1.6">${esc(dto.message)}</div>`;
    await this.email
      .sendBranded(dto.email, "We've received your message — SerpScale", "Thanks for contacting us", userBody, undefined, null)
      .catch((e) => this.logger.warn(`contact confirm email failed: ${e}`));

    this.logger.log(`contact message stored (${msg.id}) from ${dto.email}`);
    return { ok: true };
  }

  /** In-app support request from an authenticated user. Reuses the ContactMessage
   *  store + admin notification, but skips captcha/honeypot (the session is
   *  trusted) and prefills identity from the user. */
  async support(
    user: { id: string; email: string; name: string | null; role?: string; orgId: string | null },
    dto: SupportDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ ok: true }> {
    const name = (user.name || user.email).replace(/[\r\n]+/g, " ").trim().slice(0, 120);
    const subject = (dto.subject?.replace(/[\r\n]+/g, " ").trim() || "Support request").slice(0, 160);
    const orgName = user.orgId
      ? (await this.prisma.organization.findUnique({ where: { id: user.orgId }, select: { name: true } }).catch(() => null))?.name ?? null
      : null;

    const msg = await this.prisma.contactMessage.create({
      data: {
        name,
        email: user.email.trim().toLowerCase(),
        company: orgName,
        // Keep the subject inside the stored message so the admin inbox (which has
        // no subject column) still shows it.
        message: `[${subject}]\n\n${dto.message.trim()}`,
        ip: ip || null,
        userAgent: userAgent?.slice(0, 300) || null,
      },
    });

    const admins = await this.adminEmails();
    const adminBody = `
      <p style="margin:0 0 14px">A logged-in user has submitted a support request from inside the app.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280;width:90px">Name</td><td style="padding:6px 0;font-weight:600">${esc(name)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0"><a href="mailto:${esc(user.email)}">${esc(user.email)}</a></td></tr>
        ${orgName ? `<tr><td style="padding:6px 0;color:#6b7280">Organization</td><td style="padding:6px 0">${esc(orgName)}</td></tr>` : ""}
        ${user.role ? `<tr><td style="padding:6px 0;color:#6b7280">Role</td><td style="padding:6px 0">${esc(user.role)}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#6b7280">Subject</td><td style="padding:6px 0;font-weight:600">${esc(subject)}</td></tr>
      </table>
      <div style="margin:16px 0 4px;color:#6b7280;font-size:13px">Message</div>
      <div style="white-space:pre-wrap;background:#f8f9fc;border:1px solid #eef0f4;border-radius:10px;padding:14px;font-size:14px;line-height:1.6">${esc(dto.message)}</div>`;
    await Promise.all(
      admins.map((to) =>
        this.email
          .sendBranded(to, `Support: ${subject} — ${name}`, "New in-app support request", adminBody, { label: `Reply to ${name}`, url: `mailto:${user.email}` }, null)
          .catch((e) => this.logger.warn(`support admin email failed (${to}): ${e}`)),
      ),
    );

    const userBody = `
      <p style="margin:0 0 12px">Hi ${esc(name)},</p>
      <p style="margin:0 0 12px">Thanks for reaching out — we've received your support request and a member of our team will get back to you within one business day.</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px">Your message</p>
      <div style="white-space:pre-wrap;background:#f8f9fc;border:1px solid #eef0f4;border-radius:10px;padding:14px;font-size:14px;line-height:1.6">${esc(dto.message)}</div>`;
    await this.email
      .sendBranded(user.email, "We've received your request — SerpScale", "Thanks for contacting support", userBody, undefined, null)
      .catch((e) => this.logger.warn(`support confirm email failed: ${e}`));

    this.logger.log(`support message stored (${msg.id}) from ${user.email}`);
    return { ok: true };
  }

  // Only these keys are ever exposed publicly — a strict allow-list so nothing
  // else that might land in the "seo" blob can leak from this unauthenticated route.
  private static readonly SEO_PUBLIC_KEYS = [
    "metaTitle", "metaDescription", "metaKeywords", "ogImage", "robotsIndex",
    "googleVerification", "bingVerification", "yandexVerification", "pinterestVerification", "facebookDomainVerification",
    "ga4Id", "gtmId", "customHeadScript", "customBodyScript",
  ] as const;

  /** Public SEO/head config the marketing site injects (verification metas,
   *  analytics IDs, default meta, custom head/body scripts). Only the known SEO
   *  keys are returned — never the whole stored blob. */
  async seo(): Promise<Record<string, unknown>> {
    const s = await this.prisma.platformSetting.findUnique({ where: { key: "seo" } }).catch(() => null);
    const raw = (s?.value as Record<string, unknown>) ?? {};
    const out: Record<string, unknown> = {};
    for (const k of PublicFormsService.SEO_PUBLIC_KEYS) {
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== "") out[k] = raw[k];
    }
    return out;
  }

  async subscribe(dto: SubscribeDto, ip?: string): Promise<{ ok: true }> {
    if (this.guard(dto.website, dto.captchaToken, dto.captchaAnswer)) return { ok: true };

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.subscriber.findUnique({ where: { email } }).catch(() => null);
    if (!existing) {
      await this.prisma.subscriber.create({ data: { email, source: "footer", ip: ip || null } });
      // Notify admins of the new subscriber (fire-and-forget).
      const admins = await this.adminEmails();
      await Promise.all(
        admins.map((to) =>
          this.email
            .sendBranded(to, "New newsletter subscriber", "New subscriber", `<p style="margin:0">${esc(email)} just subscribed to the SerpScale newsletter from the website footer.</p>`, undefined, null)
            .catch(() => undefined),
        ),
      );
    }

    // Always send a friendly confirmation (idempotent for repeat submits).
    await this.email
      .sendBranded(
        email,
        "You're subscribed — SerpScale",
        "Welcome to SerpScale",
        `<p style="margin:0 0 12px">Thanks for subscribing! You'll now get SEO tips, product updates and the occasional growth playbook — no spam, unsubscribe anytime.</p>`,
        { label: "Explore SerpScale", url: process.env.MARKETING_ORIGIN || "https://serpscale.com" },
        null,
      )
      .catch((e) => this.logger.warn(`subscribe confirm email failed: ${e}`));

    return { ok: true };
  }
}
