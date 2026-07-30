import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";

// Read the JWT from the httpOnly access_token cookie.
function cookieExtractor(req: Request): string | null {
  return req?.cookies?.access_token ?? null;
}

interface JwtPayload {
  sub: string;
  role: string;
  orgId?: string | null;
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
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    // Reject access tokens minted before the user's last password change/reset —
    // otherwise a stolen access token stays valid for its full TTL even after the
    // victim resets their password. (1s skew tolerance for issue/write ordering.)
    if (user.passwordChangedAt && payload.iat && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
      throw new UnauthorizedException("Session expired.");
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
    };
  }
}
