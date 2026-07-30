import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { PERMISSIONS } from "../auth/permissions";
import { AuditService } from "../auth/audit.service";
import { AdminService } from "./admin.service";
import { CreatePlanDto, RecordTransactionDto, SetActiveDto, UpdateOrgDto, UpdatePlanDto } from "./dto/admin.dto";
import { catalogPayload } from "../entitlements/entitlements.catalog";

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

  // The gateable-module + limit catalog that drives the plan editor checkboxes.
  // Static data, but served so the client never hardcodes the feature list.
  @Get("feature-catalog")
  @RequirePermissions(PERMISSIONS.PLATFORM_PLANS_MANAGE)
  featureCatalog() {
    return catalogPayload();
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
  async setOrg(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateOrgDto) {
    const res = await this.admin.updateOrg(id, dto);
    await this.audit.log(user, "org.update", { target: id, metadata: { ...dto } });
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
    return this.admin.getSettingSafe("smtp");
  }

  @Put("settings/smtp")
  @RequirePermissions(PERMISSIONS.PLATFORM_SETTINGS_MANAGE)
  async setSmtp(@CurrentUser() user: AuthUser, @Body() dto: any) {
    const res = await this.admin.setSettingMerged("smtp", dto);
    await this.audit.log(user, "settings.smtp.update", {});
    return res;
  }

  // ---- Platform settings (signup, branding, default plan, maintenance) ----
  @Get("settings/platform")
  @RequirePermissions(PERMISSIONS.PLATFORM_SETTINGS_MANAGE)
  getPlatform() {
    // getSettingSafe masks any secret/password-bearing keys before returning to
    // the browser (getSmtp/getGateways already do this — platform must too, so a
    // secret ever stored under this key is never echoed back in cleartext).
    return this.admin.getSettingSafe("platform");
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
    return this.admin.getSettingSafe("payment_gateways");
  }

  @Put("settings/gateways")
  @RequirePermissions(PERMISSIONS.PLATFORM_GATEWAYS_MANAGE)
  async setGateways(@CurrentUser() user: AuthUser, @Body() dto: any) {
    const res = await this.admin.setSettingMerged("payment_gateways", dto);
    await this.audit.log(user, "settings.gateways.update", {});
    return res;
  }
}

// ---- Public read API consumed by the marketing pricing page (no auth) ----
@Controller("public/plans")
export class PublicPlansController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  plans() {
    return this.admin.publicPlans();
  }
}

// White-label brand for a tenant subdomain, read by the sign-in form (no auth).
@Controller("public/branding")
export class PublicBrandingController {
  constructor(private readonly admin: AdminService) {}

  @Get(":slug")
  branding(@Param("slug") slug: string) {
    return this.admin.publicBranding(slug);
  }
}
