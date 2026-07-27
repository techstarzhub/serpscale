import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsService } from "../permissions.service";
import { PERMISSIONS_KEY } from "../decorators/require-permissions.decorator";
import type { Permission } from "../permissions";

/** Enforces @RequirePermissions(...). Assumes JwtAuthGuard has already run. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException("Not authenticated");

    const held = await this.permissions.resolve(user);
    const ok = required.every((p) => held.has(p));
    if (!ok) throw new ForbiddenException("You do not have permission to do this");
    return true;
  }
}
