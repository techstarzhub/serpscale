import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS as P } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { AuditService } from "../auth/audit.service";
import { FeaturesGuard } from "../entitlements/features.guard";
import { RequireFeature } from "../entitlements/require-feature.decorator";
import { ClientsService } from "./clients.service";

// The whole clients area is the "client_dashboards" plan feature — gated server-
// side so a plan without it can't create/manage clients via the API (not just
// hidden in the UI). Client-portal owners only exist under a plan that has it.
@UseGuards(JwtAuthGuard, PermissionsGuard, FeaturesGuard)
@RequireFeature("client_dashboards")
@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService, private readonly audit: AuditService) {}

  // List — permission (view_all OR view_assigned) enforced in the service.
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.clients.list(user);
  }

  // Agency-client self-service branding (declared before :id so "me" doesn't
  // get captured as an id). Only an agency client owner may use these.
  @Get("me/branding")
  myBranding(@CurrentUser() user: AuthUser) {
    return this.clients.getMyBranding(user);
  }

  @Patch("me/branding")
  async updateMyBranding(@CurrentUser() user: AuthUser, @Body() dto: { agencyName?: string; logoDataUrl?: string | null; logoBg?: string | null }) {
    const r = await this.clients.updateMyBranding(user, dto);
    await this.audit.log(user, "client.branding.update", {});
    return r;
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.clients.get(user, id);
  }

  @Post()
  @RequirePermissions(P.CLIENTS_CREATE)
  async create(@CurrentUser() user: AuthUser, @Body() dto: any) {
    const client = await this.clients.create(user, dto);
    await this.audit.log(user, "client.create", { target: client.name });
    return client;
  }

  @Patch(":id")
  @RequirePermissions(P.CLIENTS_EDIT)
  async update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: any) {
    const client = await this.clients.update(user, id, dto);
    await this.audit.log(user, "client.update", { target: client.name });
    return client;
  }

  @Delete(":id")
  @RequirePermissions(P.CLIENTS_DELETE)
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const res = await this.clients.remove(user, id);
    await this.audit.log(user, "client.delete", { target: id });
    return res;
  }

  @Put(":id/campaigns")
  @RequirePermissions(P.CLIENTS_ASSIGN_CAMPAIGNS)
  async setCampaigns(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { projectIds?: string[] }) {
    const res = await this.clients.setCampaigns(user, id, dto?.projectIds ?? []);
    await this.audit.log(user, "client.campaigns.assign", { target: id, metadata: { count: res.count } });
    return res;
  }

  // Mark a client as an agency (white-label) client + set its branding.
  @Patch(":id/agency")
  @RequirePermissions(P.CLIENTS_MANAGE_AGENCY)
  async setAgency(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { type?: string; branding?: any }) {
    const client = await this.clients.setAgency(user, id, dto);
    await this.audit.log(user, "client.agency.update", { target: id, metadata: { type: dto?.type ?? null } });
    return client;
  }

  // ---- Client members (agency staff with manage_agency, or the client's own owner) ----

  @Get(":id/members")
  members(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.clients.listMembers(user, id);
  }

  @Post(":id/members")
  async addMember(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: { email?: string; name?: string; owner?: boolean; password?: string; allCampaigns?: boolean; projectIds?: string[] },
  ) {
    const created = await this.clients.addMember(user, id, dto);
    await this.audit.log(user, "client.member.add", { target: created.email, metadata: { clientId: id } });
    return created;
  }

  // The client's campaigns — for the "specific campaigns" picker when adding a member.
  @Get(":id/campaigns")
  campaigns(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.clients.clientCampaigns(user, id);
  }

  // Which campaigns a member can access (all vs a specific set of this client's campaigns).
  @Get(":id/members/:userId/campaigns")
  memberCampaigns(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("userId") userId: string) {
    return this.clients.memberCampaigns(user, id, userId);
  }

  @Patch(":id/members/:userId/campaigns")
  async setMemberCampaigns(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() dto: { allCampaigns?: boolean; projectIds?: string[] },
  ) {
    const r = await this.clients.setMemberCampaigns(user, id, userId, dto);
    await this.audit.log(user, "client.member.campaigns", { target: userId, metadata: { clientId: id, allCampaigns: r.allCampaigns } });
    return r;
  }

  @Delete(":id/members/:userId")
  async removeMember(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("userId") userId: string) {
    const res = await this.clients.removeMember(user, id, userId);
    await this.audit.log(user, "client.member.remove", { target: userId, metadata: { clientId: id } });
    return res;
  }

  // Reset a client portal member's password (returns the new one to the admin).
  @Post(":id/members/:userId/reset-password")
  async resetMemberPassword(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("userId") userId: string, @Body() dto: { password?: string }) {
    const r = await this.clients.resetMemberPassword(user, id, userId, dto?.password);
    await this.audit.log(user, "client.member.password.reset", { target: r.email, metadata: { clientId: id } });
    return r;
  }

  // Reset the client's main login password.
  @Post(":id/reset-password")
  async resetClientLogin(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { password?: string }) {
    const r = await this.clients.resetClientLogin(user, id, dto?.password);
    await this.audit.log(user, "client.password.reset", { target: r.email, metadata: { clientId: id } });
    return r;
  }
}
