import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { assertProjectAccess } from "../projects/access";
import { FeaturesGuard } from "../entitlements/features.guard";
import { RequireFeature } from "../entitlements/require-feature.decorator";
import { CrawlService } from "./crawl.service";

@UseGuards(JwtAuthGuard, PermissionsGuard, FeaturesGuard)
@RequirePermissions(PERMISSIONS.AUDIT_VIEW)
@RequireFeature("audit")
@Controller("crawls")
export class CrawlsController {
  constructor(
    private readonly crawls: CrawlService,
    private readonly prisma: PrismaService,
  ) {}

  private async loadWithAccess(user: AuthUser, crawlId: string) {
    const crawl = await this.crawls.getCrawl(crawlId);
    if (!crawl) throw new NotFoundException("Crawl not found");
    const project = await this.prisma.project.findUnique({ where: { id: crawl.projectId } });
    if (!project) throw new NotFoundException("Project not found");
    assertProjectAccess(user, project);
    return crawl;
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.loadWithAccess(user, id);
  }

  @Get(":id/pages")
  async pages(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
    @Query("issuesOnly") issuesOnly?: string,
    @Query("q") q?: string,
    @Query("code") code?: string,
  ) {
    await this.loadWithAccess(user, id);
    return this.crawls.pages(id, {
      skip: Number(skip) || 0,
      take: Number(take) || 50,
      issuesOnly: issuesOnly === "true",
      q: q || undefined,
      code: code || undefined,
    });
  }
}
