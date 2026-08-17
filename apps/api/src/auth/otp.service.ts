import { BadRequestException, Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";

export type OtpPurpose = "SIGNUP" | "LOGIN";
const TTL_MS = 10 * 60 * 1000; // codes valid 10 minutes
const MAX_ATTEMPTS = 8; // cumulative wrong guesses allowed per email+purpose per window

/** Issues + verifies 6-digit email one-time codes for signup verification and
 *  login 2FA. Codes are stored hashed; pending signup data rides in `payload`. */
@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

  private hash(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  // Login codes carry the user's own agency branding when set; signup has no org.
  private async orgFor(email: string, purpose: OtpPurpose): Promise<string | null> {
    if (purpose !== "LOGIN") return null;
    const user = await this.prisma.user.findUnique({ where: { email }, select: { orgId: true } }).catch(() => null);
    return user?.orgId ?? null;
  }

  /** Create a code, email it, and (for signup) stash the pending account data. */
  async issue(rawEmail: string, purpose: OtpPurpose, payload?: any): Promise<{ otpRequired: true; email: string }> {
    const email = rawEmail.toLowerCase();
    // Carry forward wrong-guess attempts from still-valid codes so that RESENDING
    // a code cannot reset the attempt counter — otherwise a 6-digit code could be
    // brute-forced indefinitely by re-issuing after every 5 misses. The counter is
    // cumulative per email+purpose within the TTL window (a genuine attacker who
    // has already burned MAX_ATTEMPTS stays locked until the window elapses).
    const prior = await this.prisma.emailOtp.findMany({
      where: { email, purpose, expiresAt: { gt: new Date() } },
      select: { attempts: true },
    });
    const carry = Math.min(prior.reduce((s, r) => s + r.attempts, 0), MAX_ATTEMPTS);
    // Clear any earlier codes for this email+purpose so only the newest is valid.
    await this.prisma.emailOtp.deleteMany({ where: { email, purpose } });
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    await this.prisma.emailOtp.create({
      data: { email, purpose, codeHash: this.hash(code), payload: payload ?? undefined, attempts: carry, expiresAt: new Date(Date.now() + TTL_MS) },
    });
    const isSignup = purpose === "SIGNUP";
    const subject = isSignup ? "Verify your email" : "Your login code";
    const intro = isSignup
      ? "Use this code to verify your email and finish creating your account."
      : "Use this code to finish signing in.";
    await this.email.sendBranded(email, subject, subject, `${intro} It expires in 10 minutes.${this.email.codeBlock(code)}`, undefined, await this.orgFor(email, purpose));
    return { otpRequired: true, email };
  }

  /** Re-send a fresh code, reusing the pending signup payload if there was one. */
  async resend(rawEmail: string, purpose: OtpPurpose): Promise<{ otpRequired: true; email: string }> {
    const email = rawEmail.toLowerCase();
    const last = await this.prisma.emailOtp.findFirst({ where: { email, purpose }, orderBy: { createdAt: "desc" } });
    return this.issue(email, purpose, last?.payload);
  }

  /** Verify a code; returns the stored payload (or null) and consumes the code. */
  async verify(rawEmail: string, purpose: OtpPurpose, code: string): Promise<any> {
    const email = rawEmail.toLowerCase();
    const otp = await this.prisma.emailOtp.findFirst({ where: { email, purpose }, orderBy: { createdAt: "desc" } });
    if (!otp || otp.usedAt) throw new BadRequestException("No active code. Please request a new one.");
    if (otp.expiresAt < new Date()) throw new BadRequestException("This code has expired. Request a new one.");
    if (otp.attempts >= MAX_ATTEMPTS) throw new BadRequestException("Too many attempts. Request a new code.");
    if (otp.codeHash !== this.hash(String(code).trim())) {
      await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: otp.attempts + 1 } });
      throw new BadRequestException("Incorrect code. Please try again.");
    }
    await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
    return otp.payload ?? null;
  }
}
