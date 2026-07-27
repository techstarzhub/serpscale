import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Platform-owner (super admin) operations — spans every tenant. */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Platform overview ----
  async overview() {
    const [orgs, users, activeSubs, plans, txns] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.user.count(),
      this.prisma.subscription.count({ where: { status: "ACTIVE" } }),
      this.prisma.plan.findMany({ include: { _count: { select: { subscriptions: true } } } }),
      this.prisma.transaction.findMany({ where: { status: "succeeded" } }),
    ]);
    const mrrCents = plans.reduce((sum, p) => {
      const monthly = p.interval === "year" ? Math.round(p.priceCents / 12) : p.priceCents;
      return sum + monthly * (p as any)._count.subscriptions;
    }, 0);
    const revenueCents = txns.reduce((s, t) => s + t.amountCents, 0);
    return { orgs, users, activeSubs, plans: plans.length, mrrCents, revenueCents };
  }

  // ---- Plans (dynamic, super-admin authored) ----
  listPlans() {
    return this.prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: true } } } });
  }

  async createPlan(dto: any) {
    if (!dto?.name?.trim()) throw new BadRequestException("Plan name required");
    const slug = dto.slug?.trim() || slugify(dto.name);
    if (await this.prisma.plan.findUnique({ where: { slug } })) throw new BadRequestException("A plan with this slug already exists");
    return this.prisma.plan.create({
      data: {
        name: dto.name.trim(),
        slug,
        priceCents: Number(dto.priceCents) || 0,
        currency: dto.currency || "usd",
        interval: dto.interval === "year" ? "year" : "month",
        limits: dto.limits ?? {},
        features: dto.features ?? undefined,
        isActive: dto.isActive ?? true,
        isPublic: dto.isPublic ?? true,
        sortOrder: Number(dto.sortOrder) || 0,
      },
    });
  }

  async updatePlan(id: string, dto: any) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException("Plan not found");
    return this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? undefined,
        priceCents: dto.priceCents != null ? Number(dto.priceCents) : undefined,
        currency: dto.currency ?? undefined,
        interval: dto.interval ? (dto.interval === "year" ? "year" : "month") : undefined,
        limits: dto.limits ?? undefined,
        features: dto.features ?? undefined,
        isActive: dto.isActive ?? undefined,
        isPublic: dto.isPublic ?? undefined,
        sortOrder: dto.sortOrder != null ? Number(dto.sortOrder) : undefined,
      },
    });
  }

  async deletePlan(id: string) {
    const subs = await this.prisma.subscription.count({ where: { planId: id } });
    if (subs > 0) {
      // Keep history intact — deactivate instead of hard-deleting a plan in use.
      await this.prisma.plan.update({ where: { id }, data: { isActive: false, isPublic: false } });
      return { ok: true, softDeleted: true };
    }
    await this.prisma.plan.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Organizations (customers) ----
  async listOrgs() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { users: true, projects: true } },
        users: { where: { role: "ADMIN" }, select: { email: true, name: true, lastLoginAt: true }, take: 1 },
      },
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      isActive: o.isActive,
      createdAt: o.createdAt,
      admin: o.users[0] ?? null,
      users: (o as any)._count.users,
      projects: (o as any)._count.projects,
      plan: o.subscription?.plan?.name ?? null,
      status: o.subscription?.status ?? null,
    }));
  }

  setOrgActive(id: string, isActive: boolean) {
    return this.prisma.organization.update({ where: { id }, data: { isActive }, select: { id: true, isActive: true } });
  }

  // ---- Users (across all tenants) ----
  async listUsers(limit = 500) {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(1000, limit),
      select: {
        id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true,
        organization: { select: { name: true } },
        customRole: { select: { name: true } },
      },
    });
    return users.map((u) => ({
      id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive,
      lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
      org: u.organization?.name ?? null, roleName: u.customRole?.name ?? null,
    }));
  }

  setUserActive(id: string, isActive: boolean) {
    return this.prisma.user.update({ where: { id }, data: { isActive }, select: { id: true, isActive: true } });
  }

  // ---- Transactions ----
  listTransactions(limit = 100) {
    return this.prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(500, limit),
      include: { organization: { select: { name: true } } },
    });
  }

  recordTransaction(dto: any) {
    if (!dto?.orgId) throw new BadRequestException("orgId required");
    return this.prisma.transaction.create({
      data: {
        orgId: dto.orgId,
        planId: dto.planId ?? null,
        amountCents: Number(dto.amountCents) || 0,
        currency: dto.currency || "usd",
        status: dto.status || "succeeded",
        gateway: dto.gateway || "manual",
        gatewayRef: dto.gatewayRef ?? null,
      },
    });
  }

  // ---- Gateway / platform settings ----
  async getSetting(key: string) {
    const s = await this.prisma.platformSetting.findUnique({ where: { key } });
    return s?.value ?? null;
  }

  async setSetting(key: string, value: unknown) {
    return this.prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: value as any },
      update: { value: value as any },
    });
  }
}
