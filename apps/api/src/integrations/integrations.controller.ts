import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { AuditService } from "../auth/audit.service";
import { IntegrationsService } from "./integrations.service";

function ownerKeyOf(user: AuthUser): string {
  return user.orgId ?? `user:${user.id}`;
}

@Controller("integrations")
export class IntegrationsController {
  constructor(
    private readonly svc: IntegrationsService,
    private readonly audit: AuditService,
  ) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.svc.status(ownerKeyOf(user));
  }

  // Start Google OAuth (redirects to consent). Can be called multiple times to
  // add several Google accounts.
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @Get("google/connect")
  connect(@CurrentUser() user: AuthUser, @Res() res: Response) {
    res.redirect(this.svc.googleAuthUrl(ownerKeyOf(user)));
  }

  // Google redirects here after consent (identity carried in signed state).
  @Get("google/callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    const web = process.env.WEB_ORIGIN || "http://localhost:3000";
    try {
      await this.svc.handleGoogleCallback(code, state);
      res.redirect(`${web}/dashboard/settings/integrations?connected=google`);
    } catch {
      res.redirect(`${web}/dashboard/settings/integrations?error=google`);
    }
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  @Delete(":id")
  async disconnect(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const res = await this.svc.disconnectById(ownerKeyOf(user), id);
    await this.audit.log(user, "integration.google.disconnect", { target: id });
    return res;
  }
}
