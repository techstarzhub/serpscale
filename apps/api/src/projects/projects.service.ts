import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import type { Project } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../auth/permissions.service";
import { StorageService } from "../storage/storage.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { NotificationsService } from "../notifications/notifications.service";
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

// Lightweight guard rejecting obviously-internal targets at project create/update
// time (localhost, private/loopback/link-local IP literals, *.local/.internal).
// Full DNS-based SSRF protection happens at fetch time in the crawler; this stops
// the internal target from ever being stored as a crawlable domain.
function isInternalDomain(domain: string): boolean {
  const host = domain.replace(/:\d+$/, ""); // strip any port
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  return false;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly storage: StorageService,
    private readonly entitlements: EntitlementsService,
    // NotificationsModule is @Global, so no explicit import is needed here.
    private readonly notifications: NotificationsService,
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
    // "View assigned projects" → campaigns assigned to this member, PLUS any they
    // created themselves (a creator must always see their own campaign even with
    // only assigned-scope, otherwise a new campaign they add vanishes).
    if (p.has(PERMISSIONS.PROJECTS_VIEW_ASSIGNED)) {
      return this.prisma.project.findMany({
        where: { orgId: user.orgId, OR: [{ members: { some: { id: user.id } } }, { createdById: user.id }] },
        orderBy: { createdAt: "desc" },
      });
    }
    // No view permission, but a creator can still see the campaigns they made.
    return this.prisma.project.findMany({
      where: { orgId: user.orgId, createdById: user.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(user: AuthUser, id: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException("Project not found");
    await this.assertAccess(user, project);
    return project;
  }

  // Lightweight campaign summary for the sidebar hover card: who created it, when,
  // and the members explicitly assigned to it (with signed avatars). Fetched
  // lazily on hover so the main project list stays cheap.
  async meta(user: AuthUser, id: string) {
    const project = await this.get(user, id); // enforces campaign access
    const [creator, members] = await Promise.all([
      project.createdById
        ? this.prisma.user.findUnique({ where: { id: project.createdById }, select: { id: true, name: true, email: true, avatarKey: true } })
        : Promise.resolve(null),
      this.prisma.user.findMany({
        where: { assignedProjects: { some: { id } }, isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, role: true, avatarKey: true, customRole: { select: { name: true } } },
      }),
    ]);
    return {
      createdAt: project.createdAt,
      createdBy: creator
        ? { id: creator.id, name: creator.name, email: creator.email, avatarUrl: creator.avatarKey ? await this.storage.signedUrl(creator.avatarKey) : null }
        : null,
      members: await Promise.all(members.map((u) => this.stripMember(u))),
    };
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
    // Tell the member they've been given campaign access (matches the team-page
    // bulk-assign notification, so both assignment paths behave the same).
    void this.notifications.notify(memberId, "team", {
      title: "You've been added to a campaign",
      body: `You now have access to "${project.name}" (${project.domain}).`,
      link: `/dashboard/projects/${id}`,
    });
    return { ok: true };
  }

  async unassignMember(user: AuthUser, id: string, memberId: string) {
    const project = await this.get(user, id);
    await this.prisma.project.update({ where: { id }, data: { members: { disconnect: { id: memberId } } } });
    void this.notifications.notify(memberId, "team", {
      title: "Your campaign access changed",
      body: `You no longer have access to "${project.name}".`,
      link: "/dashboard",
    });
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
    // Let the client's portal owner(s) know a new campaign is now visible to them.
    const owners = await this.prisma.user
      .findMany({ where: { clientId, isActive: true, clientOwner: true }, select: { id: true } })
      .catch(() => [] as { id: string }[]);
    if (owners.length) {
      void this.notifications.notifyMany(owners.map((o) => o.id), "team", {
        title: "A new campaign was shared with you",
        body: `You can now view the "${project.name}" campaign in your reporting portal.`,
        link: `/dashboard/projects/${id}`,
      });
    }
    return { ok: true };
  }

  async detachClient(user: AuthUser, id: string, clientId: string) {
    const project = await this.get(user, id);
    await this.prisma.project.update({ where: { id }, data: { clients: { disconnect: { id: clientId } } } });
    // Let the client's portal owner(s) know a campaign was removed from their portal.
    const owners = await this.prisma.user
      .findMany({ where: { clientId, isActive: true, clientOwner: true }, select: { id: true } })
      .catch(() => [] as { id: string }[]);
    if (owners.length) {
      void this.notifications.notifyMany(owners.map((o) => o.id), "team", {
        title: "A campaign was removed from your portal",
        body: `The "${project.name}" campaign is no longer available in your reporting portal.`,
        link: "/dashboard",
      });
    }
    return { ok: true };
  }

  // Keep a campaign's chosen Google account only if that email is actually a
  // connected Google integration for this owner; otherwise fall back to null
  // (auto-detect by domain). Stops a bogus/stale account from being persisted.
  private async resolveGoogleAccount(user: AuthUser, email?: string | null): Promise<string | null> {
    const wanted = (email ?? "").trim();
    if (!wanted) return null;
    const ownerKey = user.orgId ?? `user:${user.id}`;
    const match = await this.prisma.integration.findFirst({
      where: { ownerKey, provider: "google", accountEmail: wanted },
      select: { accountEmail: true },
    });
    return match?.accountEmail ?? null;
  }

  async create(user: AuthUser, input: { name: string; domain: string; enabledTabs?: string[]; googleAccountEmail?: string; gscAccountEmail?: string; gaAccountEmail?: string; gmbAccountEmail?: string }) {
    const domain = cleanDomain(input.domain);
    if (!domain || domain.length < 3) throw new BadRequestException("A valid domain is required");
    if (isInternalDomain(domain)) throw new BadRequestException("That domain is not allowed.");
    // Keep only real dashboard keys; drop anything unknown the client may send.
    const VALID_TABS = ["overview", "copilot", "keywords", "content", "ranks", "competitors", "traffic", "backlinks", "domain", "ai", "audit"];
    const enabledTabs = Array.isArray(input.enabledTabs)
      ? [...new Set(input.enabledTabs.filter((t) => VALID_TABS.includes(t)))]
      : [];
    // The default account, plus each optional per-service override — all verified
    // against the owner's real connected accounts (bogus emails become null).
    const [googleAccountEmail, gscAccountEmail, gaAccountEmail, gmbAccountEmail] = await Promise.all([
      this.resolveGoogleAccount(user, input.googleAccountEmail),
      this.resolveGoogleAccount(user, input.gscAccountEmail),
      this.resolveGoogleAccount(user, input.gaAccountEmail),
      this.resolveGoogleAccount(user, input.gmbAccountEmail),
    ]);
    const orgId = user.orgId ?? null;
    const data = { name: input.name.trim(), domain, enabledTabs, googleAccountEmail, gscAccountEmail, gaAccountEmail, gmbAccountEmail, orgId, createdById: user.id };
    let project: Project;
    if (orgId) {
      const ent = await this.entitlements.forOrg(orgId);
      // A lapsed org (a subscription exists but isn't in good standing — canceled /
      // past-due / trial-expired) is locked out of creating new projects, matching
      // the org-wide access pause. A fresh org with no subscription yet is left
      // alone (status null) so onboarding isn't broken.
      if (ent.status && !ent.active) throw new ForbiddenException("Your subscription is inactive. Please renew to add projects.");
      // Enforce the plan's project cap. A cap of 0 means "no projects on this
      // plan" and must block; an absent/non-numeric cap means unlimited.
      const rawCap = (ent.limits as any)?.projects;
      const cap = Number(rawCap);
      if (rawCap != null && Number.isFinite(cap) && cap >= 0) {
        // Count + create in ONE transaction under a per-org advisory lock so two
        // concurrent creates can't both pass the cap check (TOCTOU race).
        project = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`;
          const count = await tx.project.count({ where: { orgId } });
          if (count >= cap) throw new ForbiddenException(`Your plan allows ${cap} project${cap === 1 ? "" : "s"}. Upgrade to add more.`);
          return tx.project.create({ data });
        });
      } else {
        project = await this.prisma.project.create({ data });
      }
    } else {
      project = await this.prisma.project.create({ data });
    }
    // Keep the org's other admins in the loop when anyone (a member, or another
    // admin) adds a campaign — otherwise a campaign can appear with no admin ever
    // being told. Fire-and-forget so the create response isn't delayed.
    void this.notifyProjectCreated(user, project);
    return project;
  }

  /** Notify the org's OTHER active admins that a new campaign was created. */
  private async notifyProjectCreated(user: AuthUser, project: Project) {
    if (!project.orgId) return; // solo account — no admins to tell
    const admins = await this.prisma.user
      .findMany({ where: { orgId: project.orgId, role: "ADMIN", isActive: true, id: { not: user.id } }, select: { id: true } })
      .catch(() => [] as { id: string }[]);
    if (!admins.length) return;
    await this.notifications.notifyMany(admins.map((a) => a.id), "team", {
      title: "New campaign created",
      body: `${user.name || user.email} created the campaign "${project.name}" (${project.domain}).`,
      link: `/dashboard/projects/${project.id}`,
    });
  }

  async update(user: AuthUser, id: string, input: { name?: string; domain?: string; enabledTabs?: string[]; googleAccountEmail?: string; gscAccountEmail?: string; gaAccountEmail?: string; gmbAccountEmail?: string }) {
    await this.get(user, id);
    // Keep only real dashboard keys; drop anything unknown the client may send.
    const VALID_TABS = ["overview", "copilot", "keywords", "content", "ranks", "competitors", "traffic", "backlinks", "domain", "ai", "audit"];
    const enabledTabs = Array.isArray(input.enabledTabs)
      ? [...new Set(input.enabledTabs.filter((t) => VALID_TABS.includes(t)))]
      : undefined;
    let domain: string | undefined = undefined;
    if (input.domain) {
      domain = cleanDomain(input.domain);
      if (!domain || domain.length < 3 || isInternalDomain(domain)) throw new BadRequestException("A valid, public domain is required");
    }
    // Resolve each account field only when the caller explicitly sent it. An empty
    // string clears it (null); an unconnected email also resolves to null.
    const resolveIfSent = (v: string | undefined) => (v !== undefined ? this.resolveGoogleAccount(user, v) : Promise.resolve(undefined));
    const [googleAccountEmail, gscAccountEmail, gaAccountEmail, gmbAccountEmail] = await Promise.all([
      resolveIfSent(input.googleAccountEmail),
      resolveIfSent(input.gscAccountEmail),
      resolveIfSent(input.gaAccountEmail),
      resolveIfSent(input.gmbAccountEmail),
    ]);
    // Any account/domain change must drop the cached Google data below.
    const changingSource =
      domain !== undefined ||
      input.googleAccountEmail !== undefined ||
      input.gscAccountEmail !== undefined ||
      input.gaAccountEmail !== undefined ||
      input.gmbAccountEmail !== undefined;
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? undefined,
        domain,
        enabledTabs,
        googleAccountEmail,
        gscAccountEmail,
        gaAccountEmail,
        gmbAccountEmail,
      },
    });
    // The GSC/GA/GMB caches are keyed per project, so a change to the domain or
    // chosen account would otherwise keep serving the old account's data until
    // TTL. Drop them so the dashboards refetch from the new source.
    if (changingSource) {
      await this.prisma.dataCache.deleteMany({
        where: { OR: [{ key: { startsWith: `gsc:${id}:` } }, { key: { startsWith: `ga:${id}:` } }, { key: { startsWith: `gmb:${id}` } }] },
      }).catch(() => {});
    }
    return project;
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
    // A shared client dashboard is only live while the agency's subscription is
    // active — if their payment lapses (any reason), the public link stops too.
    const ent = await this.entitlements.forOrg(project.orgId);
    if (!ent.active) throw new ForbiddenException("This dashboard is temporarily unavailable. Please contact the site owner.");
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
    // You can always access a campaign you created — even with only assigned-scope
    // (or none) — so a campaign you just added never becomes invisible to you.
    if (project.createdById === user.id) return;
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
