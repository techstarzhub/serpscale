import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { SignupDto } from "./dto/signup.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { VerifyOtpDto, ResendOtpDto, ResetPasswordDto } from "./dto/otp.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "./decorators/current-user.decorator";
import { PermissionsService } from "./permissions.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly perms: PermissionsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  // Stricter limits on unauthenticated auth endpoints — anti brute-force / abuse.
  // Signup + login now return { otpRequired } and email a code; cookies are set
  // only after the code is verified below.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post("signup")
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.signup(dto);
    if ("tokens" in r) { this.setCookies(res, r.tokens); return { ok: true }; }
    return r; // { otpRequired, email }
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto);
    if ("tokens" in r) { this.setCookies(res, r.tokens); return { ok: true }; }
    return r; // { otpRequired, email }
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("verify-otp")
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    this.setCookies(res, await this.auth.verifyOtp(dto.purpose, dto.email, dto.code));
    return { ok: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("resend-otp")
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.auth.resendOtp(dto.purpose, dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("forgot-password")
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("reset-password")
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
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
    const [profile, permissions, entitlements] = await Promise.all([
      this.auth.me(user.id),
      this.perms.list(user),
      this.entitlements.forOrg(user.orgId),
    ]);
    return { ...profile, role: user.role, permissions, entitlements };
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
