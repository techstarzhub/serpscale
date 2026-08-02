import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { normalizeEmail } from "../common/email.util";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // Every user across all tenants (super admin view).
  listAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        orgId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Full profile for the signed-in user, including a fresh presigned avatar URL.
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    return this.toPublic(user);
  }

  async updateProfile(userId: string, input: { name?: string; email?: string }) {
    const normalizedEmail = input.email ? normalizeEmail(input.email) : undefined;
    if (normalizedEmail) {
      const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing && existing.id !== userId) {
        throw new ConflictException("That email is already in use.");
      }
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name ?? undefined,
        email: normalizedEmail,
      },
    });
    return this.toPublic(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException("Your current password is incorrect.");
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 12), passwordChangedAt: new Date() },
    });
    // Invalidate all existing sessions after a password change.
    await this.prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});
    return { ok: true };
  }

  // Persist the user's dashboard theme (dynamic CSS tokens + light/dark mode) so it
  // follows them across devices. Stored as { overrides, mode }; merged, not replaced.
  async setTheme(userId: string, input: { themeOverrides?: Record<string, string>; mode?: "light" | "dark" }) {
    const current = (await this.prisma.user.findUnique({ where: { id: userId }, select: { themeOverrides: true } }))?.themeOverrides as any;
    const next = {
      overrides: input.themeOverrides ?? current?.overrides ?? {},
      mode: input.mode ?? current?.mode ?? "light",
    };
    await this.prisma.user.update({ where: { id: userId }, data: { themeOverrides: next } });
    return { ok: true, theme: next };
  }

  // First-login onboarding: set the user's own password (no current password —
  // they're already authenticated with the temp one), name and initial theme,
  // then flag onboarding complete. Idempotent-guarded so it can't re-run.
  async completeOnboarding(
    userId: string,
    input: { name?: string; newPassword?: string; themeOverrides?: Record<string, string>; mode?: "light" | "dark" },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    if (user.onboardedAt) throw new BadRequestException("Onboarding already completed.");

    const data: Record<string, unknown> = { onboardedAt: new Date() };
    if (input.name != null) data.name = input.name;
    if (input.newPassword) {
      data.passwordHash = await bcrypt.hash(input.newPassword, 12);
      data.passwordChangedAt = new Date();
    }
    if (input.themeOverrides || input.mode) {
      data.themeOverrides = {
        overrides: input.themeOverrides ?? (user.themeOverrides as any)?.overrides ?? {},
        mode: input.mode ?? (user.themeOverrides as any)?.mode ?? "light",
      };
    }
    const updated = await this.prisma.user.update({ where: { id: userId }, data });
    // A fresh password invalidates any other sessions minted with the temp one.
    if (input.newPassword) await this.prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});
    return this.toPublic(updated);
  }

  async setAvatar(userId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded.");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      throw new BadRequestException("Please upload a PNG, JPG, or WebP image.");
    }
    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const key = this.storage.key("avatars", userId, `${Date.now()}.${ext}`);
    const prev = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
    await this.storage.put(key, file.buffer, file.mimetype);

    // Commit the DB pointer to the new object BEFORE deleting the old one. If the
    // update failed after we'd removed the old key, the record would point at a
    // deleted object and the avatar would 404. Order: put new → save → drop old.
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });

    if (prev?.avatarKey && prev.avatarKey !== key) {
      try {
        await this.storage.remove(prev.avatarKey); // best effort
      } catch {
        /* ignore */
      }
    }
    return this.toPublic(user);
  }

  async removeAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    if (user.avatarKey) {
      try {
        await this.storage.remove(user.avatarKey);
      } catch {
        /* ignore */
      }
      await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
    }
    return { ok: true };
  }

  private async toPublic(user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    orgId: string | null;
    avatarKey: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      avatarUrl: user.avatarKey ? await this.storage.signedUrl(user.avatarKey) : null,
    };
  }
}
