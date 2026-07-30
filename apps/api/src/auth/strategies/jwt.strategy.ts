import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { tenantSlugFromRequest } from "../../common/tenant.util";

// Read the JWT from the httpOnly access_token cookie.
function cookieExtractor(req: Request): string | null {
  return req?.cookies?.access_token ?? null;
}

interface JwtPayload {
  sub: string;
  role: string;
  orgId?: string | null;
  imp?: string; // impersonator (real admin) id when this is a "view as" session
  iat?: number; // issued-at (seconds since epoch), set automatically by jwt.sign
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      // No insecure fallback — a missing secret must fail fast, never validate
      // tokens signed with a public dev string.
      secretOrKey: (() => {
        const s = process.env.JWT_ACCESS_SECRET;
        if (!s) throw new Error("JWT_ACCESS_SECRET is required");
        return s;
      })(),
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    // Reject access tokens minted before the user's last password change/reset —
    // otherwise a stolen access token stays valid for its full TTL even after the
    // victim resets their password. (1s skew tolerance for issue/write ordering.)
    if (user.passwordChangedAt && payload.iat && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
      throw new UnauthorizedException("Session expired.");
    }
    // White-label subdomain lock: a session may only be used on its own org's
    // subdomain (or the main app domain). This is the real boundary — cookies can
    // be shared across subdomains, so we verify the request's Origin every call.
    const tenantSlug = tenantSlugFromRequest(req);
    if (tenantSlug && user.role !== "SUPER_ADMIN") {
      const org = await this.prisma.organization.findUnique({ where: { slug: tenantSlug }, select: { id: true, isActive: true } });
      if (!org || !org.isActive || org.id !== user.orgId) {
        throw new UnauthorizedException("This account isn't part of this workspace.");
      }
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      impersonatorId: payload.imp,
    };
  }
}
