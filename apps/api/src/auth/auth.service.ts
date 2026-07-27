import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Role, SubscriptionStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { EmailService } from "../email/email.service";

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
  ) {}

  // New self-serve customer: creates their own organization (tenant) and makes
  // them its ADMIN, on the default (free) plan.
  async signup(input: { name?: string; email: string; password: string }): Promise<Tokens> {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("An account with this email already exists.");

    const plan = await this.prisma.plan.findUnique({ where: { slug: "free" } });

    const org = await this.prisma.organization.create({
      data: {
        name: input.name ? `${input.name}'s Workspace` : "My Workspace",
        slug: await this.uniqueSlug(input.name || email.split("@")[0]),
      },
    });

    if (plan) {
      await this.prisma.subscription.create({
        data: { orgId: org.id, planId: plan.id, status: SubscriptionStatus.TRIALING },
      });
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: Role.ADMIN,
        orgId: org.id,
      },
    });

    return this.issueTokens(user);
  }

  async login(input: { email: string; password: string }): Promise<Tokens> {
    const email = input.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException("Invalid email or password.");

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid email or password.");

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user);
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Respond identically whether or not the email exists (no account enumeration).
    // Deactivated accounts cannot reset (would let them regain access).
    if (user && user.isActive) {
      const raw = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
      await this.prisma.passwordReset.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 1000 * 60 * 30) },
      });
      const link = `${process.env.WEB_ORIGIN || "http://localhost:3000"}/reset-password?token=${raw}`;
      const sent = await this.email.send(
        user.email,
        "Reset your password",
        this.email.wrap("Reset your password", "We received a request to reset your password. This link expires in 30 minutes.", { label: "Reset password", url: link }),
        user.orgId, // agency's own SMTP when configured
      );
      // Fallback for local dev when SMTP isn't configured.
      if (!sent) console.log(`[auth] password reset link for ${user.email}: ${link}`);
    }
    return { ok: true };
  }

  // Exchange a valid refresh token for a fresh pair (rotating the refresh token).
  async refresh(refreshToken: string | undefined): Promise<Tokens> {
    if (!refreshToken) throw new UnauthorizedException("No session.");

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException("Session expired.");
    }

    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, userId: payload.sub },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Session expired.");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException("Session expired.");

    // Rotate: invalidate the used refresh token so it cannot be replayed.
    await this.prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {});

    return this.issueTokens(user);
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
        avatarKey: true,
        clientId: true,
        clientOwner: true,
        organization: { select: { name: true, branding: true } },
        client: { select: { name: true, type: true, branding: true } },
      },
    });
    if (!user) return null;
    const { avatarKey, organization, client, ...rest } = user;
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
    };
  }

  private async issueTokens(user: {
    id: string;
    role: Role;
    orgId: string | null;
  }): Promise<Tokens> {
    const payload = { sub: user.id, role: user.role, orgId: user.orgId };

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
