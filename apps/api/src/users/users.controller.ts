import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { AuthService } from "../auth/auth.service";
import { AuditService } from "../auth/audit.service";
import { setAuthCookies } from "../auth/cookies.util";
import { UsersService } from "./users.service";
import {
  ChangePasswordDto,
  CompleteOnboardingDto,
  SaveThemeDto,
  UpdateProfileDto,
} from "./dto/update-profile.dto";

@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Patch("me")
  async updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    const res = await this.users.updateProfile(user.id, dto);
    await this.audit.log(user, "user.profile.update", {});
    return res;
  }

  @Patch("me/password")
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    const res = await this.users.changePassword(user.id, dto.currentPassword, dto.newPassword);
    await this.audit.log(user, "user.password.change", {});
    return res;
  }

  // Persist dashboard theme (dynamic tokens + light/dark) so it follows the user.
  @Patch("me/theme")
  saveTheme(@CurrentUser() user: AuthUser, @Body() dto: SaveThemeDto) {
    return this.users.setTheme(user.id, dto);
  }

  // First-login onboarding wizard: set own password, name, initial theme.
  // Setting a new password bumps passwordChangedAt (invalidating the temp-password
  // session), so we immediately re-mint cookies here — the user stays signed in
  // and only needs the new password after they actually log out.
  @Post("me/onboarding")
  async completeOnboarding(
    @CurrentUser() user: AuthUser,
    @Body() dto: CompleteOnboardingDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.users.completeOnboarding(user.id, dto);
    if (dto.newPassword) setAuthCookies(res, await this.auth.issueTokensFor(user.id));
    await this.audit.log(user, "user.onboarding.complete", {});
    return result;
  }

  @Post("me/avatar")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }), // 2MB
  )
  async uploadAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    const res = await this.users.setAvatar(user.id, file);
    await this.audit.log(user, "user.avatar.update", {});
    return res;
  }

  @Delete("me/avatar")
  async removeAvatar(@CurrentUser() user: AuthUser) {
    const res = await this.users.removeAvatar(user.id);
    await this.audit.log(user, "user.avatar.remove", {});
    return res;
  }

  // Super-admin only: list every user across all organizations.
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Get()
  list() {
    return this.users.listAll();
  }
}
