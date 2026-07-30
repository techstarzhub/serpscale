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
  ) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Patch("me")
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Patch("me/password")
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.id, dto.currentPassword, dto.newPassword);
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
    return result;
  }

  @Post("me/avatar")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }), // 2MB
  )
  uploadAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.users.setAvatar(user.id, file);
  }

  @Delete("me/avatar")
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.users.removeAvatar(user.id);
  }

  // Super-admin only: list every user across all organizations.
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Get()
  list() {
    return this.users.listAll();
  }
}
