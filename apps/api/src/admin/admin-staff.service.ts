import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PermissionsService } from "../auth/permissions.service";
import { type Permission } from "../auth/permissions";
import type { AuthUser } from "../auth/decorators/current-user.decorator";
import { normalizeEmail } from "../common/email.util";
import { InviteStaffDto, UpdateStaffDto } from "./dto/admin-staff.dto";

/**
 * Platform team ("super admin's team"): staff users (isSuperAdminTeam) who reach
 * the super-admin dashboard, but only the sections their granted permissions
 * allow. Mirrors the org team service, minus org scoping — access is granted as
 * platform permissions on the user (extraPermissions).
 */
@Injectable()
export class AdminStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly permissions: PermissionsService,
  ) {}

  /** Only permissions the actor themselves holds can be granted — and only
   *  platform.* ones (staff are platform-scoped). Prevents privilege escalation. */
  private async grantable(user: AuthUser): Promise<Set<Permission>> {
    const set = await this.permissions.resolve(user);
    return new Set([...set].filter((p) => p.startsWith("platform.")) as Permission[]);
  }
  private async capPerms(user: AuthUser, wanted: string[] | undefined): Promise<string[]> {
    if (!wanted?.length) return [];
    const allowed = await this.grantable(user);
    return [...new Set(wanted.filter((p) => allowed.has(p as Permission)))];
  }

  async listStaff() {
    const rows = await this.prisma.user.findMany({
      where: { isSuperAdminTeam: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, isActive: true, lastLoginAt: true, avatarKey: true, extraPermissions: true, createdAt: true },
    });
    return Promise.all(
      rows.map(async ({ avatarKey, ...m }) => ({ ...m, avatarUrl: avatarKey ? await this.storage.signedUrl(avatarKey) : null })),
    );
  }

  async invite(user: AuthUser, dto: InviteStaffDto) {
    const email = normalizeEmail(dto.email || "");
    if (!email || !email.includes("@")) throw new BadRequestException("A valid email is required.");
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException("A user with this email already exists.");

    const perms = await this.capPerms(user, dto.permissions);
    // Temp password: the super admin shares it; staff resets on first login.
    const tempPassword = dto.password?.trim() || randomBytes(6).toString("base64url");
    const created = await this.prisma.user.create({
      data: {
        email,
        name: dto.name?.trim() || null,
        role: "MEMBER",
        orgId: null,
        isSuperAdminTeam: true,
        extraPermissions: perms,
        passwordHash: await bcrypt.hash(tempPassword, 12),
        mustSetPassword: true,
      },
      select: { id: true, email: true, name: true },
    });
    return { ...created, tempPassword, permissions: perms };
  }

  private async loadStaff(id: string) {
    const s = await this.prisma.user.findFirst({ where: { id, isSuperAdminTeam: true } });
    if (!s) throw new NotFoundException("Staff member not found.");
    return s;
  }

  async update(user: AuthUser, id: string, dto: UpdateStaffDto) {
    const target = await this.loadStaff(id);
    const data: Record<string, unknown> = {};
    if (dto.permissions) data.extraPermissions = await this.capPerms(user, dto.permissions);
    if (typeof dto.isActive === "boolean") {
      if (target.id === user.id) throw new BadRequestException("You can't deactivate yourself.");
      data.isActive = dto.isActive;
    }
    if (Object.keys(data).length) await this.prisma.user.update({ where: { id }, data });
    return { ok: true };
  }

  async remove(user: AuthUser, id: string) {
    const target = await this.loadStaff(id);
    if (target.id === user.id) throw new ForbiddenException("You can't remove yourself.");
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  /** New temp password for a staff member (they reset on next login). */
  async resetPassword(id: string) {
    await this.loadStaff(id);
    const tempPassword = randomBytes(6).toString("base64url");
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(tempPassword, 12), mustSetPassword: true } });
    return { tempPassword };
  }
}
