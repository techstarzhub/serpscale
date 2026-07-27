import { ForbiddenException } from "@nestjs/common";
import type { Project } from "@prisma/client";
import type { AuthUser } from "../auth/decorators/current-user.decorator";

// Shared project access rule so both ProjectsService and the crawl endpoints
// enforce it without a circular module dependency.
export function assertProjectAccess(user: AuthUser, project: Project) {
  // Super admins manage the platform, not campaigns — never grant campaign access.
  if (user.role === "SUPER_ADMIN") throw new ForbiddenException("Super admins do not manage campaigns.");
  const ok =
    (!!user.orgId && project.orgId === user.orgId) ||
    (!user.orgId && project.createdById === user.id);
  if (!ok) throw new ForbiddenException("You do not have access to this project.");
}
