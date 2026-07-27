import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../auth/permissions.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ORG_PERMS, PERMISSIONS, PERMISSION_GROUPS, ROLE_PERMISSIONS } from "../auth/permissions";
import type { AuthUser } from "../auth/decorators/current-user.decorator";

// Normalise a user-typed website into a bare domain (for matching campaigns).
function cleanDomain(input: string): string {
  return (input ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

@Injectable()
export class AccessRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly notifications: NotificationsService,
  ) {}

  private orgOf(user: AuthUser): string {
    if (!user.orgId) throw new ForbiddenException("No organization for this account");
    return user.orgId;
  }

  private permLabel(key: string): string {
    for (const g of PERMISSION_GROUPS) for (const i of g.items) if (i.key === key) return i.label;
    return key;
  }

  private async targetLabel(type: string, target: string): Promise<string> {
    // For campaigns the target IS the website the user typed.
    return type === "project" ? target : this.permLabel(target);
  }

  // People the requester can send a request to: org members who can grant access
  // (i.e. hold the team-management permission). The requester picks from these.
  async reviewers(user: AuthUser): Promise<{ id: string; name: string | null; email: string }[]> {
    const orgId = this.orgOf(user);
    const users = await this.prisma.user.findMany({
      where: { orgId, isActive: true, id: { not: user.id } },
      select: { id: true, name: true, email: true, role: true, extraPermissions: true, customRole: { select: { permissions: true } } },
    });
    return users
      .filter((u) => {
        if (u.role === "ADMIN") return true;
        const base = u.customRole ? ((u.customRole.permissions as string[]) ?? []) : (ROLE_PERMISSIONS[u.role] ?? []);
        return new Set([...base, ...(u.extraPermissions ?? [])]).has(PERMISSIONS.TEAM_MANAGE);
      })
      .map((u) => ({ id: u.id, name: u.name, email: u.email }));
  }

  // What the user can request: the permissions they don't already have. (Campaign
  // requests are free-text — the user types a website — so no campaign list.)
  async options(user: AuthUser) {
    this.orgOf(user);
    const held = await this.perms.resolve(user);
    const meta = new Map<string, { label: string; group: string }>();
    for (const g of PERMISSION_GROUPS) for (const i of g.items) meta.set(i.key, { label: i.label, group: g.group });
    const permissions = ORG_PERMS.filter((p) => !held.has(p)).map((p) => ({
      key: p,
      label: meta.get(p)?.label ?? p,
      group: meta.get(p)?.group ?? "Other",
    }));
    return { permissions };
  }

  // Typeahead: only campaigns MATCHING what the user typed are surfaced (never a
  // full list). Requires >=2 chars so nothing shows until they type a website.
  async campaignSearch(user: AuthUser, q: string) {
    const orgId = this.orgOf(user);
    const query = (q ?? "").trim();
    if (query.length < 2) return [];
    const clean = cleanDomain(query) || query.toLowerCase();
    return this.prisma.project.findMany({
      where: { orgId, OR: [{ domain: { contains: clean, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }] },
      select: { name: true, domain: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
  }

  async create(user: AuthUser, dto: { type?: string; target?: string; note?: string; recipientIds?: string[] }) {
    const orgId = this.orgOf(user);
    const type = dto?.type;
    const target = (dto?.target ?? "").trim();
    if (type !== "project" && type !== "permission") throw new BadRequestException("Invalid request type.");
    if (!target) throw new BadRequestException("A target is required.");
    let finalTarget = target;
    if (type === "project") {
      finalTarget = cleanDomain(target);
      if (!finalTarget || finalTarget.length < 3 || !finalTarget.includes(".")) throw new BadRequestException("Enter a valid website (e.g. example.com).");
    } else if (!ORG_PERMS.includes(target as any)) {
      throw new BadRequestException("Unknown permission.");
    }

    // Only the reviewers the requester picked receive + can act on the request.
    const validReviewers = new Set((await this.reviewers(user)).map((r) => r.id));
    const recipientIds = [...new Set(dto?.recipientIds ?? [])].filter((id) => validReviewers.has(id));
    if (!recipientIds.length) throw new BadRequestException("Select at least one person to send this request to.");

    const dup = await this.prisma.accessRequest.findFirst({ where: { userId: user.id, type, target: finalTarget, status: "PENDING" } });
    if (dup) return dup;

    const req = await this.prisma.accessRequest.create({
      data: { orgId, userId: user.id, type, target: finalTarget.slice(0, 200), note: dto.note?.slice(0, 500) || null, recipientIds },
    });

    const label = await this.targetLabel(type, finalTarget);
    await this.notifications.notifyMany(recipientIds, "team", {
      title: "New access request",
      body: `${user.name || user.email} requested ${type === "project" ? "access to campaign" : "the permission"} "${label}".`,
      link: "/dashboard/settings/access",
    });
    return req;
  }

  async listMine(user: AuthUser) {
    const rows = await this.prisma.accessRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
    return Promise.all(rows.map(async (r) => ({ ...r, targetLabel: await this.targetLabel(r.type, r.target) })));
  }

  async listPending(user: AuthUser) {
    const orgId = this.orgOf(user);
    // Only requests this reviewer was chosen to receive.
    const rows = await this.prisma.accessRequest.findMany({ where: { orgId, status: "PENDING", recipientIds: { has: user.id } }, orderBy: { createdAt: "desc" } });
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        type: r.type,
        note: r.note,
        createdAt: r.createdAt,
        targetLabel: await this.targetLabel(r.type, r.target),
        requester: byId.get(r.userId) ?? { id: r.userId, name: null, email: "" },
      })),
    );
  }

  async decide(user: AuthUser, id: string, approve: boolean) {
    const orgId = this.orgOf(user);
    const req = await this.prisma.accessRequest.findFirst({ where: { id, orgId } });
    if (!req) throw new NotFoundException("Request not found");
    if (req.status !== "PENDING") throw new BadRequestException("This request has already been decided.");
    // Only a chosen recipient may decide (the requester picked who to ask).
    if (!req.recipientIds.includes(user.id)) throw new ForbiddenException("This request wasn't sent to you.");

    if (approve) {
      if (req.type === "project") {
        // Grant access to the org campaign(s) matching the requested website.
        const matches = await this.prisma.project.findMany({ where: { orgId, domain: cleanDomain(req.target) }, select: { id: true } });
        for (const p of matches) {
          await this.prisma.project.update({ where: { id: p.id }, data: { members: { connect: { id: req.userId } } } }).catch(() => {});
        }
      } else {
        const u = await this.prisma.user.findUnique({ where: { id: req.userId }, select: { extraPermissions: true } });
        if (!(u?.extraPermissions ?? []).includes(req.target)) {
          await this.prisma.user.update({ where: { id: req.userId }, data: { extraPermissions: { push: req.target } } });
        }
      }
    }
    await this.prisma.accessRequest.update({
      where: { id },
      data: { status: approve ? "APPROVED" : "DENIED", decidedById: user.id, decidedAt: new Date() },
    });
    const label = await this.targetLabel(req.type, req.target);
    void this.notifications.notify(req.userId, "team", {
      title: approve ? "Access request approved" : "Access request declined",
      body: `Your request for "${label}" was ${approve ? "approved" : "declined"}.`,
      link: "/dashboard",
    });
    return { ok: true };
  }
}
