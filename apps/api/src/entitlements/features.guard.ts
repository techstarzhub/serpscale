import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FEATURE_KEY } from "./require-feature.decorator";
import { EntitlementsService } from "./entitlements.service";

/** Enforces @RequireFeature(key). Assumes JwtAuthGuard has already run so
 *  request.user (with orgId) is set. Super admins bypass plan gating. */
@Injectable()
export class FeaturesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!key) return true;

    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException("Not authenticated");
    if (user.role === "SUPER_ADMIN") return true; // platform owner sees everything

    await this.entitlements.assertFeature(user.orgId, key);
    return true;
  }
}
