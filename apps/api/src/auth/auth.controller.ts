import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { SignupDto } from "./dto/signup.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "./decorators/current-user.decorator";
import { PermissionsService } from "./permissions.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly perms: PermissionsService) {}

  // Stricter limits on unauthenticated auth endpoints — anti brute-force / abuse.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post("signup")
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    this.setCookies(res, await this.auth.signup(dto));
    return { ok: true };
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    this.setCookies(res, await this.auth.login(dto));
    return { ok: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("forgot-password")
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies?.refresh_token as string | undefined) ?? undefined;
    this.setCookies(res, await this.auth.refresh(token));
    return { ok: true };
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Revoke the stored refresh token server-side, not just the cookie.
    await this.auth.revokeRefreshToken(req.cookies?.refresh_token as string | undefined);
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: AuthUser) {
    const [profile, permissions] = await Promise.all([this.auth.me(user.id), this.perms.list(user)]);
    return { ...profile, role: user.role, permissions };
  }

  private setCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    const secure = process.env.NODE_ENV === "production";
    res.cookie("access_token", tokens.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 1000 * 60 * 60,
    });
    res.cookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30-day session
    });
  }
}
