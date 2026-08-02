import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LIMIT_CATALOG, MODULE_CATALOG } from "./entitlements.catalog";

export interface Entitlements {
  planName: string | null;
  planSlug: string | null;
  status: string | null;
  active: boolean; // false when a subscription exists but isn't in good standing
  trialEndsAt: string | null; // ISO date while on a trial, else null
  features: string[]; // module keys the org's plan includes (empty when not active)
  limits: Record<string, number | null>; // key -> cap (null = unlimited)
}

// A subscription only grants access while it is paying. The moment a recurring
// payment fails/declines the webhook flips status to PAST_DUE (or CANCELED), and
// access is revoked instantly — until a successful charge or the admin restores
// the plan sets it back to ACTIVE.
const GOOD_STANDING = new Set(["ACTIVE", "TRIALING"]);

/** One place that resolves what an org is entitled to: its plan's features +
 *  limits, with any per-tenant `limitOverrides` applied on top. Used by
 *  /auth/me, the feature guard and every create-limit check so the merge logic
 *  lives once instead of being copy-pasted. */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async forOrg(orgId: string | null | undefined): Promise<Entitlements> {
    if (!orgId) return { planName: null, planSlug: null, status: null, active: false, trialEndsAt: null, features: [], limits: {} };
    const sub = await this.prisma.subscription.findUnique({ where: { orgId }, include: { plan: true } });
    const plan = sub?.plan;
    const rawLimits: any = { ...((plan?.limits as any) ?? {}), ...((sub?.limitOverrides as any) ?? {}) };
    const limits: Record<string, number | null> = {};
    for (const l of LIMIT_CATALOG) {
      // A key that is present and >= 0 is a real cap (0 = none allowed).
      // Missing / non-numeric → null = unlimited / unset.
      const has = rawLimits[l.key] != null && rawLimits[l.key] !== "";
      const v = Number(rawLimits[l.key]);
      limits[l.key] = has && Number.isFinite(v) && v >= 0 ? v : null;
    }
    // Access is only granted while the subscription is paying. On payment
    // failure/decline (PAST_DUE) or cancel, features are revoked instantly.
    // A TRIALING subscription is active only until its trial end date passes —
    // after that access stops until the customer pays.
    const trialEnd = sub?.status === "TRIALING" && sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
    const trialExpired = !!trialEnd && trialEnd.getTime() < Date.now();
    const active = !!sub && GOOD_STANDING.has(sub.status) && !trialExpired;
    // Keep only known catalog keys so a stale string can never leak a feature.
    const known = new Set(MODULE_CATALOG.map((m) => m.key));
    const features = active && Array.isArray(plan?.features)
      ? (plan!.features as string[]).filter((f) => known.has(f))
      : [];
    return {
      planName: plan?.name ?? null,
      planSlug: plan?.slug ?? null,
      status: sub?.status ?? null,
      active,
      trialEndsAt: trialEnd ? trialEnd.toISOString() : null,
      features,
      limits,
    };
  }

  async hasFeature(orgId: string | null | undefined, key: string): Promise<boolean> {
    const ent = await this.forOrg(orgId);
    return ent.features.includes(key);
  }

  /** Throws 403 if the org's plan doesn't include the given module. */
  async assertFeature(orgId: string | null | undefined, key: string) {
    if (!(await this.hasFeature(orgId, key))) {
      const label = MODULE_CATALOG.find((m) => m.key === key)?.label ?? key;
      throw new ForbiddenException(`${label} is not included in your plan. Upgrade to use it.`);
    }
  }

  /**
   * Start of the current monthly quota window, ANCHORED TO THE SUBSCRIPTION'S
   * RENEWAL DAY (not the calendar 1st) — so on each renewal the blog count resets
   * cleanly. `currentPeriodEnd` (the next renewal date) gives the anchor day; we
   * return the most recent occurrence of that day at/before now. Month-length is
   * clamped (e.g. anchor 31 → Feb 28). Falls back to the calendar month when
   * there's no subscription/renewal date yet.
   */
  monthlyWindowStart(currentPeriodEnd?: Date | null, now: Date = new Date()): Date {
    const anchorDay = currentPeriodEnd ? new Date(currentPeriodEnd).getDate() : 1;
    const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const at = (y: number, m: number) => new Date(y, m, Math.min(anchorDay, lastDay(y, m)), 0, 0, 0, 0);
    let start = at(now.getFullYear(), now.getMonth());
    if (start.getTime() > now.getTime()) {
      // The anchor day hasn't arrived this month yet → the window opened last month.
      const m = now.getMonth() - 1;
      start = m < 0 ? at(now.getFullYear() - 1, 11) : at(now.getFullYear(), m);
    }
    return start;
  }

  /** How many blogs the org has generated in the CURRENT billing period. Counted
   *  from the immutable audit trail (one row per successful generation), so it
   *  needs no extra usage table and resets automatically each renewal. */
  async blogUsageThisPeriod(orgId: string | null | undefined): Promise<number> {
    if (!orgId) return 0;
    const sub = await this.prisma.subscription.findUnique({ where: { orgId }, select: { currentPeriodEnd: true } });
    const start = this.monthlyWindowStart(sub?.currentPeriodEnd ?? null);
    return this.prisma.auditLog.count({
      where: { orgId, action: "content.blog.generate", createdAt: { gte: start } },
    });
  }

  /** Throws 403 if the org has hit its blog-generation cap for the current period. */
  async assertBlogQuota(orgId: string | null | undefined) {
    if (!orgId) return;
    const used = await this.blogUsageThisPeriod(orgId);
    await this.assertWithinLimit(orgId, "blogsPerMonth", used);
  }

  /** Throws 403 when adding one more of `limitKey` would exceed the plan cap.
   *  `current` is the org's current count of that resource. */
  async assertWithinLimit(orgId: string | null | undefined, limitKey: string, current: number) {
    if (!orgId) return;
    const ent = await this.forOrg(orgId);
    const cap = ent.limits[limitKey];
    if (cap != null && current >= cap) {
      const label = LIMIT_CATALOG.find((l) => l.key === limitKey)?.label ?? limitKey;
      throw new ForbiddenException(`Your plan allows ${cap} ${label.toLowerCase()}. Upgrade to add more.`);
    }
  }
}
