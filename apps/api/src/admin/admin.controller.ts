import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { PERMISSIONS } from "../auth/permissions";
import { AuditService } from "../auth/audit.service";
import { AdminService } from "./admin.service";
import { CreatePlanDto, RecordTransactionDto, SetActiveDto, UpdatePlanDto } from "./dto/admin.dto";

// Every route here is platform-owner only (SUPER_ADMIN holds all platform.* perms).
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly audit: AuditService) {}

  @Get("overview")
  @RequirePermissions(PERMISSIONS.PLATFORM_ORGS_VIEW)
  overview() {
    return this.admin.overview();
  }

  // ---- Plans ----
  @Get("plans")
  @RequirePermissions(PERMISSIONS.PLATFORM_PLANS_MANAGE)
  plans() {
    return this.admin.listPlans();
  }

  @Post("plans")
  @RequirePermissions(PERMISSIONS.PLATFORM_PLANS_MANAGE)
  async createPlan(@CurrentUser() user: AuthUser, @Body() dto: CreatePlanDto) {
    const plan = await this.admin.createPlan(dto);
    await this.audit.log(user, "plan.create", { target: plan.name });
    return plan;
  }

  @Patch("plans/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_PLANS_MANAGE)
  async updatePlan(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdatePlanDto) {
    const plan = await this.admin.updatePlan(id, dto);
    await this.audit.log(user, "plan.update", { target: plan.name });
    return plan;
  }

  @Delete("plans/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_PLANS_MANAGE)
  async deletePlan(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const res = await this.admin.deletePlan(id);
    await this.audit.log(user, "plan.delete", { target: id });
    return res;
  }

  // ---- Organizations ----
  @Get("orgs")
  @RequirePermissions(PERMISSIONS.PLATFORM_ORGS_VIEW)
  orgs() {
    return this.admin.listOrgs();
  }

  @Patch("orgs/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_SETTINGS_MANAGE)
  async setOrg(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: SetActiveDto) {
    const res = await this.admin.setOrgActive(id, !!dto.isActive);
    await this.audit.log(user, "org.setActive", { target: id, metadata: { isActive: !!dto.isActive } });
    return res;
  }

  // ---- Users (all tenants) ----
  @Get("users")
  @RequirePermissions(PERMISSIONS.PLATFORM_ORGS_VIEW)
  users(@Query("limit") limit?: string) {
    return this.admin.listUsers(Number(limit) || 500);
  }

  @Patch("users/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_SETTINGS_MANAGE)
  async setUser(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: SetActiveDto) {
    const res = await this.admin.setUserActive(id, !!dto.isActive);
    await this.audit.log(user, "user.setActive", { target: id, metadata: { isActive: !!dto.isActive } });
    return res;
  }

  // ---- Email / SMTP settings ----
  @Get("settings/smtp")
  @RequirePermissions(PERMISSIONS.PLATFORM_SETTINGS_MANAGE)
  getSmtp() {
    return this.admin.getSetting("smtp");
  }

  @Put("settings/smtp")
  @RequirePermissions(PERMISSIONS.PLATFORM_SETTINGS_MANAGE)
  async setSmtp(@CurrentUser() user: AuthUser, @Body() dto: any) {
    const res = await this.admin.setSetting("smtp", dto);
    await this.audit.log(user, "settings.smtp.update", {});
    return res;
  }

  // ---- Platform settings (signup, branding, default plan, maintenance) ----
  @Get("settings/platform")
  @RequirePermissions(PERMISSIONS.PLATFORM_SETTINGS_MANAGE)
  getPlatform() {
    return this.admin.getSetting("platform");
  }

  @Put("settings/platform")
  @RequirePermissions(PERMISSIONS.PLATFORM_SETTINGS_MANAGE)
  async setPlatform(@CurrentUser() user: AuthUser, @Body() dto: any) {
    const res = await this.admin.setSetting("platform", dto);
    await this.audit.log(user, "settings.platform.update", {});
    return res;
  }

  // ---- Audit log (global) ----
  @Get("audit")
  @RequirePermissions(PERMISSIONS.PLATFORM_AUDIT_VIEW)
  auditLog(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    return this.audit.listForUser(user, Number(limit) || 100);
  }

  // ---- Transactions ----
  @Get("transactions")
  @RequirePermissions(PERMISSIONS.PLATFORM_TRANSACTIONS_VIEW)
  transactions(@Query("limit") limit?: string) {
    return this.admin.listTransactions(Number(limit) || 100);
  }

  @Post("transactions")
  @RequirePermissions(PERMISSIONS.PLATFORM_SETTINGS_MANAGE)
  async recordTxn(@CurrentUser() user: AuthUser, @Body() dto: RecordTransactionDto) {
    const t = await this.admin.recordTransaction(dto);
    await this.audit.log(user, "transaction.record", { target: t.id, metadata: { amountCents: t.amountCents } });
    return t;
  }

  // ---- Payment-gateway settings (Stripe/Razorpay keys) ----
  @Get("settings/gateways")
  @RequirePermissions(PERMISSIONS.PLATFORM_GATEWAYS_MANAGE)
  getGateways() {
    return this.admin.getSetting("payment_gateways");
  }

  @Put("settings/gateways")
  @RequirePermissions(PERMISSIONS.PLATFORM_GATEWAYS_MANAGE)
  async setGateways(@CurrentUser() user: AuthUser, @Body() dto: any) {
    const res = await this.admin.setSetting("payment_gateways", dto);
    await this.audit.log(user, "settings.gateways.update", {});
    return res;
  }
}
