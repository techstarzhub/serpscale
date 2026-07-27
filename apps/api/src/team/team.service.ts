import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ALL_PERMS, type Permission } from "../auth/permissions";
import type { AuthUser } from "../auth/decorators/current-user.decorator";

const VALID = new Set<string>(ALL_PERMS);

/** Org-scoped team + custom-role management. Everything is bound to the caller's org. */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  private orgOf(user: AuthUser): string {
    if (!user.orgId) throw new ForbiddenException("No organization for this account");
    return user.orgId;
  }

  private cleanPerms(perms: unknown): Permission[] {
    if (!Array.isArray(perms)) return [];
    return [...new Set(perms.filter((p): p is Permission => typeof p === "string" && VALID.has(p)))];
  }

  // ---- Custom roles ----

  listRoles(user: AuthUser) {
    return this.prisma.customRole.findMany({
      where: { orgId: this.orgOf(user) },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { users: true } } },
    });
  }

  async createRole(user: AuthUser, dto: { name: string; description?: string; permissions: string[] }) {
    const orgId = this.orgOf(user);
    if (!dto.name?.trim()) throw new BadRequestException("Role name is required");
    return this.prisma.customRole.create({
      data: { orgId, name: dto.name.trim(), description: dto.description ?? null, permissions: this.cleanPerms(dto.permissions) },
    });
  }

  async updateRole(user: AuthUser, id: string, dto: { name?: string; description?: string; permissions?: string[] }) {
    const orgId = this.orgOf(user);
    const role = await this.prisma.customRole.findFirst({ where: { id, orgId } });
    if (!role) throw new NotFoundException("Role not found");
    return this.prisma.customRole.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? undefined,
        description: dto.description ?? undefined,
        permissions: dto.permissions ? this.cleanPerms(dto.permissions) : undefined,
      },
    });
  }

  async deleteRole(user: AuthUser, id: string) {
    const orgId = this.orgOf(user);
    const role = await this.prisma.customRole.findFirst({ where: { id, orgId } });
    if (!role) throw new NotFoundException("Role not found");
    // Detach members first so they fall back to their built-in role.
    await this.prisma.user.updateMany({ where: { customRoleId: id }, data: { customRoleId: null } });
    await this.prisma.customRole.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Members ----

  listMembers(user: AuthUser) {
    return this.prisma.user.findMany({
      where: { orgId: this.orgOf(user) },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, customRole: { select: { id: true, name: true } } },
    });
  }

  async inviteMember(user: AuthUser, dto: { email: string; name?: string; customRoleId?: string; role?: string; password?: string }) {
    const orgId = this.orgOf(user);
    const email = dto.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) throw new BadRequestException("Valid email required");
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException("A user with this email already exists");

    // Only a full admin can create another admin (privilege escalation guard).
    const makeAdmin = dto.role === "ADMIN";
    if (makeAdmin && user.role !== "ADMIN") throw new ForbiddenException("Only an admin can create another admin.");

    if (!makeAdmin && dto.customRoleId) {
      const role = await this.prisma.customRole.findFirst({ where: { id: dto.customRoleId, orgId } });
      if (!role) throw new BadRequestException("Invalid role for this organization");
    }

    // Temp password: admin shares it, user resets on first login.
    const tempPassword = dto.password?.trim() || randomBytes(6).toString("base64url");
    const created = await this.prisma.user.create({
      data: {
        email,
        name: dto.name ?? null,
        role: makeAdmin ? "ADMIN" : "MEMBER",
        orgId,
        customRoleId: makeAdmin ? null : dto.customRoleId ?? null,
        passwordHash: await bcrypt.hash(tempPassword, 12),
      },
      select: { id: true, email: true, name: true },
    });
    return { ...created, tempPassword };
  }

  // ---- Campaign (project) assignment ----

  /** Projects in the caller's org — for the assignment picker. */
  orgProjects(user: AuthUser) {
    return this.prisma.project.findMany({
      where: { orgId: this.orgOf(user) },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, domain: true },
    });
  }

  /** The project ids a member currently has access to. */
  async memberProjects(user: AuthUser, memberId: string) {
    const orgId = this.orgOf(user);
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, orgId },
      select: { assignedProjects: { select: { id: true } } },
    });
    if (!member) throw new NotFoundException("Member not found");
    return member.assignedProjects.map((p) => p.id);
  }

  /** Replace the member's assigned campaigns (only projects in this org count). */
  async setMemberProjects(user: AuthUser, memberId: string, projectIds: string[]) {
    const orgId = this.orgOf(user);
    const member = await this.prisma.user.findFirst({ where: { id: memberId, orgId } });
    if (!member) throw new NotFoundException("Member not found");
    const valid = await this.prisma.project.findMany({
      where: { orgId, id: { in: Array.isArray(projectIds) ? projectIds : [] } },
      select: { id: true },
    });
    await this.prisma.user.update({
      where: { id: memberId },
      data: { assignedProjects: { set: valid.map((p) => ({ id: p.id })) } },
    });
    void this.notifications.notify(memberId, "team", {
      title: "Your campaign access changed",
      body: `You now have access to ${valid.length} campaign${valid.length === 1 ? "" : "s"}.`,
      link: "/dashboard",
    });
    return { ok: true, count: valid.length };
  }

  async updateMember(user: AuthUser, id: string, dto: { customRoleId?: string | null; role?: string; isActive?: boolean }) {
    const orgId = this.orgOf(user);
    const member = await this.prisma.user.findFirst({ where: { id, orgId } });
    if (!member) throw new NotFoundException("Member not found");
    if (member.id === user.id && dto.isActive === false) throw new BadRequestException("You cannot deactivate yourself");

    // Promoting/demoting to admin: only an admin may do it, and not on themselves.
    const changingRole = dto.role !== undefined;
    if (changingRole) {
      if (user.role !== "ADMIN") throw new ForbiddenException("Only an admin can change a member's role level.");
      if (member.id === user.id) throw new BadRequestException("You cannot change your own role level.");
    }

    if (!changingRole && dto.customRoleId) {
      const role = await this.prisma.customRole.findFirst({ where: { id: dto.customRoleId, orgId } });
      if (!role) throw new BadRequestException("Invalid role");
    }

    const data: any = { isActive: dto.isActive ?? undefined };
    if (dto.role === "ADMIN") {
      data.role = "ADMIN";
      data.customRoleId = null; // admins get every org permission; a custom role would only narrow it
    } else if (dto.role === "MEMBER") {
      data.role = "MEMBER";
      if (dto.customRoleId !== undefined) data.customRoleId = dto.customRoleId;
    } else if (dto.customRoleId !== undefined) {
      data.customRoleId = dto.customRoleId;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, isActive: true, role: true, customRole: { select: { id: true, name: true } } },
    });
    // Tell the member their role / access changed (but not on simple activate/deactivate).
    if (dto.role !== undefined || dto.customRoleId !== undefined) {
      const roleName = updated.role === "ADMIN" ? "Admin" : updated.customRole?.name ?? "Member";
      void this.notifications.notify(id, "team", {
        title: "Your role was updated",
        body: `You're now a ${roleName}.`,
        link: "/dashboard",
      });
    }
    return updated;
  }

  // ---- Agency branding (white-label) ----

  async getBranding(user: AuthUser) {
    const org = await this.prisma.organization.findUnique({
      where: { id: this.orgOf(user) },
      select: { name: true, branding: true },
    });
    const b = (org?.branding as any) ?? {};
    return { agencyName: b.agencyName ?? "", logoDataUrl: b.logoDataUrl ?? null, logoBg: b.logoBg ?? null, orgName: org?.name ?? "" };
  }

  async setBranding(user: AuthUser, dto: { agencyName?: string; logoDataUrl?: string | null; logoBg?: string | null }) {
    const orgId = this.orgOf(user);
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { branding: true } });
    const current = (org?.branding as any) ?? {};

    const next: any = { ...current };
    if (dto.agencyName !== undefined) next.agencyName = String(dto.agencyName).trim().slice(0, 60);
    if (dto.logoDataUrl !== undefined) {
      if (dto.logoDataUrl === null || dto.logoDataUrl === "") {
        delete next.logoDataUrl;
      } else {
        if (!/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(dto.logoDataUrl)) {
          throw new BadRequestException("Logo must be a PNG, JPG, WEBP or SVG image.");
        }
        if (dto.logoDataUrl.length > 700_000) throw new BadRequestException("Logo is too large (max ~500 KB).");
        next.logoDataUrl = dto.logoDataUrl;
      }
    }
    if (dto.logoBg !== undefined) {
      if (dto.logoBg === null || dto.logoBg === "") {
        delete next.logoBg; // transparent / no background
      } else {
        if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(dto.logoBg)) throw new BadRequestException("Background must be a hex color like #4f46e5.");
        next.logoBg = dto.logoBg.toLowerCase();
      }
    }
    await this.prisma.organization.update({ where: { id: orgId }, data: { branding: next } });
    return { agencyName: next.agencyName ?? "", logoDataUrl: next.logoDataUrl ?? null, logoBg: next.logoBg ?? null };
  }

  // ---- Agency SMTP ----

  async getSmtp(user: AuthUser) {
    const org = await this.prisma.organization.findUnique({ where: { id: this.orgOf(user) }, select: { smtp: true } });
    const s = (org?.smtp as any) ?? {};
    // Never return the stored password; expose only whether one is set.
    return {
      host: s.host ?? "",
      port: s.port ?? 587,
      secure: !!s.secure,
      user: s.user ?? "",
      fromName: s.fromName ?? "",
      fromEmail: s.fromEmail ?? "",
      hasPass: !!s.pass,
      enabled: !!(s.host && s.user),
    };
  }

  async setSmtp(user: AuthUser, dto: Record<string, unknown>) {
    const orgId = this.orgOf(user);
    // Clearing: empty host disables the org SMTP (falls back to platform default).
    if (dto.host !== undefined && !String(dto.host).trim()) {
      await this.prisma.organization.update({ where: { id: orgId }, data: { smtp: {} } });
      return { enabled: false };
    }
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { smtp: true } });
    const current = (org?.smtp as any) ?? {};
    const next: any = {
      host: String(dto.host ?? current.host ?? "").trim(),
      port: Number(dto.port ?? current.port ?? 587),
      secure: dto.secure !== undefined ? !!dto.secure : !!current.secure,
      user: String(dto.user ?? current.user ?? "").trim(),
      fromName: String(dto.fromName ?? current.fromName ?? "").trim(),
      fromEmail: String(dto.fromEmail ?? current.fromEmail ?? "").trim(),
      // Keep the existing password when the field is left blank on save.
      pass: dto.pass ? String(dto.pass) : current.pass ?? "",
    };
    await this.prisma.organization.update({ where: { id: orgId }, data: { smtp: next } });
    return { enabled: !!(next.host && next.user) };
  }

  async testSmtp(user: AuthUser, to?: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: this.orgOf(user) }, select: { smtp: true } });
    const cfg = (org?.smtp as any) ?? {};
    const target = (to && to.trim()) || user.email;
    const res = await this.email.sendWith(
      cfg,
      target,
      "SMTP test",
      this.email.wrap("SMTP is working", "This is a test email confirming your agency mail server is set up correctly."),
    );
    return { ...res, to: target };
  }
}
