import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, createHash } from "crypto";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EmailService } from "../email/email.service";
import { normalizeEmail } from "../common/email.util";
import { withFeatureLabels } from "../entitlements/entitlements.catalog";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Platform-owner (super admin) operations — spans every tenant. */
@Injectable()
export class AdminService {
  // NotificationsModule is @Global — no explicit import needed.
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  /** Issue a 24h one-click magic sign-in link for a user (mirrors
   *  AuthService.createLoginLink; inlined to avoid an AdminModule→AuthModule dep). */
  private async createLoginLink(userId: string): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await this.prisma.magicLink.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) } });
    const api = process.env.API_ORIGIN || `http://localhost:${process.env.API_PORT || 4000}`;
    return `${api}/auth/magic?token=${raw}`;
  }

  /** Send a team-invite-style welcome: a 24h one-click sign-in link plus the
   *  email + temp password as a fallback. Shared by createOrg and grantTrial. */
  private async emailSignInInvite(opts: { userId: string; email: string; tempPassword: string; subject: string; intro: string; orgId: string | null }): Promise<boolean> {
    const loginLink = await this.createLoginLink(opts.userId);
    return this.email.sendBranded(
      opts.email,
      opts.subject,
      opts.subject,
      `${opts.intro}<br><br>` +
        `Click the button below to sign in — no password needed. The link works for 24 hours.<br><br>` +
        `If it expires, sign in with:<br><b>Email:</b> ${opts.email}<br><b>Temporary password:</b> ${opts.tempPassword}<br><br>` +
        `You'll set your own password when you sign in.`,
      { label: "Sign in", url: loginLink },
      opts.orgId, // org's own SMTP + branding if configured
    );
  }

  /** Platform-owner: spin up a brand-new org + its first admin, optionally on a
   *  plan (paid assignment or an N-day trial). The admin is emailed a sign-in
   *  link + temp credentials so they can jump straight in — same as a team invite. */
  async createOrg(dto: { name: string; adminEmail: string; adminName?: string; planId?: string; trial?: boolean; trialDays?: number; keywords?: number }) {
    const name = (dto.name || "").trim();
    if (!name) throw new BadRequestException("Organization name is required");
    const email = normalizeEmail(dto.adminEmail || "");
    if (!email || !email.includes("@")) throw new BadRequestException("A valid admin email is required");
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new BadRequestException("A user with this email already exists");
    }
    // Unique slug from the name (append -2, -3… on collision).
    const base = slugify(name) || "org";
    let slug = base;
    for (let i = 2; await this.prisma.organization.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;

    let plan: any = null;
    if (dto.planId) {
      const p = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!p || !p.isActive) throw new BadRequestException("Unknown or inactive plan");
      plan = p;
    }
    const trial = !!dto.trial;
    const days = trial ? Math.floor(Number(dto.trialDays)) : 0;
    if (trial && (!Number.isFinite(days) || days < 1)) throw new BadRequestException("Trial length must be at least 1 day");
    if (trial && !plan) throw new BadRequestException("Pick a plan to grant a trial on");

    // If the plan includes white-label, seed the org's brand name = org name so its
    // subdomain (‹slug›.APP_DOMAIN) is live from the very first login: /auth/me only
    // returns orgSlug (which drives the client's main-domain → subdomain redirect)
    // once branding.agencyName is set. The admin can refine the logo/name later.
    const isWhiteLabel = !!plan && Array.isArray(plan.features) && plan.features.includes("white_label");
    const org = await this.prisma.organization.create({
      data: { name, slug, isActive: true, ...(isWhiteLabel ? { branding: { agencyName: name } } : {}) },
    });
    const tempPassword = randomBytes(6).toString("base64url");
    const admin = await this.prisma.user.create({
      data: { email, name: dto.adminName?.trim() || null, role: "ADMIN", orgId: org.id, passwordHash: await bcrypt.hash(tempPassword, 12), mustSetPassword: true },
      select: { id: true, email: true },
    });

    let planLine = "";
    if (plan) {
      const ends = trial ? new Date(Date.now() + days * 24 * 3600 * 1000) : null;
      // Chosen keyword tier → per-tenant override; its price drives the invoice.
      const kw = dto.keywords;
      const tiers = Array.isArray(plan.pricingTiers) ? plan.pricingTiers : [];
      const tier = kw != null ? tiers.find((t: any) => Number(t.keywords) === kw) : null;
      const limitOverrides = kw != null ? { keywords: kw } : undefined;
      await this.prisma.subscription.create({
        data: { orgId: org.id, planId: plan.id, status: trial ? "TRIALING" : "ACTIVE", currentPeriodEnd: ends, gateway: "manual", limitOverrides },
      });
      const kwLine = kw != null ? ` (${kw.toLocaleString()} keywords)` : "";
      if (trial) {
        const endLabel = ends!.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        planLine = ` You're on a ${days}-day <b>${plan.name}</b>${kwLine} trial — it ends on <b>${endLabel}</b>; subscribe before then to keep access.`;
      } else {
        // Manual paid assignment — record it in the org's billing history at the tier price.
        const amountCents = tier ? Number(tier.priceCents) : plan.priceCents;
        await this.prisma.transaction.create({ data: { orgId: org.id, planId: plan.id, amountCents, currency: plan.currency, status: "succeeded", gateway: "manual" } });
        planLine = ` Your workspace is on the <b>${plan.name}</b>${kwLine} plan.`;
      }
    }

    // White-label plans get their own branded subdomain — tell the admin its URL.
    const brandLine = isWhiteLabel ? ` Your branded workspace lives at <b>${slug}.${process.env.APP_DOMAIN || "serpscale.com"}</b>.` : "";
    const emailed = await this.emailSignInInvite({
      userId: admin.id,
      email: admin.email,
      tempPassword,
      subject: "Your workspace is ready",
      intro: `An account has been created for you on the platform.${planLine}${brandLine}`,
      orgId: org.id,
    });
    return { ok: true, orgId: org.id, emailed };
  }

  /** Notify an org's active admins about a platform-owner action on their account. */
  private async notifyOrgAdmins(orgId: string, payload: { title: string; body: string; link: string }) {
    const admins = await this.prisma.user
      .findMany({ where: { orgId, role: "ADMIN", isActive: true }, select: { id: true } })
      .catch(() => [] as { id: string }[]);
    if (!admins.length) return;
    await this.notifications.notifyMany(admins.map((a) => a.id), "billing", payload);
  }

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
      // Keyword cap this org actually has: the per-tenant tier override wins over
      // the plan's base keyword limit (mirrors EntitlementsService resolution).
      keywords: ((o.subscription?.limitOverrides as any)?.keywords)
        ?? ((o.subscription?.plan?.limits as any)?.keywords)
        ?? null,
      // ISO date a trial ends (used by the admin UI to show "X days left" /
      // "expired"). Only meaningful while status is TRIALING.
      trialEndsAt: o.subscription?.currentPeriodEnd ?? null,
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
      // Tell the org's admins their workspace access was paused / restored.
      void this.notifyOrgAdmins(id, {
        title: dto.isActive ? "Your workspace access was restored" : "Your workspace access was paused",
        body: dto.isActive
          ? "Your workspace has been reactivated. You and your team can sign in and use the platform again."
          : "Your workspace has been paused by the platform administrator. Please contact support if you think this is a mistake.",
        link: "/dashboard/settings/billing",
      });
    }
    if (dto.planId !== undefined) {
      if (!dto.planId) {
        // Clear any subscription (back to no plan).
        await this.prisma.subscription.deleteMany({ where: { orgId: id } });
        void this.notifyOrgAdmins(id, {
          title: "Your subscription was removed",
          body: "Your plan was removed by the platform administrator. Some features may no longer be available. Contact support to restore access.",
          link: "/dashboard/settings/billing",
        });
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
          // Only announce a genuine plan change (not a no-op re-save).
          void this.notifyOrgAdmins(id, {
            title: "Your plan was updated",
            body: `Your workspace is now on the ${plan.name} plan.`,
            link: "/dashboard/settings/billing",
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

  /** Grant an org a time-boxed trial of any plan (no payment). Upserts the org's
   *  subscription to TRIALING with currentPeriodEnd = now + days and marks it
   *  admin-granted. Access flows immediately via /auth/me entitlements and is
   *  revoked automatically the moment the trial end date passes — after which the
   *  org must subscribe to keep the plan. Unlike the self-serve trial this has no
   *  "new accounts only" rule: the platform owner can grant/extend at will. */
  async grantTrial(id: string, dto: { planId: string; days: number; keywords?: number }) {
    const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!org) throw new NotFoundException("Organization not found");
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) throw new BadRequestException("Unknown or inactive plan");
    const days = Math.floor(dto.days);
    if (!Number.isFinite(days) || days < 1) throw new BadRequestException("Trial length must be at least 1 day");
    const ends = new Date(Date.now() + days * 24 * 3600 * 1000);
    // Keyword tier → per-tenant limitOverrides.keywords (merged onto any existing
    // overrides). Entitlements then resolve this over the plan's base keyword cap.
    const existing = await this.prisma.subscription.findUnique({ where: { orgId: id }, select: { limitOverrides: true } });
    const limitOverrides = dto.keywords != null
      ? { ...((existing?.limitOverrides as any) ?? {}), keywords: dto.keywords }
      : ((existing?.limitOverrides as any) ?? undefined);
    await this.prisma.subscription.upsert({
      where: { orgId: id },
      // gateway "manual" marks an admin grant (vs "trial" self-serve / "stripe" etc).
      // pendingPlanId cleared so a previously scheduled change can't override the trial.
      create: { orgId: id, planId: plan.id, status: "TRIALING", currentPeriodEnd: ends, gateway: "manual", limitOverrides },
      update: { planId: plan.id, status: "TRIALING", currentPeriodEnd: ends, gateway: "manual", pendingPlanId: null, pendingKeywords: null, ...(limitOverrides !== undefined ? { limitOverrides } : {}) },
    });
    const endLabel = ends.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

    // Email the org's primary admin a proper welcome with a one-click sign-in link
    // + fresh credentials — same shape as a team invite. We reset that admin's
    // password to a temp one so the password quoted in the email actually works
    // (existing hashes can't be recovered); mustSetPassword makes onboarding ask
    // them to choose their own, and passwordChangedAt invalidates old tokens.
    const admin = await this.prisma.user.findFirst({
      where: { orgId: id, role: "ADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true },
    });
    let emailed = false;
    if (admin) {
      const tempPassword = randomBytes(6).toString("base64url");
      await this.prisma.user.update({
        where: { id: admin.id },
        data: { passwordHash: await bcrypt.hash(tempPassword, 12), mustSetPassword: true, passwordChangedAt: new Date() },
      });
      emailed = await this.emailSignInInvite({
        userId: admin.id,
        email: admin.email,
        tempPassword,
        subject: `Your ${plan.name} trial is ready`,
        intro: `The platform team has set up a ${days}-day <b>${plan.name}</b> trial on your workspace. It ends on <b>${endLabel}</b>; subscribe before then to keep your access.`,
        orgId: id,
      });
    }

    void this.notifyOrgAdmins(id, {
      title: `Your ${plan.name} trial is active`,
      body: `The platform team granted you a ${days}-day ${plan.name} trial. It ends on ${endLabel} — subscribe before then to keep access.`,
      link: "/dashboard/settings/billing",
    });
    return { ok: true, trialEndsAt: ends.toISOString(), emailed };
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
