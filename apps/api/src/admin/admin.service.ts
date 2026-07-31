import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { withFeatureLabels } from "../entitlements/entitlements.catalog";

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
  async listPlans() {
    const plans = await this.prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: true } } } });
    return plans.map((p) => withFeatureLabels(p));
  }

  // Public, unauthenticated: the active/public plans rendered on the marketing
  // pricing page (name, price, keyword tiers, features — no internal fields).
  // White-label branding for a tenant subdomain (‹slug›.serpscale.com), consumed
  // by the sign-in form so it shows the agency's brand. Public + safe: only the
  // display name + logo, nothing sensitive.
  async publicBranding(slug: string) {
    const org = await this.prisma.organization
      .findUnique({ where: { slug: (slug || "").toLowerCase() }, select: { branding: true, isActive: true } })
      .catch(() => null);
    // `exists` lets the sign-in form block unknown subdomains (abc.serpscale.com).
    if (!org || !org.isActive) return { exists: false, agencyName: null, logoDataUrl: null, logoBg: null };
    const b = (org.branding as any) ?? {};
    return {
      exists: true,
      agencyName: b.agencyName || null,
      logoDataUrl: b.logoDataUrl || null,
      logoBg: b.logoBg || null,
    };
  }

  async publicPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true, isPublic: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, name: true, slug: true, priceCents: true, currency: true,
        interval: true, limits: true, features: true, pricingTiers: true, trialDays: true, sortOrder: true,
      },
    });
    return plans.map((p) => withFeatureLabels(p));
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
        pricingTiers: dto.pricingTiers ?? undefined,
        trialDays: dto.trialDays != null ? Number(dto.trialDays) : null,
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
        pricingTiers: dto.pricingTiers ?? undefined,
        trialDays: dto.trialDays != null ? Number(dto.trialDays) : undefined,
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
      planId: o.subscription?.planId ?? null,
      status: o.subscription?.status ?? null,
    }));
  }

  setOrgActive(id: string, isActive: boolean) {
    return this.prisma.organization.update({ where: { id }, data: { isActive }, select: { id: true, isActive: true } });
  }

  /** Admin-driven org update: suspend/activate and/or directly assign a plan
   *  (no payment) by upserting the org's subscription. Passing planId "" | null
   *  clears the subscription. This is how the super admin hands any plan to any
   *  org so that plan's features flow to its users via /auth/me entitlements. */
  async updateOrg(
    id: string,
    dto: { isActive?: boolean; planId?: string | null; status?: string; limitOverrides?: Record<string, unknown> },
  ) {
    if (typeof dto.isActive === "boolean") {
      await this.prisma.organization.update({ where: { id }, data: { isActive: dto.isActive } });
    }
    if (dto.planId !== undefined) {
      if (!dto.planId) {
        // Clear any subscription (back to no plan).
        await this.prisma.subscription.deleteMany({ where: { orgId: id } });
      } else {
        const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
        if (!plan) throw new BadRequestException("Unknown plan");
        const status = (dto.status as any) || "ACTIVE";
        const limitOverrides = (dto.limitOverrides as any) ?? undefined;
        const existing = await this.prisma.subscription.findUnique({ where: { orgId: id } });
        await this.prisma.subscription.upsert({
          where: { orgId: id },
          create: { orgId: id, planId: plan.id, status, gateway: "manual", limitOverrides },
          update: { planId: plan.id, status, ...(limitOverrides !== undefined ? { limitOverrides } : {}) },
        });
        // Record a manual billing event when the plan actually changes, so it
        // shows in the org's payment history with a downloadable invoice.
        if (existing?.planId !== plan.id) {
          await this.prisma.transaction.create({
            data: { orgId: id, planId: plan.id, amountCents: plan.priceCents, currency: plan.currency, status: "succeeded", gateway: "manual" },
          });
        }
      }
    } else if (dto.status) {
      // Restore / suspend access without changing the plan — this is how the
      // admin "clears" a past-due account and turns access back on.
      await this.prisma.subscription.updateMany({ where: { orgId: id }, data: { status: dto.status as any } });
    }
    return { ok: true };
  }

  /** Permanently delete an org and everything scoped to it. Most relations don't
   *  cascade at the DB level, so we clear dependents in FK-safe order (children
   *  first) inside one transaction. Deleting Projects cascades their nested SEO
   *  data (keywords, crawls, ranks, copilot, github…); the SERP tables keyed only
   *  by a plain `orgId` string (no FK) are swept by orgId for hygiene. */
  async deleteOrg(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!org) throw new NotFoundException("Organization not found");
    // Refuse if a platform owner (super admin) somehow sits in this org — they
    // operate above tenants and must never be swept away with a customer.
    const superAdmins = await this.prisma.user.count({ where: { orgId: id, role: "SUPER_ADMIN" } });
    if (superAdmins > 0) throw new BadRequestException("This organization contains a platform owner and cannot be deleted.");

    await this.prisma.$transaction(async (tx) => {
      const userWhere = { user: { orgId: id } };
      // Token rows on User that DON'T cascade on user-delete — clear them first.
      await tx.refreshToken.deleteMany({ where: userWhere });
      await tx.passwordReset.deleteMany({ where: userWhere });
      // Projects cascade all their nested data (keywords, crawls, ranks, blog,
      // copilot, github, serp-keywords + their snapshots/jobs/history).
      await tx.project.deleteMany({ where: { orgId: id } });
      // SERP data keyed by a bare orgId string (no FK, so it wouldn't block, but
      // leave no orphans). Snapshots cascade their result/feature/PAA rows.
      await tx.serpSnapshot.deleteMany({ where: { orgId: id } });
      await tx.serpJob.deleteMany({ where: { orgId: id } });
      await tx.serpUsageLog.deleteMany({ where: { orgId: id } });
      await tx.serpCredit.deleteMany({ where: { orgId: id } });
      await tx.searchHistory.deleteMany({ where: { orgId: id } });
      await tx.accessRequest.deleteMany({ where: { orgId: id } });
      await tx.auditLog.deleteMany({ where: { orgId: id } });
      await tx.integration.deleteMany({ where: { ownerKey: id } });
      // Org-scoped billing rows (real FKs to Organization).
      await tx.transaction.deleteMany({ where: { orgId: id } });
      await tx.subscription.deleteMany({ where: { orgId: id } });
      await tx.client.deleteMany({ where: { orgId: id } });
      // Users reference customRole, so delete users before the roles.
      await tx.user.deleteMany({ where: { orgId: id } });
      await tx.customRole.deleteMany({ where: { orgId: id } });
      await tx.organization.delete({ where: { id } });
    }, { timeout: 30_000 });

    return { ok: true, name: org.name };
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

  /** Permanently delete a single user (any tenant). Refuses to remove a platform
   *  owner or the caller themselves. Most user-owned rows cascade on delete;
   *  refresh tokens + password resets don't, so clear those first. */
  async deleteUser(id: string, actingUserId?: string) {
    if (id === actingUserId) throw new BadRequestException("You can't delete your own account.");
    const target = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, email: true } });
    if (!target) throw new NotFoundException("User not found");
    if (target.role === "SUPER_ADMIN") throw new BadRequestException("A platform owner cannot be deleted.");

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId: id } });
      await tx.passwordReset.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
    return { ok: true, email: target.email };
  }

  // ---- Marketing site: contact submissions ----
  listContactMessages(limit = 200) {
    return this.prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(1000, limit) });
  }

  setContactHandled(id: string, handled: boolean) {
    return this.prisma.contactMessage.update({ where: { id }, data: { handled }, select: { id: true, handled: true } });
  }

  async deleteContactMessage(id: string) {
    await this.prisma.contactMessage.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Marketing site: newsletter subscribers ----
  listSubscribers(limit = 500) {
    return this.prisma.subscriber.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(5000, limit) });
  }

  async deleteSubscriber(id: string) {
    await this.prisma.subscriber.delete({ where: { id } });
    return { ok: true };
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

  // Secret credential fields — never sent back to the browser, and preserved on
  // save when submitted blank (so editing other fields doesn't wipe them).
  private static readonly SECRET_RE = /secret|password|^pass$/i;
  private static deepMask(v: any): any {
    if (Array.isArray(v)) return v.map((x) => AdminService.deepMask(x));
    if (v && typeof v === "object") {
      const out: any = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = AdminService.SECRET_RE.test(k) ? (val ? "__SET__" : "") : AdminService.deepMask(val);
      }
      return out;
    }
    return v;
  }
  private static deepMerge(incoming: any, existing: any): any {
    if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
      const out: any = {};
      for (const [k, val] of Object.entries(incoming)) {
        if (AdminService.SECRET_RE.test(k)) {
          // Blank or the "__SET__" placeholder → keep the stored secret.
          out[k] = val === "" || val == null || val === "__SET__" ? existing?.[k] ?? "" : val;
        } else {
          out[k] = AdminService.deepMerge(val, existing?.[k]);
        }
      }
      return out;
    }
    return incoming;
  }

  /** Read a settings blob with secret fields masked (never leaves the server). */
  async getSettingSafe(key: string) {
    return AdminService.deepMask(await this.getSetting(key));
  }

  /** Save a settings blob, preserving any secret left blank in the submission. */
  async setSettingMerged(key: string, dto: unknown) {
    const merged = AdminService.deepMerge(dto, await this.getSetting(key));
    return this.setSetting(key, merged);
  }

  async setSetting(key: string, value: unknown) {
    // These setting endpoints take `@Body() dto: any`, so the global
    // ValidationPipe can't guard them — validate here: the payload must be a
    // plain JSON object (no primitives/arrays) and bounded in size, so it can't
    // be abused to store a giant or malformed blob.
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException("Settings payload must be an object.");
    }
    if (JSON.stringify(value).length > 100_000) {
      throw new BadRequestException("Settings payload is too large.");
    }
    return this.prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: value as any },
      update: { value: value as any },
    });
  }
}
