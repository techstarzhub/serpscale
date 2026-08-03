import { Controller, Get, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { assertProjectAccess } from "../projects/access";
import { AuditService } from "../auth/audit.service";
import { FeaturesGuard } from "../entitlements/features.guard";
import { RequireFeature } from "../entitlements/require-feature.decorator";
import { AutofixService } from "./autofix.service";

@UseGuards(JwtAuthGuard, PermissionsGuard, FeaturesGuard)
@RequirePermissions(PERMISSIONS.AUDIT_RUN)
@RequireFeature("audit")
@Controller("autofix")
export class AutofixController {
  constructor(
    private readonly autofix: AutofixService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertCrawlAccess(user: AuthUser, crawlId: string) {
    const crawl = await this.prisma.crawl.findUnique({ where: { id: crawlId } });
    if (!crawl) throw new NotFoundException("Crawl not found");
    const project = await this.prisma.project.findUnique({ where: { id: crawl.projectId } });
    if (!project) throw new NotFoundException("Project not found");
    assertProjectAccess(user, project);
  }

  // Preview which files the auto-fix would create/append + what stays manual.
  @Get(":crawlId/plan")
  async plan(@CurrentUser() user: AuthUser, @Param("crawlId") crawlId: string) {
    await this.assertCrawlAccess(user, crawlId);
    return this.autofix.plan(crawlId);
  }

  // Open a pull request with the auto-fixable artifacts against the campaign's
  // connected repo (no token in the request — it comes from the stored connection).
  @Post(":crawlId/pr")
  async openPr(@CurrentUser() user: AuthUser, @Param("crawlId") crawlId: string) {
    await this.assertCrawlAccess(user, crawlId);
    const res = await this.autofix.createPullRequest(crawlId);
    await this.audit.log(user, "autofix.pr.open", { target: crawlId });
    return res;
  }
}
