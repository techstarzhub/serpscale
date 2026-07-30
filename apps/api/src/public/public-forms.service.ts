import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { CaptchaService } from "./captcha.service";
import { ContactDto, SubscribeDto } from "./dto/public-forms.dto";

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
