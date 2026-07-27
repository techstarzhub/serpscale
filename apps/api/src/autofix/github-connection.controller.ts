import { Body, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { assertProjectAccess } from "../projects/access";
import { GithubConnectionService, type ConnectInput } from "./github-connection.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
@Controller("projects/:projectId/github")
export class GithubConnectionController {
  constructor(
    private readonly connections: GithubConnectionService,
    private readonly prisma: PrismaService,
  ) {}

  private async assertAccess(user: AuthUser, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException("Project not found");
    assertProjectAccess(user, project);
  }

  @Get()
  async status(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    await this.assertAccess(user, projectId);
    return this.connections.status(projectId);
  }

  @Post()
  async connect(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Body() body: ConnectInput) {
    await this.assertAccess(user, projectId);
    return this.connections.connect(projectId, body);
  }

  @Delete()
  async disconnect(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    await this.assertAccess(user, projectId);
    return this.connections.disconnect(projectId);
  }
}
