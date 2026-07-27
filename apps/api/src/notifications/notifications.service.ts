import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { PermissionsService } from "../auth/permissions.service";
import { NOTIFICATION_TYPES } from "./notifications.types";
import type { AuthUser } from "../auth/decorators/current-user.decorator";

interface Payload {
  title: string;
  body?: string;
  link?: string;
}

/** In-app + email notifications, each gated by the recipient's own preferences. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly perms: PermissionsService,
  ) {}

  // The notification types a user is allowed to see (admin-only types are hidden
  // from members/clients who lack the permission).
  private async visibleTypes(user: Pick<AuthUser, "id" | "role">) {
    const held = await this.perms.resolve(user);
    return NOTIFICATION_TYPES.filter((t) => !t.permission || held.has(t.permission as any));
  }

  // Effective preference for a type = the user's saved choice, else the type default.
  private effective(prefs: any, type: string): { inApp: boolean; email: boolean } {
    const def = NOTIFICATION_TYPES.find((t) => t.key === type)?.defaults ?? { inApp: true, email: false };
    const p = (prefs ?? {})[type] ?? {};
    return { inApp: p.inApp ?? def.inApp, email: p.email ?? def.email };
  }

  /** Deliver a notification to a user, honouring their on/off preferences. */
  async notify(userId: string, type: string, payload: Payload): Promise<void> {
    const user = await this.prisma.user
      .findUnique({ where: { id: userId }, select: { email: true, orgId: true, notifPrefs: true, isActive: true } })
      .catch(() => null);
    if (!user || !user.isActive) return;
    const pref = this.effective(user.notifPrefs, type);

    if (pref.inApp) {
      await this.prisma.notification
        .create({ data: { userId, type, title: payload.title, body: payload.body ?? null, link: payload.link ?? null } })
        .catch(() => {});
    }
    if (pref.email) {
      const web = process.env.WEB_ORIGIN || "http://localhost:3000";
      const cta = payload.link ? { label: "Open", url: `${web}${payload.link}` } : undefined;
      await this.email.send(user.email, payload.title, this.email.wrap(payload.title, payload.body ?? "", cta), user.orgId).catch(() => {});
    }
  }

  async notifyMany(userIds: string[], type: string, payload: Payload): Promise<void> {
    for (const id of [...new Set(userIds)]) await this.notify(id, type, payload);
  }

  // ---- Feed ----
  list(userId: string, limit = 30) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: Math.min(100, limit) });
  }
  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }
  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
    return { ok: true };
  }
  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return { ok: true };
  }
  async clear(userId: string) {
    await this.prisma.notification.deleteMany({ where: { userId } });
    return { ok: true };
  }

  // ---- Preferences ----
  async getPreferences(user: Pick<AuthUser, "id" | "role">) {
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { notifPrefs: true } });
    const prefs = (dbUser?.notifPrefs as any) ?? {};
    const types = await this.visibleTypes(user);
    return {
      types: types.map((t) => ({
        key: t.key,
        group: t.group,
        label: t.label,
        description: t.description,
        ...this.effective(prefs, t.key),
      })),
    };
  }

  async setPreferences(user: Pick<AuthUser, "id" | "role">, incoming: Record<string, { inApp?: boolean; email?: boolean }>) {
    // Only allow saving types the user is actually allowed to see.
    const allowed = new Set((await this.visibleTypes(user)).map((t) => t.key));
    const existing = await this.prisma.user.findUnique({ where: { id: user.id }, select: { notifPrefs: true } });
    const clean: Record<string, { inApp: boolean; email: boolean }> = { ...((existing?.notifPrefs as any) ?? {}) };
    for (const t of NOTIFICATION_TYPES) {
      if (!allowed.has(t.key)) continue;
      const v = incoming?.[t.key];
      if (v) clean[t.key] = { inApp: !!v.inApp, email: !!v.email };
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { notifPrefs: clean } });
    return this.getPreferences(user);
  }
}
