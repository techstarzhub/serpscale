import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { BillingService } from "./billing.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  private orgOf(user: AuthUser): string {
    if (!user.orgId) throw new ForbiddenException("No organization on this account");
    return user.orgId;
  }

  @Get("plans")
  @RequirePermissions(PERMISSIONS.BILLING_VIEW)
  plans() {
    return this.billing.publicPlans();
  }

  @Get("subscription")
  @RequirePermissions(PERMISSIONS.BILLING_VIEW)
  subscription(@CurrentUser() user: AuthUser) {
    return this.billing.subscription(this.orgOf(user));
  }

  @Get("usage")
  @RequirePermissions(PERMISSIONS.BILLING_VIEW)
  usage(@CurrentUser() user: AuthUser) {
    return this.billing.usage(this.orgOf(user));
  }

  @Post("checkout")
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  checkout(@CurrentUser() user: AuthUser, @Body() dto: { planId: string; gateway?: string }) {
    if (!dto?.planId) throw new BadRequestException("planId required");
    return this.billing.createCheckout(this.orgOf(user), dto.planId, dto.gateway || "stripe");
  }

  @Post("cancel")
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  cancel(@CurrentUser() user: AuthUser) {
    return this.billing.cancel(this.orgOf(user));
  }
}
