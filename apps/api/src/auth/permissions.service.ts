import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE_PERMISSIONS, CLIENT_PERMS, type Permission } from "./permissions";
import type { AuthUser } from "./decorators/current-user.decorator";

/**
 * Resolves a user's effective permission set:
 *   SUPER_ADMIN     → every permission (platform-wide)
 *   custom role set → exactly the role's permission list
 *   built-in role   → ROLE_PERMISSIONS[ADMIN | MEMBER]
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(user: Pick<AuthUser, "id" | "role">): Promise<Set<Permission>> {
    // Super admin gets platform-only perms (no campaign access) — separation.
    if (user.role === "SUPER_ADMIN") return new Set(ROLE_PERMISSIONS.SUPER_ADMIN);
    // Client-portal users always get the fixed read-only client set (no custom roles).
    if (user.role === "CLIENT") return new Set(CLIENT_PERMS);

    const dbUser = await this.prisma.user
      .findUnique({ where: { id: user.id }, include: { customRole: true } })
      .catch(() => null);

    // Base set from the custom role, else the built-in role.
    const base: Permission[] = dbUser?.customRole
      ? ((dbUser.customRole.permissions as Permission[]) ?? [])
      : ROLE_PERMISSIONS[user.role] ?? ROLE_PERMISSIONS.MEMBER;
    // Plus any ad-hoc permissions granted directly to the user (approved requests).
    const extra = (dbUser?.extraPermissions as Permission[]) ?? [];
    return new Set([...base, ...extra]);
  }

  async list(user: Pick<AuthUser, "id" | "role">): Promise<Permission[]> {
    return [...(await this.resolve(user))];
  }
}
