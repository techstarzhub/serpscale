import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Role, SubscriptionStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { EmailService } from "../email/email.service";
import { OtpService } from "./otp.service";
import { normalizeEmail } from "../common/email.util";
import type { AuthUser } from "./decorators/current-user.decorator";

// Re-exported for callers that historically imported it from here.
export { normalizeEmail };

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
    private readonly otp: OtpService,
  ) {}

  // ---- Signup: email-OTP verified. The account is only created once the code
  // is confirmed, so unverified emails never become real accounts. ----
  async signup(input: { name?: string; email: string; password: string; plan?: string; keywords?: number; trial?: boolean }): Promise<{ otpRequired: true; email: string } | { tokens: Tokens }> {
    // Normalize first so +tag / dot aliases can't register (and re-trial) around a
    // banned or existing account.
    const email = normalizeEmail(input.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("An account with this email already exists.");
    const passwordHash = await bcrypt.hash(input.password, 12);
    const intent = { name: input.name ?? null, email, passwordHash, plan: input.plan ?? null, keywords: input.keywords ?? null, trial: input.trial ?? false };
    // Only gate on OTP when we can actually deliver the code. Until the platform
    // SMTP is configured, create the account directly so no one is locked out.
    if (!(await this.email.platformReady())) {
      const user = await this.createAccount(intent);
      return { tokens: await this.issueTokens(user) };
    }
    return this.otp.issue(email, "SIGNUP", intent);
  }

  // ---- Login: password first, then an email OTP (2FA) when SMTP is set up. ----
  async login(input: { email: string; password: string }): Promise<{ otpRequired: true; email: string } | { tokens: Tokens }> {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException("Invalid email or password.");
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid email or password.");
    if (!(await this.email.platformReady())) {
      await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return { tokens: await this.issueTokens(user) };
    }
    return this.otp.issue(email, "LOGIN", null);
  }

  // ---- Verify the emailed code and complete signup or login. ----
  async verifyOtp(purpose: "SIGNUP" | "LOGIN", emailInput: string, code: string): Promise<Tokens> {
    const email = normalizeEmail(emailInput);
    const payload = await this.otp.verify(email, purpose, code);
    if (purpose === "SIGNUP") {
      const p = payload ?? {};
      if (!p.email || !p.passwordHash) throw new BadRequestException("Signup session expired. Please sign up again.");
      // Guard against the email being taken during verification.
      if (await this.prisma.user.findUnique({ where: { email: p.email } })) {
        throw new ConflictException("An account with this email already exists.");
      }
      const user = await this.createAccount(p);
      return this.issueTokens(user);
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException("Account not found.");
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user);
  }

  async resendOtp(purpose: "SIGNUP" | "LOGIN", email: string) {
    return this.otp.resend(normalizeEmail(email), purpose);
  }

  // Create a tenant + its ADMIN. Trial (or organic) signups start on the default
  // trial plan; a paid "Get started" signup gets NO subscription yet — the client
  // sends them to checkout, and access stays locked until they subscribe.
  private async createAccount(p: { name: string | null; email: string; passwordHash: string; plan?: string | null; trial?: boolean }) {
    const org = await this.prisma.organization.create({
      data: { name: p.name ? `${p.name}'s Workspace` : "My Workspace", slug: await this.uniqueSlug(p.name || p.email.split("@")[0]) },
    });
    // A trial signup, or an organic signup with no chosen plan, starts on the
    // default trial plan. A paid plan choice defers to checkout (no subscription).
    const wantsTrial = p.trial === true || !p.plan;
    let trialDetail = "Paid plan chosen — checkout pending (no subscription yet)";
    if (wantsTrial) {
      const signup = (await this.prisma.platformSetting.findUnique({ where: { key: "signup" } }))?.value as any;
      const slug = signup?.defaultPlanSlug || "starter";
      const plan = await this.prisma.plan.findFirst({ where: { slug, isActive: true } });
      if (plan) {
        const days = Number(plan.trialDays) || 0;
        const ends = days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000) : null;
        await this.prisma.subscription.create({
          data: { orgId: org.id, planId: plan.id, status: SubscriptionStatus.TRIALING, currentPeriodEnd: ends, gateway: "trial" },
        });
        trialDetail = `${plan.name} — ${days}-day free trial${ends ? `, ends ${ends.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}` : ""}`;
      } else {
        trialDetail = "No trial plan configured";
      }
    }
    const user = await this.prisma.user.create({
      // Owner picked their own password at signup — no onboarding wizard needed.
      data: { email: p.email, name: p.name, passwordHash: p.passwordHash, role: Role.ADMIN, orgId: org.id, onboardedAt: new Date() },
    });
    // Platform-owner alert: full details of every new signup / trial.
    this.email.notifySuperAdmins(
      `New signup: ${p.name || p.email}`,
      "New account created",
      `A new customer just signed up on the platform.
       <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:6px">
         <tr><td style="padding:5px 0;color:#6b7280;width:110px">Name</td><td style="padding:5px 0;font-weight:600">${p.name || "—"}</td></tr>
         <tr><td style="padding:5px 0;color:#6b7280">Email</td><td style="padding:5px 0">${p.email}</td></tr>
         <tr><td style="padding:5px 0;color:#6b7280">Workspace</td><td style="padding:5px 0">${org.name}</td></tr>
         <tr><td style="padding:5px 0;color:#6b7280">Plan / trial</td><td style="padding:5px 0">${trialDetail}</td></tr>
         <tr><td style="padding:5px 0;color:#6b7280">When</td><td style="padding:5px 0">${new Date().toLocaleString("en-US")}</td></tr>
       </table>`,
    ).catch(() => {});
    return user;
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    // Respond identically whether or not the email exists (no account enumeration).
    // Deactivated accounts cannot reset (would let them regain access).
    if (user && user.isActive) {
      const raw = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
      await this.prisma.passwordReset.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 1000 * 60 * 30) },
      });
      const link = `${process.env.WEB_ORIGIN || "http://localhost:3000"}/reset-password?token=${raw}`;
      const sent = await this.email.sendBranded(
        user.email,
        "Reset your password",
        "Reset your password",
        "We received a request to reset your password. This link expires in 30 minutes.",
        { label: "Reset password", url: link },
        user.orgId, // agency's own SMTP + branding when configured
      );
      // Fallback for local dev when SMTP isn't configured.
      if (!sent) console.log(`[auth] password reset link for ${user.email}: ${link}`);
    }
    return { ok: true };
  }

  // Consume a password-reset token and set the new password.
  async resetPassword(token: string, password: string) {
    if (!token || !password || password.length < 8) throw new BadRequestException("A valid token and an 8+ character password are required.");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new BadRequestException("This reset link is invalid or has expired. Please request a new one.");
    }
    await this.prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(password, 12), passwordChangedAt: new Date() } });
    await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
    // Invalidate existing sessions after a reset.
    await this.prisma.refreshToken.deleteMany({ where: { userId: reset.userId } });
    return { ok: true };
  }

  // Exchange a valid refresh token for a fresh pair (rotating the refresh token).
  async refresh(refreshToken: string | undefined): Promise<Tokens> {
    if (!refreshToken) throw new UnauthorizedException("No session.");

    let payload: { sub: string; imp?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException("Session expired.");
    }

    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    // Atomically consume the token in a single statement so two concurrent
    // refreshes can't both succeed (the old find-then-delete was racy). The JWT
    // signature+exp were already verified above, so a validly-signed token whose
    // hash is NO LONGER in the store means it was already rotated — i.e. a
    // replay of a stolen/old refresh token. In that case revoke the entire token
    // family for the user so the thief and victim are both logged out.
    const consumed = await this.prisma.refreshToken.deleteMany({ where: { tokenHash, userId: payload.sub } });
    if (consumed.count === 0) {
      await this.prisma.refreshToken.deleteMany({ where: { userId: payload.sub } });
      throw new UnauthorizedException("Session expired.");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException("Session expired.");

    // Preserve an active "view as" session across refreshes so the Return button
    // keeps working for the full session.
    return this.issueTokens(user, payload.imp);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        orgId: true,
        themeOverrides: true,
        onboardedAt: true,
        avatarKey: true,
        clientId: true,
        clientOwner: true,
        organization: { select: { name: true, branding: true } },
        client: { select: { name: true, type: true, branding: true, allowTeam: true } },
      },
    });
    if (!user) return null;
    const { avatarKey, organization, client, ...rest } = user;
    // A client-portal owner can manage their team only when the agency enabled it.
    const clientCanManageTeam = user.role === "CLIENT" && !!user.clientOwner && !!client?.allowTeam;
    // An agency-type client owner can edit their own white-label branding.
    const isAgencyClient = user.role === "CLIENT" && !!user.clientOwner && client?.type === "AGENCY";
    // White-label: the agency's own name + logo (set by the org admin) override
    // the platform brand in the sidebar. For a client-portal user whose client is
    // a white-label sub-agency, THAT sub-agency's branding takes precedence, so
    // the portal is fully their brand. Falls back to the platform default.
    const orgB = (organization?.branding as any) ?? {};
    let branding = {
      agencyName: orgB.agencyName || null,
      logoDataUrl: orgB.logoDataUrl || null,
      logoBg: orgB.logoBg || null,
    };
    if (user.role === "CLIENT" && client?.type === "AGENCY") {
      const cb = (client.branding as any) ?? {};
      branding = {
        agencyName: cb.agencyName || client.name || null,
        logoDataUrl: cb.logoDataUrl || null,
        logoBg: cb.logoBg || null,
      };
    }
    return {
      ...rest,
      avatarUrl: avatarKey ? await this.storage.signedUrl(avatarKey) : null,
      branding,
      clientCanManageTeam,
      isAgencyClient,
    };
  }

  /** Public wrapper: mint a fresh session for a known user id. Used to keep a
   *  user logged in right after they set a new password during onboarding (the
   *  old access token, minted before passwordChangedAt, would otherwise be
   *  rejected — so we hand back new cookies instead of forcing a re-login). */
  async issueTokensFor(userId: string, impersonatorId?: string): Promise<Tokens> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException("Account unavailable.");
    return this.issueTokens(user, impersonatorId);
  }

  /** Admin "view as": mint a session for a target user (a team member, or a
   *  client via their owner login), tagged with the admin's id so they can return.
   *  Org admins are confined to their own org and to MEMBER/CLIENT targets. */
  async impersonate(admin: AuthUser, opts: { userId?: string; clientId?: string }): Promise<Tokens> {
    if (admin.role !== "ADMIN" && admin.role !== "SUPER_ADMIN") {
      throw new ForbiddenException("Only an admin can view as another user.");
    }
    if (admin.impersonatorId) throw new BadRequestException("Already viewing as another user.");

    let target: { id: string; role: string; orgId: string | null; isActive: boolean } | null = null;
    if (opts.clientId) {
      target = await this.prisma.user.findFirst({
        where: {
          clientId: opts.clientId,
          clientOwner: true,
          ...(admin.role === "ADMIN" ? { orgId: admin.orgId } : {}),
        },
        select: { id: true, role: true, orgId: true, isActive: true },
      });
    } else if (opts.userId) {
      target = await this.prisma.user.findUnique({
        where: { id: opts.userId },
        select: { id: true, role: true, orgId: true, isActive: true },
      });
    }
    if (!target || !target.isActive) throw new NotFoundException("User not found.");
    if (target.id === admin.id) throw new BadRequestException("You are already yourself.");
    if (target.role === "SUPER_ADMIN") throw new ForbiddenException("Cannot view as a super admin.");
    if (admin.role === "ADMIN") {
      if (target.orgId !== admin.orgId) throw new ForbiddenException("That user is outside your organization.");
      if (target.role === "ADMIN") throw new ForbiddenException("Cannot view as another admin.");
    }
    return this.issueTokensFor(target.id, admin.id);
  }

  /** End a "view as" session and return to the real admin's account. */
  async stopImpersonate(current: AuthUser): Promise<Tokens> {
    if (!current.impersonatorId) throw new BadRequestException("Not currently viewing as another user.");
    return this.issueTokensFor(current.impersonatorId);
  }

  /** Create a 24h one-click login link for a user (used in the invite email so a
   *  new member signs in without typing the temp password). Returns the full URL. */
  async createLoginLink(userId: string): Promise<string> {
    const raw = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    await this.prisma.magicLink.create({
      data: { userId, tokenHash, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) },
    });
    const api = process.env.API_ORIGIN || `http://localhost:${process.env.API_PORT || 4000}`;
    return `${api}/auth/magic?token=${raw}`;
  }

  /** Validate a magic-link token and mint a session. Reusable within the 24h
   *  window (not consumed on use) so an accidental double-click still works. */
  async consumeLoginLink(token: string): Promise<Tokens> {
    if (!token) throw new UnauthorizedException("Invalid or expired sign-in link.");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const link = await this.prisma.magicLink.findUnique({ where: { tokenHash } });
    if (!link || link.expiresAt < new Date()) throw new UnauthorizedException("This sign-in link is invalid or has expired.");
    return this.issueTokensFor(link.userId);
  }

  private async issueTokens(
    user: {
      id: string;
      role: Role;
      orgId: string | null;
    },
    impersonatorId?: string,
  ): Promise<Tokens> {
    const payload: Record<string, unknown> = { sub: user.id, role: user.role, orgId: user.orgId };
    if (impersonatorId) payload.imp = impersonatorId;

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_TTL || "15m",
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_TTL || "30d",
    });

    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });

    return { accessToken, refreshToken };
  }

  /** Revoke a single refresh token (logout) so a captured token can't be replayed. */
  async revokeRefreshToken(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } }).catch(() => {});
  }

  /** Revoke ALL a user's refresh tokens (password change / forced sign-out). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});
  }

  private async uniqueSlug(base: string): Promise<string> {
    const slugify = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "workspace";
    const root = slugify(base);
    let slug = root;
    let i = 1;
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      slug = `${root}-${i++}`;
    }
    return slug;
  }
}
