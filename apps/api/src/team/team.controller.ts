import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { PERMISSIONS, PERMISSION_GROUPS } from "../auth/permissions";
import { AuditService } from "../auth/audit.service";
import { AuthService } from "../auth/auth.service";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import { TeamService } from "./team.service";
import { AssignProjectsDto, CreateRoleDto, InviteMemberDto, UpdateMemberDto, UpdateRoleDto } from "./dto/team.dto";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("team")
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  // The permission catalog for the "create role" UI.
  @Get("permissions")
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  catalog() {
    return { groups: PERMISSION_GROUPS };
  }

  // ---- Custom roles ----

  @Get("roles")
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  roles(@CurrentUser() user: AuthUser) {
    return this.team.listRoles(user);
  }

  @Post("roles")
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  async createRole(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    const role = await this.team.createRole(user, dto);
    await this.audit.log(user, "role.create", { target: role.name, metadata: { permissions: dto.permissions?.length ?? 0 } });
    return role;
  }

  @Patch("roles/:id")
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  async updateRole(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateRoleDto) {
    const role = await this.team.updateRole(user, id, dto);
    await this.audit.log(user, "role.update", { target: role.name });
    return role;
  }

  @Delete("roles/:id")
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  async deleteRole(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const res = await this.team.deleteRole(user, id);
    await this.audit.log(user, "role.delete", { target: id });
    return res;
  }

  // ---- Members ----

  @Get("members")
  @RequirePermissions(PERMISSIONS.TEAM_VIEW)
  members(@CurrentUser() user: AuthUser) {
    return this.team.listMembers(user);
  }

  @Post("members")
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  async invite(@CurrentUser() user: AuthUser, @Body() dto: InviteMemberDto) {
    const created = await this.team.inviteMember(user, dto);
    await this.audit.log(user, "user.invite", { target: created.email });
    // Send ONE welcome email with a one-click sign-in link (valid 24h) so the new
    // member goes straight into onboarding without typing anything. The temp
    // password is included as a fallback for after the link expires. We keep the
    // in-app notification below email-less so there's no second "Welcome" email.
    const loginLink = await this.auth.createLoginLink(created.id);
    const emailed = await this.email.sendBranded(
      created.email,
      "Welcome to the team",
      "Welcome to the team",
      `An account was created for you. Just click the button below to sign in — no password needed. The link works for 24 hours.<br><br>` +
        `If it expires, sign in with:<br><b>Email:</b> ${created.email}<br><b>Temporary password:</b> ${created.tempPassword}<br><br>` +
        `You'll set your own password when you sign in.`,
      { label: "Sign in", url: loginLink },
      user.orgId, // agency's own SMTP + branding if configured
    );
    void this.notifications.notify(
      created.id,
      "team",
      {
        title: "Welcome to the team",
        body: "You've been given access. Explore your campaigns from the dashboard.",
        link: "/dashboard",
      },
      { inApp: true, email: false }, // credentials email above is the only email
    );
    return { ...created, emailed };
  }

  // ---- Agency branding (white-label sidebar name + logo) ----

  @Get("branding")
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  getBranding(@CurrentUser() user: AuthUser) {
    return this.team.getBranding(user);
  }

  @Put("branding")
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  async setBranding(@CurrentUser() user: AuthUser, @Body() dto: { agencyName?: string; logoDataUrl?: string | null }) {
    const res = await this.team.setBranding(user, dto);
    await this.audit.log(user, "org.branding.update", { metadata: { agencyName: dto?.agencyName ?? null } });
    return res;
  }

  // ---- Agency SMTP (org's own mail server) ----

  @Get("smtp")
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  getSmtp(@CurrentUser() user: AuthUser) {
    return this.team.getSmtp(user);
  }

  @Put("smtp")
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  async setSmtp(@CurrentUser() user: AuthUser, @Body() dto: Record<string, unknown>) {
    const res = await this.team.setSmtp(user, dto);
    await this.audit.log(user, "org.smtp.update", { metadata: { host: (dto?.host as string) ?? null } });
    return res;
  }

  @Post("smtp/test")
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  async testSmtp(@CurrentUser() user: AuthUser, @Body() dto: { to?: string }) {
    return this.team.testSmtp(user, dto?.to);
  }

  @Patch("members/:id")
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  async updateMember(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateMemberDto) {
    const res = await this.team.updateMember(user, id, dto);
    await this.audit.log(user, "user.update", { target: res.email, metadata: dto as Record<string, unknown> });
    return res;
  }

  // Permanently remove a member from the organization.
  @Delete("members/:id")
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  async deleteMember(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const res = await this.team.deleteMember(user, id);
    await this.audit.log(user, "user.delete", { target: res.email });
    return res;
  }

  // Admin resets a member's password (returns the new one).
  @Post("members/:id/reset-password")
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  async resetMemberPassword(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { password?: string }) {
    const r = await this.team.resetPassword(user, id, dto?.password);
    await this.audit.log(user, "user.password.reset", { target: r.email });
    return r;
  }

  // ---- Campaign assignment ----

  @Get("projects")
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  orgProjects(@CurrentUser() user: AuthUser) {
    return this.team.orgProjects(user);
  }

  @Get("members/:id/projects")
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  memberProjects(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.team.memberProjects(user, id);
  }

  @Put("members/:id/projects")
  @RequirePermissions(PERMISSIONS.TEAM_MANAGE)
  async setMemberProjects(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: AssignProjectsDto) {
    const res = await this.team.setMemberProjects(user, id, dto?.projectIds ?? []);
    await this.audit.log(user, "user.projects.assign", { target: id, metadata: { count: res.count } });
    return res;
  }
}
