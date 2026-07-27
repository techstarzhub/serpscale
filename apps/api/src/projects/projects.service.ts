import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Project } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../auth/permissions.service";
import { PERMISSIONS } from "../auth/permissions";
import type { AuthUser } from "../auth/decorators/current-user.decorator";

function cleanDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
  ) {}

  async list(user: AuthUser) {
    // Super admin manages the platform, not campaigns.
    if (user.role === "SUPER_ADMIN") return [];
    // Client-portal user: only campaigns of the client they belong to.
    if (user.role === "CLIENT") {
      return this.prisma.project.findMany({
        where: { clients: { some: { members: { some: { id: user.id } } } } },
        orderBy: { createdAt: "desc" },
      });
    }
    if (!user.orgId) return this.prisma.project.findMany({ where: { createdById: user.id }, orderBy: { createdAt: "desc" } });
    const p = await this.perms.resolve(user);
    // "View all projects" → every campaign in the org.
    if (p.has(PERMISSIONS.PROJECTS_VIEW)) {
      return this.prisma.project.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "desc" } });
    }
    // "View assigned projects" → only the campaigns assigned to this member.
    if (p.has(PERMISSIONS.PROJECTS_VIEW_ASSIGNED)) {
      return this.prisma.project.findMany({
        where: { orgId: user.orgId, members: { some: { id: user.id } } },
        orderBy: { createdAt: "desc" },
      });
    }
    return [];
  }

  async get(user: AuthUser, id: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException("Project not found");
    await this.assertAccess(user, project);
    return project;
  }

  // ---- Campaign member assignment (who can access this campaign) ----

  // Assigned members + the org members who can still be added, for the header picker.
  async campaignMembers(user: AuthUser, id: string) {
    const project = await this.get(user, id); // enforces access
    if (!project.orgId) return { assigned: [], assignable: [] };
    const members = await this.prisma.user.findMany({
      where: { orgId: project.orgId, isActive: true, role: "MEMBER" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, name: true, email: true, role: true,
        assignedProjects: { where: { id }, select: { id: true } },
      },
    });
    const strip = (u: (typeof members)[number]) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
    return {
      assigned: members.filter((u) => u.assignedProjects.length).map(strip),
      assignable: members.filter((u) => !u.assignedProjects.length).map(strip),
    };
  }

  async assignMember(user: AuthUser, id: string, memberId: string) {
    const project = await this.get(user, id);
    const member = await this.prisma.user.findFirst({ where: { id: memberId, orgId: project.orgId } });
    if (!member) throw new NotFoundException("Member not found in this organization");
    await this.prisma.project.update({ where: { id }, data: { members: { connect: { id: memberId } } } });
    return { ok: true };
  }

  async unassignMember(user: AuthUser, id: string, memberId: string) {
    await this.get(user, id);
    await this.prisma.project.update({ where: { id }, data: { members: { disconnect: { id: memberId } } } });
    return { ok: true };
  }

  // ---- Campaign <-> Client linking (attach a client to this campaign) ----

  async campaignClients(user: AuthUser, id: string) {
    const project = await this.get(user, id);
    const orgId = project.orgId;
    if (!orgId) return { assigned: [], assignable: [] };
    const clients = await this.prisma.client.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, company: true, type: true, projects: { where: { id }, select: { id: true } } },
    });
    const strip = (c: (typeof clients)[number]) => ({ id: c.id, name: c.name, company: c.company, type: c.type });
    return {
      assigned: clients.filter((c) => c.projects.length).map(strip),
      assignable: clients.filter((c) => !c.projects.length).map(strip),
    };
  }

  async attachClient(user: AuthUser, id: string, clientId: string) {
    const project = await this.get(user, id);
    const orgId = project.orgId;
    if (!orgId) throw new BadRequestException("This campaign has no organization.");
    const client = await this.prisma.client.findFirst({ where: { id: clientId, orgId } });
    if (!client) throw new NotFoundException("Client not found in this organization");
    await this.prisma.project.update({ where: { id }, data: { clients: { connect: { id: clientId } } } });
    return { ok: true };
  }

  async detachClient(user: AuthUser, id: string, clientId: string) {
    await this.get(user, id);
    await this.prisma.project.update({ where: { id }, data: { clients: { disconnect: { id: clientId } } } });
    return { ok: true };
  }

  async create(user: AuthUser, input: { name: string; domain: string }) {
    const domain = cleanDomain(input.domain);
    if (!domain || domain.length < 3) throw new BadRequestException("A valid domain is required");
    // Enforce the org's plan limit on number of projects.
    if (user.orgId) {
      const sub = await this.prisma.subscription.findUnique({ where: { orgId: user.orgId }, include: { plan: true } });
      const limits: any = { ...((sub?.plan?.limits as any) ?? {}), ...((sub?.limitOverrides as any) ?? {}) };
      const cap = Number(limits?.projects);
      if (cap && cap > 0) {
        const count = await this.prisma.project.count({ where: { orgId: user.orgId } });
        if (count >= cap) throw new ForbiddenException(`Your plan allows ${cap} project${cap === 1 ? "" : "s"}. Upgrade to add more.`);
      }
    }
    return this.prisma.project.create({
      data: { name: input.name.trim(), domain, orgId: user.orgId ?? null, createdById: user.id },
    });
  }

  async update(user: AuthUser, id: string, input: { name?: string; domain?: string }) {
    await this.get(user, id);
    return this.prisma.project.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? undefined,
        domain: input.domain ? cleanDomain(input.domain) : undefined,
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.prisma.project.delete({ where: { id } });
    return { ok: true };
  }

  async assertAccess(user: AuthUser, project: Project) {
    // Super admins never touch campaigns.
    if (user.role === "SUPER_ADMIN") throw new ForbiddenException("Super admins do not manage campaigns.");
    // Client-portal user: only campaigns linked to their client.
    if (user.role === "CLIENT") {
      const ok = await this.prisma.project.findFirst({
        where: { id: project.id, clients: { some: { members: { some: { id: user.id } } } } },
        select: { id: true },
      });
      if (ok) return;
      throw new ForbiddenException("You do not have access to this campaign.");
    }
    // Org isolation — must be the same organization.
    if (user.orgId) {
      if (project.orgId !== user.orgId) throw new ForbiddenException("You do not have access to this project.");
    } else {
      if (project.createdById !== user.id) throw new ForbiddenException("You do not have access to this project.");
      return;
    }
    const p = await this.perms.resolve(user);
    // "View all projects" → access to any campaign in the org.
    if (p.has(PERMISSIONS.PROJECTS_VIEW)) return;
    // "View assigned projects" → only campaigns explicitly assigned to this member.
    if (p.has(PERMISSIONS.PROJECTS_VIEW_ASSIGNED)) {
      const assigned = await this.prisma.project.findFirst({
        where: { id: project.id, members: { some: { id: user.id } } },
        select: { id: true },
      });
      if (assigned) return;
      throw new ForbiddenException("You have not been given access to this campaign.");
    }
    throw new ForbiddenException("You do not have permission to view campaigns.");
  }
}
