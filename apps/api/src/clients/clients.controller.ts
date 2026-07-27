import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS as P } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { AuditService } from "../auth/audit.service";
import { ClientsService } from "./clients.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService, private readonly audit: AuditService) {}

  // List — permission (view_all OR view_assigned) enforced in the service.
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.clients.list(user);
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
  async addMember(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { email?: string; name?: string; owner?: boolean }) {
    const created = await this.clients.addMember(user, id, dto);
    await this.audit.log(user, "client.member.add", { target: created.email, metadata: { clientId: id } });
    return created;
  }

  @Delete(":id/members/:userId")
  async removeMember(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("userId") userId: string) {
    const res = await this.clients.removeMember(user, id, userId);
    await this.audit.log(user, "client.member.remove", { target: userId, metadata: { clientId: id } });
    return res;
  }
}
