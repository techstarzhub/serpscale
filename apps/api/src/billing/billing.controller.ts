import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { AuditService } from "../auth/audit.service";
import { BillingService } from "./billing.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("billing")
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

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

  // Which payment gateway the super admin has activated ("stripe" | "paypal" | "").
  // The billing page shows only this method's checkout button.
  @Get("gateway")
  @RequirePermissions(PERMISSIONS.BILLING_VIEW)
  gateway() {
    return this.billing.activeGateway();
  }

  @Get("transactions")
  @RequirePermissions(PERMISSIONS.BILLING_VIEW)
  transactions(@CurrentUser() user: AuthUser) {
    return this.billing.transactions(this.orgOf(user));
  }

  @Get("transactions/:id/invoice")
  @RequirePermissions(PERMISSIONS.BILLING_VIEW)
  async invoice(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
    const { buffer, filename } = await this.billing.invoicePdf(this.orgOf(user), id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post("checkout")
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  async checkout(@CurrentUser() user: AuthUser, @Body() dto: { planId: string; gateway?: string; keywords?: number }) {
    if (!dto?.planId) throw new BadRequestException("planId required");
    const res = await this.billing.createCheckout(this.orgOf(user), dto.planId, dto.gateway || "stripe", dto.keywords);
    await this.audit.log(user, "billing.checkout", { target: dto.planId, metadata: { gateway: dto.gateway || "stripe", keywords: dto.keywords } });
    return res;
  }

  @Post("trial")
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  async startTrial(@CurrentUser() user: AuthUser, @Body() dto: { planId: string }) {
    if (!dto?.planId) throw new BadRequestException("planId required");
    const res = await this.billing.startTrial(this.orgOf(user), dto.planId);
    await this.audit.log(user, "billing.trial.start", { target: dto.planId });
    return res;
  }

  // Webhook-less fallback: confirm + activate a PayPal subscription on return.
  @Post("confirm")
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  async confirm(@CurrentUser() user: AuthUser) {
    const res = await this.billing.confirmPending(this.orgOf(user));
    await this.audit.log(user, "billing.confirm", {});
    return res;
  }

  @Post("cancel")
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  async cancel(@CurrentUser() user: AuthUser) {
    const res = await this.billing.cancel(this.orgOf(user));
    await this.audit.log(user, "billing.cancel", {});
    return res;
  }

  @Post("schedule-change")
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  async scheduleChange(@CurrentUser() user: AuthUser, @Body() body: { planId: string; keywords?: number }) {
    const res = await this.billing.scheduleChange(this.orgOf(user), body.planId, body.keywords);
    await this.audit.log(user, "billing.change.schedule", { target: body.planId, metadata: { keywords: body.keywords } });
    return res;
  }

  @Post("cancel-scheduled-change")
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  async cancelScheduledChange(@CurrentUser() user: AuthUser) {
    const res = await this.billing.cancelScheduledChange(this.orgOf(user));
    await this.audit.log(user, "billing.change.cancel", {});
    return res;
  }
}
