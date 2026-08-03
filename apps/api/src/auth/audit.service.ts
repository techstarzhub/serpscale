import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { AuthUser } from "./decorators/current-user.decorator";

/** Records an immutable activity trail. Never throws into the request path. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async log(
    user: Pick<AuthUser, "id" | "email" | "orgId"> | null,
    action: string,
    opts: { target?: string; metadata?: Record<string, unknown>; ip?: string } = {},
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          orgId: user?.orgId ?? null,
          userId: user?.id ?? null,
          userEmail: user?.email ?? null,
          action,
          target: opts.target ?? null,
          metadata: (opts.metadata as any) ?? undefined,
          ip: opts.ip ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(`audit log failed for ${action}: ${String(e).slice(0, 80)}`);
    }
  }

  /** Org admins see their own org's trail; super admin sees everything. */
  async listForUser(user: Pick<AuthUser, "role" | "orgId">, limit = 100) {
    const where = user.role === "SUPER_ADMIN" ? {} : { orgId: user.orgId ?? "__none__" };
    return this.prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(500, limit) });
  }

  /**
   * The org's activity trail enriched with each actor's identity (name, avatar,
   * role) and a "team" vs "client" scope derived from the actor — so an org admin
   * can see, in one structured feed, everything their team members AND their
   * clients' portal users have done. Reads aren't logged (only meaningful
   * actions + sign-in), so this stays a signal, not noise.
   */
  async activityForOrg(user: Pick<AuthUser, "orgId">, opts: { limit?: number } = {}) {
    const orgId = user.orgId;
    if (!orgId) return { logs: [] as ActivityRow[] };
    const rows = await this.prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: Math.min(500, opts.limit ?? 250),
    });

    // Enrich actors in one query (unique ids only), then sign avatars once each.
    const ids = [...new Set(rows.map((r) => r.userId).filter((v): v is string => !!v))];
    const actors = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true, role: true, avatarKey: true, client: { select: { id: true, name: true } } },
        })
      : [];
    const byId = new Map(actors.map((a) => [a.id, a]));
    const avatarById = new Map<string, string | null>();
    for (const a of actors) {
      avatarById.set(a.id, a.avatarKey ? await this.storage.signedUrl(a.avatarKey) : null);
    }

    const logs: ActivityRow[] = rows.map((r) => {
      const a = r.userId ? byId.get(r.userId) : undefined;
      const isClient = a?.role === "CLIENT";
      return {
        id: r.id,
        action: r.action,
        target: r.target,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        ip: r.ip,
        createdAt: r.createdAt,
        scope: isClient ? "client" : "team",
        actor: {
          id: a?.id ?? r.userId ?? null,
          name: a?.name ?? null,
          email: a?.email ?? r.userEmail ?? null,
          role: a?.role ?? null,
          avatarUrl: a ? avatarById.get(a.id) ?? null : null,
          clientId: isClient ? a?.client?.id ?? null : null,
          clientName: isClient ? a?.client?.name ?? null : null,
        },
      };
    });
    return { logs };
  }
}

export interface ActivityRow {
  id: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: Date;
  scope: "team" | "client";
  actor: {
    id: string | null;
    name: string | null;
    email: string | null;
    role: string | null;
    avatarUrl: string | null;
    clientId: string | null;
    clientName: string | null;
  };
}
