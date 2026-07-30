import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import type { Project } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../auth/permissions.service";
import { StorageService } from "../storage/storage.service";
import { PERMISSIONS } from "../auth/permissions";
import type { AuthUser } from "../auth/decorators/current-user.decorator";

// Portal members of a client (owner first), for campaign team display.
const CLIENT_MEMBER_SELECT = {
  where: { isActive: true },
  select: { id: true, name: true, email: true, avatarKey: true, clientOwner: true },
  orderBy: { clientOwner: "desc" as const },
} as const;

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
    private readonly storage: StorageService,
  ) {}

  async list(user: AuthUser) {
    // Super admin manages the platform, not campaigns.
    if (user.role === "SUPER_ADMIN") return [];
    // Client-portal user: campaigns of the client they belong to. An owner (or a
    // member the agency granted "all campaigns") sees every campaign of that
    // client; a restricted member sees only the campaigns assigned to them.
    if (user.role === "CLIENT") {
      const me = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { clientOwner: true, clientAllCampaigns: true },
      });
      const clientScope = { clients: { some: { members: { some: { id: user.id } } } } };
      if (me?.clientOwner || me?.clientAllCampaigns) {
        return this.prisma.project.findMany({ where: clientScope, orderBy: { createdAt: "desc" } });
      }
      return this.prisma.project.findMany({
        where: { AND: [clientScope, { members: { some: { id: user.id } } }] },
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
    const [members, admins] = await Promise.all([
      this.prisma.user.findMany({
        where: { orgId: project.orgId, isActive: true, role: "MEMBER" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, name: true, email: true, role: true, avatarKey: true,
          customRole: { select: { name: true } },
          assignedProjects: { where: { id }, select: { id: true } },
        },
      }),
      // Org admins have access to every campaign — always shown on the team.
      this.prisma.user.findMany({
        where: { orgId: project.orgId, isActive: true, role: "ADMIN" },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, role: true, avatarKey: true, customRole: { select: { name: true } } },
      }),
    ]);
    return {
      admins: await Promise.all(admins.map((u) => this.stripMember(u))),
      assigned: await Promise.all(members.filter((u) => u.assignedProjects.length).map((u) => this.stripMember(u))),
      assignable: await Promise.all(members.filter((u) => !u.assignedProjects.length).map((u) => this.stripMember(u))),
    };
  }

  // A team member for display — includes the actual assigned role name (a custom
  // role when one is set, otherwise the base role).
  private async stripMember(u: { id: string; name: string | null; email: string; role: string; avatarKey: string | null; customRole?: { name: string } | null }) {
    const roleName = u.customRole?.name || u.role.charAt(0) + u.role.slice(1).toLowerCase();
    return { id: u.id, name: u.name, email: u.email, role: u.role, roleName, avatarUrl: u.avatarKey ? await this.storage.signedUrl(u.avatarKey) : null };
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
      select: { id: true, name: true, company: true, type: true, branding: true, members: CLIENT_MEMBER_SELECT, projects: { where: { id }, select: { id: true } } },
    });
    return {
      // Assigned clients carry their portal members (for the team view); the
      // assignable picker only needs the logo.
      assigned: await Promise.all(clients.filter((c) => c.projects.length).map((c) => this.clientWithMembers(c))),
      assignable: await Promise.all(clients.filter((c) => !c.projects.length).map((c) => this.clientAvatar(c))),
    };
  }

  // Read-only team view: the members + clients ASSIGNED to this campaign, with
  // avatars/logos. Available to anyone with campaign access (incl. client portal
  // users) — so a client can see who works on their campaign.
  async campaignTeam(user: AuthUser, id: string) {
    const project = await this.get(user, id); // enforces campaign access
    if (!project.orgId) return { admins: [], members: [], clients: [] };
    const [members, admins, clients] = await Promise.all([
      this.prisma.user.findMany({
        where: { orgId: project.orgId, isActive: true, role: "MEMBER", assignedProjects: { some: { id } } },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, role: true, avatarKey: true, customRole: { select: { name: true } } },
      }),
      this.prisma.user.findMany({
        where: { orgId: project.orgId, isActive: true, role: "ADMIN" },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, role: true, avatarKey: true, customRole: { select: { name: true } } },
      }),
      this.prisma.client.findMany({
        where: { orgId: project.orgId, projects: { some: { id } } },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, company: true, type: true, branding: true, members: CLIENT_MEMBER_SELECT },
      }),
    ]);
    return {
      admins: await Promise.all(admins.map((u) => this.stripMember(u))),
      members: await Promise.all(members.map((u) => this.stripMember(u))),
      clients: await Promise.all(clients.map((c) => this.clientWithMembers(c))),
    };
  }

  // A client's display image: its branding logo, else its owner's profile picture.
  private async clientAvatar(c: { id: string; name: string; company: string | null; type: string; branding: any; members: { avatarKey: string | null; clientOwner?: boolean }[] }) {
    const branding = (c.branding as any) ?? {};
    const logo = branding.logoDataUrl ?? null;
    const owner = c.members?.find((m) => m.clientOwner) ?? c.members?.[0];
    const ownerKey = owner?.avatarKey ?? null;
    const img = logo ?? (ownerKey ? await this.storage.signedUrl(ownerKey) : null);
    // An agency's display name is its white-label brand name, not the owner's.
    const name = c.type === "AGENCY" ? branding.agencyName || c.name : c.name;
    return { id: c.id, name, company: c.company, type: c.type, logo: img };
  }

  // Same as clientAvatar, but also returns the client's own portal members (owner
  // first) with signed avatars — so the campaign team view can show an agency /
  // client together with its people.
  private async clientWithMembers(c: {
    id: string;
    name: string;
    company: string | null;
    type: string;
    branding: any;
    members: { id: string; name: string | null; email: string; avatarKey: string | null; clientOwner: boolean }[];
  }) {
    const base = await this.clientAvatar(c);
    const members = await Promise.all(
      (c.members ?? []).map(async (m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        owner: m.clientOwner,
        avatarUrl: m.avatarKey ? await this.storage.signedUrl(m.avatarKey) : null,
      })),
    );
    return { ...base, members };
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

  async create(user: AuthUser, input: { name: string; domain: string; enabledTabs?: string[] }) {
    const domain = cleanDomain(input.domain);
    if (!domain || domain.length < 3) throw new BadRequestException("A valid domain is required");
    // Keep only real dashboard keys; drop anything unknown the client may send.
    const VALID_TABS = ["overview", "copilot", "keywords", "content", "ranks", "competitors", "traffic", "backlinks", "domain", "ai", "audit"];
    const enabledTabs = Array.isArray(input.enabledTabs)
      ? [...new Set(input.enabledTabs.filter((t) => VALID_TABS.includes(t)))]
      : [];
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
      data: { name: input.name.trim(), domain, enabledTabs, orgId: user.orgId ?? null, createdById: user.id },
    });
  }

  async update(user: AuthUser, id: string, input: { name?: string; domain?: string; enabledTabs?: string[] }) {
    await this.get(user, id);
    // Keep only real dashboard keys; drop anything unknown the client may send.
    const VALID_TABS = ["overview", "copilot", "keywords", "content", "ranks", "competitors", "traffic", "backlinks", "domain", "ai", "audit"];
    const enabledTabs = Array.isArray(input.enabledTabs)
      ? [...new Set(input.enabledTabs.filter((t) => VALID_TABS.includes(t)))]
      : undefined;
    return this.prisma.project.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? undefined,
        domain: input.domain ? cleanDomain(input.domain) : undefined,
        enabledTabs,
      },
    });
  }

  // Archive / unarchive a campaign. Archived campaigns stay fully intact and
  // accessible — they're just filtered out of the sidebar's default "Active" tab.
  async setArchived(user: AuthUser, id: string, archived: boolean) {
    await this.get(user, id); // enforces access
    return this.prisma.project.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.prisma.project.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Public read-only share link -------------------------------------------

  // Generate (once) the campaign's public view key. Re-calling returns the same
  // key — the link is stable until explicitly revoked. Requires campaign access.
  async generateShare(user: AuthUser, id: string) {
    await this.get(user, id);
    const existing = await this.prisma.project.findUnique({ where: { id }, select: { shareKey: true, sharedAt: true } });
    if (existing?.shareKey) return { shareKey: existing.shareKey, sharedAt: existing.sharedAt };
    // 24-char URL-safe random token; retry on the (astronomically rare) collision.
    let shareKey = "";
    for (let i = 0; i < 5; i++) {
      shareKey = randomBytes(18).toString("base64url");
      const clash = await this.prisma.project.findUnique({ where: { shareKey }, select: { id: true } });
      if (!clash) break;
    }
    const updated = await this.prisma.project.update({ where: { id }, data: { shareKey, sharedAt: new Date() } });
    return { shareKey: updated.shareKey, sharedAt: updated.sharedAt };
  }

  // Disable the public link — anyone holding the old key loses access immediately.
  async revokeShare(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.prisma.project.update({ where: { id }, data: { shareKey: null, sharedAt: null } });
    return { ok: true };
  }

  // Resolve a campaign from its public share key (no auth). Used by the public,
  // read-only controller. Throws if the key is unknown or sharing was disabled.
  async getByShareKey(key: string): Promise<Project> {
    if (!key) throw new NotFoundException("This share link is invalid or has been disabled.");
    const project = await this.prisma.project.findUnique({ where: { shareKey: key } });
    if (!project || !project.shareKey) throw new NotFoundException("This share link is invalid or has been disabled.");
    return project;
  }

  async assertAccess(user: AuthUser, project: Project) {
    // Super admins never touch campaigns.
    if (user.role === "SUPER_ADMIN") throw new ForbiddenException("Super admins do not manage campaigns.");
    // Client-portal user: campaign must be linked to their client, and — unless
    // they're the owner or granted "all campaigns" — assigned to them.
    if (user.role === "CLIENT") {
      const linked = await this.prisma.project.findFirst({
        where: { id: project.id, clients: { some: { members: { some: { id: user.id } } } } },
        select: { id: true },
      });
      if (!linked) throw new ForbiddenException("You do not have access to this campaign.");
      const me = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { clientOwner: true, clientAllCampaigns: true },
      });
      if (me?.clientOwner || me?.clientAllCampaigns) return;
      const assigned = await this.prisma.project.findFirst({
        where: { id: project.id, members: { some: { id: user.id } } },
        select: { id: true },
      });
      if (assigned) return;
      throw new ForbiddenException("You have not been given access to this campaign.");
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
