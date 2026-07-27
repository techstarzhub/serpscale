import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS as P } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { AccessRequestService } from "./access-request.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("access-requests")
export class AccessRequestController {
  constructor(private readonly service: AccessRequestService) {}

  // Anyone may request / see their own requests + options.
  @Get("options")
  options(@CurrentUser() user: AuthUser) {
    return this.service.options(user);
  }

  // Who the requester can send to (people who can grant access).
  @Get("reviewers")
  reviewers(@CurrentUser() user: AuthUser) {
    return this.service.reviewers(user);
  }

  @Get("mine")
  mine(@CurrentUser() user: AuthUser) {
    return this.service.listMine(user);
  }

  // Typeahead for the "request campaign access" input (only typed matches).
  @Get("campaign-search")
  campaignSearch(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.service.campaignSearch(user, q ?? "");
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: { type?: string; target?: string; note?: string }) {
    return this.service.create(user, dto);
  }

  // Reviewing + deciding requires team-management permission.
  @Get("pending")
  @RequirePermissions(P.TEAM_MANAGE)
  pending(@CurrentUser() user: AuthUser) {
    return this.service.listPending(user);
  }

  @Post(":id/decide")
  @RequirePermissions(P.TEAM_MANAGE)
  decide(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { approve?: boolean }) {
    return this.service.decide(user, id, !!dto?.approve);
  }
}
