import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "./decorators/current-user.decorator";

/** Records an immutable activity trail. Never throws into the request path. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

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
}
