import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../auth/permissions.service";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PERMISSIONS } from "../auth/permissions";
import type { AuthUser } from "../auth/decorators/current-user.decorator";
import type { ReportBrand } from "../crawl/report";
import { EntitlementsService } from "../entitlements/entitlements.service";

const clientInclude = {
  _count: { select: { projects: true, members: true } },
} as const;

/** Org-scoped client management. Clients group campaigns (many-to-many); some
 *  are white-label sub-agencies with their own branding + members. */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private orgOf(user: AuthUser): string {
    if (!user.orgId) throw new ForbiddenException("No organization for this account");
    return user.orgId;
  }

  // Campaign ids this user is allowed to see (used to scope "assigned" views).
  private async visibleProjectIds(user: AuthUser): Promise<string[]> {
    const orgId = this.orgOf(user);
    const p = await this.perms.resolve(user);
    if (p.has(PERMISSIONS.PROJECTS_VIEW)) {
      const rows = await this.prisma.project.findMany({ where: { orgId }, select: { id: true } });
      return rows.map((r) => r.id);
    }
    const rows = await this.prisma.project.findMany({
      where: { orgId, members: { some: { id: user.id } } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async list(user: AuthUser) {
    const orgId = this.orgOf(user);
    const p = await this.perms.resolve(user);
    if (p.has(PERMISSIONS.CLIENTS_VIEW_ALL)) {
      return this.prisma.client.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, include: clientInclude });
    }
    if (p.has(PERMISSIONS.CLIENTS_VIEW_ASSIGNED)) {
      const ids = await this.visibleProjectIds(user);
      return this.prisma.client.findMany({
        where: { orgId, projects: { some: { id: { in: ids } } } },
        orderBy: { createdAt: "desc" },
        include: clientInclude,
      });
    }
    throw new ForbiddenException("You do not have permission to view clients.");
  }

  async get(user: AuthUser, id: string) {
    const orgId = this.orgOf(user);
    const p = await this.perms.resolve(user);
    if (!p.has(PERMISSIONS.CLIENTS_VIEW_ALL) && !p.has(PERMISSIONS.CLIENTS_VIEW_ASSIGNED)) {
      throw new ForbiddenException("You do not have permission to view clients.");
    }
    const client = await this.prisma.client.findFirst({
      where: { id, orgId },
      include: {
        projects: { select: { id: true, name: true, domain: true }, orderBy: { createdAt: "desc" } },
        _count: { select: { projects: true, members: true } },
      },
    });
    if (!client) throw new NotFoundException("Client not found");
    // "View assigned" users may only open clients tied to a campaign they can see.
    if (!p.has(PERMISSIONS.CLIENTS_VIEW_ALL)) {
      const ids = new Set(await this.visibleProjectIds(user));
      if (!client.projects.some((pr) => ids.has(pr.id))) throw new ForbiddenException("You do not have access to this client.");
    }
    return client;
  }

  async create(
    user: AuthUser,
    dto: { name?: string; company?: string; email?: string; phone?: string; notes?: string; password?: string; sendInvite?: boolean; type?: string; allowTeam?: boolean },
  ) {
    const orgId = this.orgOf(user);
    // Enforce the plan's clients cap (a Starter plan with clients:0 blocks all).
    const clientCount = await this.prisma.client.count({ where: { orgId } });
    await this.entitlements.assertWithinLimit(orgId, "clients", clientCount);
    const name = (dto?.name ?? "").trim();
    if (!name) throw new BadRequestException("Client name is required.");
    const email = (dto?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) throw new BadRequestException("A valid email is required.");
    // Password is optional: if blank, the system generates one and emails it.
    let password = (dto?.password ?? "").trim();
    if (password && password.length < 6) throw new BadRequestException("Password must be at least 6 characters.");
    if (!password) password = randomBytes(6).toString("base64url");
    if (await this.prisma.user.findUnique({ where: { email } }))
      throw new BadRequestException("A user with this email already exists.");

    const client = await this.prisma.client.create({
      data: {
        orgId,
        name: name.slice(0, 120),
        company: dto.company?.trim() || null,
        email,
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
        type: dto.type === "AGENCY" ? "AGENCY" : "CLIENT",
        allowTeam: !!dto.allowTeam,
      },
      include: clientInclude,
    });

    // Create the client's portal login (owner) so they can sign in to view reports.
    const owner = await this.prisma.user.create({
      data: {
        email,
        name: name.slice(0, 120),
        role: "CLIENT",
        orgId,
        clientId: client.id,
        clientOwner: true,
        passwordHash: await bcrypt.hash(password, 12),
      },
      select: { id: true },
    });

    // Send the login email (email + password + portal URL). Toggle, on by default.
    // Never fail client creation just because email delivery is down.
    if (dto.sendInvite !== false) {
      await this.email
        .sendBranded(
          email,
          "Your reporting portal access",
          `${name} — portal access`,
          `An account was created for you to view your SEO reports. Sign in with:<br><br><b>Email:</b> ${email}<br><b>Password:</b> ${password}<br><br>Please change your password after signing in.`,
          { label: "Sign in", url: `${process.env.WEB_ORIGIN || "http://localhost:3000"}/login` },
          orgId,
        )
        .catch(() => {});
    }
    void this.notifications.notify(owner.id, "team", {
      title: "Welcome — your reporting portal is ready",
      body: "Sign in to view your SEO reports and campaigns.",
      link: "/dashboard",
    });

    return client;
  }

  private async owned(user: AuthUser, id: string) {
    const client = await this.prisma.client.findFirst({ where: { id, orgId: this.orgOf(user) } });
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  async update(user: AuthUser, id: string, dto: { name?: string; company?: string; email?: string; phone?: string; notes?: string; status?: string; type?: string; allowTeam?: boolean }) {
    await this.owned(user, id);
    return this.prisma.client.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim().slice(0, 120) || undefined : undefined,
        company: dto.company !== undefined ? dto.company.trim() || null : undefined,
        email: dto.email !== undefined ? dto.email.trim() || null : undefined,
        phone: dto.phone !== undefined ? dto.phone.trim() || null : undefined,
        notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
        status: dto.status === "PAUSED" || dto.status === "ACTIVE" ? dto.status : undefined,
        type: dto.type === "AGENCY" || dto.type === "CLIENT" ? dto.type : undefined,
        allowTeam: dto.allowTeam !== undefined ? !!dto.allowTeam : undefined,
      },
      include: clientInclude,
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.owned(user, id);
    // Campaigns stay; the M:N links and any client members are removed/detached.
    await this.prisma.client.delete({ where: { id } });
    return { ok: true };
  }

  // Assign the exact set of campaigns to this client (many-to-many).
  async setCampaigns(user: AuthUser, id: string, projectIds: string[]) {
    const orgId = this.orgOf(user);
    await this.owned(user, id);
    const ids = Array.isArray(projectIds) ? [...new Set(projectIds)] : [];
    // Only allow campaigns from the same org.
    const valid = await this.prisma.project.findMany({ where: { id: { in: ids }, orgId }, select: { id: true } });
    await this.prisma.client.update({
      where: { id },
      data: { projects: { set: valid.map((v) => ({ id: v.id })) } },
    });
    return { count: valid.length };
  }

  // Mark as an agency (white-label) client and/or set its branding.
  async setAgency(user: AuthUser, id: string, dto: { type?: string; branding?: any }) {
    await this.owned(user, id);
    const data: any = {};
    if (dto.type !== undefined) {
      if (dto.type !== "CLIENT" && dto.type !== "AGENCY") throw new BadRequestException("Invalid client type.");
      data.type = dto.type;
    }
    if (dto.branding !== undefined) {
      const b = dto.branding ?? {};
      const next: any = {};
      if (b.agencyName != null) next.agencyName = String(b.agencyName).trim().slice(0, 60);
      if (b.email != null) next.email = String(b.email).trim().slice(0, 160);
      if (b.logoBg != null && b.logoBg !== "") {
        if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(b.logoBg)) throw new BadRequestException("Background must be a hex color.");
        next.logoBg = String(b.logoBg).toLowerCase();
      }
      if (b.logoDataUrl != null && b.logoDataUrl !== "") {
        if (!/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(b.logoDataUrl)) throw new BadRequestException("Logo must be an image.");
        if (b.logoDataUrl.length > 700_000) throw new BadRequestException("Logo is too large (max ~500 KB).");
        next.logoDataUrl = b.logoDataUrl;
      }
      if (b.whiteLabel !== undefined) next.whiteLabel = !!b.whiteLabel;
      data.branding = next;
    }
    return this.prisma.client.update({ where: { id }, data, include: clientInclude });
  }

  // ---- Agency client self-service branding (own name + logo) ----

  private async myAgencyClient(user: AuthUser) {
    if (user.role !== "CLIENT") throw new ForbiddenException("Only a client can edit their own branding.");
    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { clientId: true, clientOwner: true, client: { select: { id: true, name: true, type: true, branding: true } } },
    });
    if (!me?.clientOwner || !me.clientId || me.client?.type !== "AGENCY") {
      throw new ForbiddenException("Only an agency client owner can manage branding.");
    }
    return me.client;
  }

  async getMyBranding(user: AuthUser) {
    const client = await this.myAgencyClient(user);
    const b = (client.branding as any) ?? {};
    return { agencyName: b.agencyName || client.name || "", logoDataUrl: b.logoDataUrl ?? null, logoBg: b.logoBg ?? null };
  }

  async updateMyBranding(user: AuthUser, dto: { agencyName?: string; logoDataUrl?: string | null; logoBg?: string | null }) {
    const client = await this.myAgencyClient(user);
    const prev = (client.branding as any) ?? {};
    const next: any = { ...prev };
    if (dto.agencyName !== undefined) next.agencyName = String(dto.agencyName).trim().slice(0, 60);
    if (dto.logoBg !== undefined) {
      if (dto.logoBg && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(dto.logoBg)) throw new BadRequestException("Background must be a hex color.");
      next.logoBg = dto.logoBg || null;
    }
    if (dto.logoDataUrl !== undefined) {
      if (dto.logoDataUrl) {
        if (!/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(dto.logoDataUrl)) throw new BadRequestException("Logo must be an image.");
        if (dto.logoDataUrl.length > 700_000) throw new BadRequestException("Logo is too large (max ~500 KB).");
      }
      next.logoDataUrl = dto.logoDataUrl || null;
    }
    await this.prisma.client.update({ where: { id: client.id }, data: { branding: next } });
    return { agencyName: next.agencyName || "", logoDataUrl: next.logoDataUrl ?? null, logoBg: next.logoBg ?? null };
  }

  // Brand (name + logo) to put on a campaign report, resolved per requester:
  //   - a client-portal user whose client is a white-label agency -> that agency's brand
  //   - otherwise the requesting org's agency branding
  //   - else the platform default ("SerpScale").
  async reportBrand(user: AuthUser, _projectId: string): Promise<ReportBrand> {
    const DEFAULT: ReportBrand = { name: process.env.BRAND_NAME || "SerpScale", logo: null, logoBg: null };
    if (user.role === "CLIENT") {
      const me = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { client: { select: { type: true, name: true, branding: true } } },
      });
      const c = me?.client;
      if (c?.type === "AGENCY") {
        const b: any = c.branding ?? {};
        const name = b.whiteLabel !== false && b.agencyName ? b.agencyName : c.name;
        return { name, logo: b.logoDataUrl ?? null, logoBg: b.logoBg ?? null };
      }
    }
    if (user.orgId) {
      const org = await this.prisma.organization.findUnique({ where: { id: user.orgId }, select: { branding: true } });
      const b: any = org?.branding ?? {};
      if (b.agencyName || b.logoDataUrl) {
        return { name: b.agencyName || DEFAULT.name, logo: b.logoDataUrl ?? null, logoBg: b.logoBg ?? null };
      }
    }
    return DEFAULT;
  }

  // For "send report": validate the campaign is linked to this client (same org),
  // resolve the white-label brand + the client's active member emails.
  async recipientsForReport(user: AuthUser, clientId: string, projectId: string) {
    const orgId = this.orgOf(user);
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, orgId, projects: { some: { id: projectId } } },
      select: { id: true, name: true, type: true, branding: true, email: true },
    });
    if (!client) throw new NotFoundException("Client not found, or this campaign is not assigned to it.");
    const members = await this.prisma.user.findMany({
      where: { clientId, isActive: true },
      select: { email: true },
    });
    const b: any = client.branding ?? {};
    const brand = client.type === "AGENCY" && b.whiteLabel !== false && b.agencyName ? b.agencyName : client.name;
    // Recipients: the client's portal members, plus the client contact email if set.
    const emails = [...new Set([...members.map((m) => m.email), ...(client.email ? [client.email] : [])])];
    return { brand, emails, clientName: client.name };
  }

  // ---- Client members (portal users) ----

  // Who may manage a client's members: agency staff with manage_agency (same org),
  // or the client's OWN owner (a CLIENT user flagged clientOwner on that client).
  private async assertCanManageMembers(user: AuthUser, client: { id: string; orgId: string; type: string; allowTeam?: boolean }) {
    if (user.role === "CLIENT") {
      // The client owner can only manage their team if the agency enabled it.
      if (!client.allowTeam) throw new ForbiddenException("Your account is not allowed to manage team members.");
      const me = await this.prisma.user.findUnique({ where: { id: user.id }, select: { clientId: true, clientOwner: true } });
      if (me?.clientId === client.id && me.clientOwner) return;
      throw new ForbiddenException("Only the client owner can manage members.");
    }
    const perms = await this.perms.resolve(user);
    if (user.orgId === client.orgId && perms.has(PERMISSIONS.CLIENTS_MANAGE_AGENCY)) return;
    throw new ForbiddenException("You do not have permission to manage client members.");
  }

  private async clientById(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id }, select: { id: true, orgId: true, type: true, name: true, branding: true, allowTeam: true } });
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  async listMembers(user: AuthUser, clientId: string) {
    const client = await this.clientById(clientId);
    await this.assertCanManageMembers(user, client);
    return this.prisma.user.findMany({
      where: { clientId },
      select: {
        id: true, email: true, name: true, clientOwner: true, isActive: true, lastLoginAt: true,
        clientAllCampaigns: true,
        assignedProjects: { select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  // The campaigns of this client — for the member campaign-access picker.
  async clientCampaigns(user: AuthUser, clientId: string) {
    const client = await this.clientById(clientId);
    await this.assertCanManageMembers(user, client);
    return this.prisma.project.findMany({
      where: { clients: { some: { id: clientId } } },
      select: { id: true, name: true, domain: true },
      orderBy: { name: "asc" },
    });
  }

  // The campaigns that belong to a given client (used to scope member assignment).
  private async clientProjectIds(clientId: string): Promise<string[]> {
    const rows = await this.prisma.project.findMany({
      where: { clients: { some: { id: clientId } } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async addMember(
    user: AuthUser,
    clientId: string,
    dto: { email?: string; name?: string; owner?: boolean; password?: string; allCampaigns?: boolean; projectIds?: string[] },
  ) {
    const client = await this.clientById(clientId);
    await this.assertCanManageMembers(user, client);
    if (!client.allowTeam) throw new BadRequestException("This client is not allowed to add team members. Enable it in the client's settings.");

    const email = (dto?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) throw new BadRequestException("A valid email is required.");
    if (await this.prisma.user.findUnique({ where: { email } })) throw new BadRequestException("A user with this email already exists.");

    // Owners always see all campaigns. Otherwise honour the agency's choice; when
    // "specific" is chosen, restrict the assigned set to this client's own campaigns.
    const allCampaigns = !!dto.owner || dto.allCampaigns !== false;
    let assign: string[] = [];
    if (!allCampaigns) {
      const own = new Set(await this.clientProjectIds(clientId));
      assign = (dto.projectIds ?? []).filter((id) => own.has(id));
    }

    const tempPassword = dto.password?.trim() || randomBytes(6).toString("base64url");
    const created = await this.prisma.user.create({
      data: {
        email,
        name: dto.name?.trim() || null,
        role: "CLIENT",
        orgId: client.orgId,
        clientId: client.id,
        clientOwner: !!dto.owner,
        clientAllCampaigns: allCampaigns,
        passwordHash: await bcrypt.hash(tempPassword, 12),
        ...(assign.length ? { assignedProjects: { connect: assign.map((id) => ({ id })) } } : {}),
      },
      select: { id: true, email: true, name: true, clientOwner: true, isActive: true, lastLoginAt: true },
    });

    // Invite email (from the agency's own SMTP if configured).
    const web = process.env.WEB_ORIGIN || "http://localhost:3000";
    const b: any = client.branding ?? {};
    const who = b.agencyName || client.name;
    await this.email.sendBranded(
      email,
      "Your reporting portal access",
      `${who} — portal access`,
      `An account was created for you to view your SEO reports. Sign in with:<br><br><b>Email:</b> ${email}<br><b>Temporary password:</b> ${tempPassword}<br><br>Please change your password after signing in.`,
      { label: "Sign in", url: `${web}/login` },
      client.orgId,
    );
    void this.notifications.notify(created.id, "team", {
      title: "Welcome — your reporting portal is ready",
      body: "Sign in to view your SEO reports and campaigns.",
      link: "/dashboard",
    });
    return { ...created, tempPassword };
  }

  async removeMember(user: AuthUser, clientId: string, userId: string) {
    const client = await this.clientById(clientId);
    await this.assertCanManageMembers(user, client);
    if (userId === user.id) throw new BadRequestException("You can't remove yourself.");
    const target = await this.prisma.user.findFirst({ where: { id: userId, clientId }, select: { id: true, clientOwner: true } });
    if (!target) throw new NotFoundException("Member not found");
    if (target.clientOwner) {
      const owners = await this.prisma.user.count({ where: { clientId, clientOwner: true, isActive: true } });
      if (owners <= 1) throw new BadRequestException("You cannot remove the last owner of this client.");
    }
    // Deactivate (revokes login) rather than hard-delete, so history is preserved.
    await this.prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    return { ok: true };
  }

  // Set a new password (given or auto-generated), email it, and return it to the admin.
  private async applyPasswordReset(target: { id: string; email: string }, orgId: string, password?: string) {
    const pw = password?.trim();
    if (pw && pw.length < 6) throw new BadRequestException("Password must be at least 6 characters.");
    const newPassword = pw || randomBytes(6).toString("base64url");
    await this.prisma.user.update({ where: { id: target.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    const web = process.env.WEB_ORIGIN || "http://localhost:3000";
    await this.email
      .sendBranded(
        target.email,
        "Your portal password was reset",
        "Password reset",
        `An administrator reset your password.<br><br><b>Email:</b> ${target.email}<br><b>New password:</b> ${newPassword}<br><br>Please change it after signing in.`,
        { label: "Sign in", url: `${web}/login` },
        orgId,
      )
      .catch(() => {});
    void this.notifications.notify(target.id, "team", { title: "Your password was reset", body: "Check your email for the new password.", link: "/dashboard" });
    return { email: target.email, tempPassword: newPassword };
  }

  // Reset a portal member's password (client owner or admin who manages the client).
  async resetMemberPassword(user: AuthUser, clientId: string, userId: string, password?: string) {
    const client = await this.clientById(clientId);
    await this.assertCanManageMembers(user, client);
    const target = await this.prisma.user.findFirst({ where: { id: userId, clientId }, select: { id: true, email: true } });
    if (!target) throw new NotFoundException("Member not found");
    return this.applyPasswordReset(target, client.orgId, password);
  }

  // The campaigns of this client + a member's current selection — for the
  // "specific campaigns" picker when editing a member's access.
  async memberCampaigns(user: AuthUser, clientId: string, userId: string) {
    const client = await this.clientById(clientId);
    await this.assertCanManageMembers(user, client);
    const target = await this.prisma.user.findFirst({
      where: { id: userId, clientId },
      select: { clientOwner: true, clientAllCampaigns: true, assignedProjects: { select: { id: true } } },
    });
    if (!target) throw new NotFoundException("Member not found");
    const campaigns = await this.prisma.project.findMany({
      where: { clients: { some: { id: clientId } } },
      select: { id: true, name: true, domain: true },
      orderBy: { name: "asc" },
    });
    return {
      allCampaigns: target.clientOwner || target.clientAllCampaigns,
      isOwner: target.clientOwner,
      assignedIds: target.assignedProjects.map((p) => p.id),
      campaigns,
    };
  }

  // Update a member's campaign access: all campaigns, or a specific set (scoped
  // to this client's own campaigns).
  async setMemberCampaigns(user: AuthUser, clientId: string, userId: string, dto: { allCampaigns?: boolean; projectIds?: string[] }) {
    const client = await this.clientById(clientId);
    await this.assertCanManageMembers(user, client);
    const target = await this.prisma.user.findFirst({ where: { id: userId, clientId }, select: { id: true, clientOwner: true } });
    if (!target) throw new NotFoundException("Member not found");
    if (target.clientOwner) throw new BadRequestException("Owners always have access to all campaigns.");

    const allCampaigns = dto.allCampaigns !== false;
    let assign: string[] = [];
    if (!allCampaigns) {
      const own = new Set(await this.clientProjectIds(clientId));
      assign = (dto.projectIds ?? []).filter((id) => own.has(id));
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        clientAllCampaigns: allCampaigns,
        assignedProjects: { set: assign.map((id) => ({ id })) },
      },
    });
    return { ok: true, allCampaigns, assignedIds: assign };
  }

  // Reset the client's main login (owner) — for the admin, regardless of team settings.
  async resetClientLogin(user: AuthUser, clientId: string, password?: string) {
    const client = await this.owned(user, clientId);
    const perms = await this.perms.resolve(user);
    if (!perms.has(PERMISSIONS.CLIENTS_EDIT)) throw new ForbiddenException("You do not have permission to reset this client's password.");
    const owner = await this.prisma.user.findFirst({ where: { clientId, clientOwner: true, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
    if (!owner) throw new NotFoundException("Client login not found");
    return this.applyPasswordReset(owner, client.orgId, password);
  }
}
