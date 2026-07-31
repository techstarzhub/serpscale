import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service";
import { GatewayService } from "./gateway.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EmailService } from "../email/email.service";
import { withFeatureLabels } from "../entitlements/entitlements.catalog";
import { renderInvoicePdf } from "./invoice";

const WEB = () => process.env.WEB_ORIGIN || "http://localhost:3000";

/** Recurring subscription billing across Stripe + PayPal. Both gateways auto-charge
 *  on renewal; our DB is kept in sync by their webhooks. */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly gw: GatewayService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  async publicPlans() {
    const plans = await this.prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" } });
    return plans.map((p) => withFeatureLabels(p));
  }

  async subscription(orgId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId }, include: { plan: true } });
    if (!sub) return sub;
    const pendingPlan = sub.pendingPlanId ? await this.prisma.plan.findUnique({ where: { id: sub.pendingPlanId } }) : null;
    return {
      ...sub,
      plan: sub.plan ? withFeatureLabels(sub.plan) : sub.plan,
      pendingPlan: pendingPlan ? { id: pendingPlan.id, name: pendingPlan.name } : null,
    };
  }

  /** Schedule a plan change for the next renewal (like a mobile-recharge queue).
   *  The current plan keeps running until currentPeriodEnd, then the pending plan
   *  is applied. Upgrades queue here too — the higher plan starts when the current
   *  one ends. Downgrades are disabled (only same/higher-priced moves allowed). */
  async scheduleChange(orgId: string, planId: string, keywords?: number | null) {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId } });
    if (!sub || !["ACTIVE", "TRIALING"].includes(sub.status)) throw new BadRequestException("You need an active subscription to schedule a plan change.");
    if (planId === sub.planId) throw new BadRequestException("You're already on this plan.");
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new BadRequestException("Plan not found.");
    // Downgrades are disabled — you can only move to a same/higher-priced plan.
    const current = await this.prisma.plan.findUnique({ where: { id: sub.planId } });
    if (current && plan.priceCents < current.priceCents) throw new BadRequestException("Downgrades aren't available. Contact support to move to a lower plan.");
    const isUpgrade = !!current && plan.priceCents > current.priceCents;
    // For a PayPal upgrade, revise the live subscription so PayPal itself bills the
    // higher amount from the NEXT cycle (the current cycle finishes at the old
    // price). Because the charge goes up, PayPal returns an approval link the buyer
    // must confirm. Do this BEFORE writing pendingPlanId so a gateway failure never
    // leaves a scheduled switch PayPal hasn't agreed to bill.
    let approvalUrl: string | null = null;
    if (isUpgrade && sub.gateway === "paypal" && sub.gatewaySubscriptionId) {
      approvalUrl = await this.revisePaypalPlan(sub.gatewaySubscriptionId, plan, keywords);
    }
    await this.prisma.subscription.update({ where: { orgId }, data: { pendingPlanId: planId, pendingKeywords: keywords ?? null } });
    const when = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "your next renewal";
    await this.notifyOrgAdmins(orgId, { title: isUpgrade ? "Upgrade scheduled" : "Plan change scheduled", body: `Your plan switches to ${plan.name} on ${when}. Your current plan keeps running until then.`, link: "/dashboard/settings/billing" });
    await this.alertSuperAdmins(orgId, `${isUpgrade ? "Upgrade" : "Plan change"} scheduled: ${plan.name}`, isUpgrade ? "Upgrade scheduled" : "Plan change scheduled", { Plan: plan.name, Effective: when });
    return { scheduled: true, planName: plan.name, effectiveAt: sub.currentPeriodEnd, url: approvalUrl ?? undefined };
  }

  /** Point an existing PayPal subscription at a higher-priced plan. PayPal applies
   *  the new price from the NEXT billing cycle (the current cycle finishes at the
   *  old price) and — because the amount increases — returns an approval link the
   *  buyer must confirm. Returns that link, or null if PayPal applied it silently. */
  private async revisePaypalPlan(subscriptionId: string, targetPlan: any, keywords?: number | null): Promise<string | null> {
    const { token, base, live } = await this.ppToken();
    const tiers = Array.isArray(targetPlan.pricingTiers) ? (targetPlan.pricingTiers as any[]) : [];
    const tier = keywords != null ? tiers.find((t) => Number(t.keywords) === Number(keywords)) : null;
    const priceCents = tier ? tier.priceCents : targetPlan.priceCents;
    const ppPlanId = await this.ensurePaypalPlan(targetPlan, priceCents, token, base, live);
    const res = await this.pp(`/v1/billing/subscriptions/${subscriptionId}/revise`, "POST", {
      plan_id: ppPlanId,
      application_context: {
        return_url: `${WEB()}/dashboard/settings/billing?upgrade_scheduled=1`,
        cancel_url: `${WEB()}/dashboard/settings/billing?canceled=1`,
      },
    }, token, base);
    const approve = (res?.links || []).find((l: any) => String(l.rel).toLowerCase() === "approve");
    // A price INCREASE must return an approval link. If PayPal rejected the revise
    // (e.g. the plans live under different products) there is no link — fail loudly
    // so the caller does NOT record a scheduled switch PayPal won't bill for.
    if (!approve?.href) {
      const reason = res?.details?.[0]?.description || res?.message || "PayPal could not schedule this upgrade.";
      throw new BadRequestException(reason);
    }
    return approve.href;
  }

  /** Cancel a scheduled (pending) plan change — stay on the current plan. */
  async cancelScheduledChange(orgId: string) {
    await this.prisma.subscription.update({ where: { orgId }, data: { pendingPlanId: null, pendingKeywords: null } }).catch(() => {});
    return { ok: true };
  }

  /** Apply a scheduled plan change (called at renewal): switch the plan +
   *  keyword override and clear the pending fields. */
  private async applyPendingChange(orgId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId } });
    if (!sub?.pendingPlanId) return;
    const plan = await this.prisma.plan.findUnique({ where: { id: sub.pendingPlanId } });
    if (!plan) { await this.prisma.subscription.update({ where: { orgId }, data: { pendingPlanId: null, pendingKeywords: null } }); return; }
    const overrides: any = { ...((sub.limitOverrides as any) || {}) };
    if (sub.pendingKeywords != null) overrides.keywords = sub.pendingKeywords; else delete overrides.keywords;
    await this.prisma.subscription.update({ where: { orgId }, data: { planId: plan.id, limitOverrides: Object.keys(overrides).length ? overrides : null, pendingPlanId: null, pendingKeywords: null } });
    await this.notifyOrgAdmins(orgId, { title: "Plan updated", body: `Your subscription is now on the ${plan.name} plan.`, link: "/dashboard/settings/billing" });
  }

  // The one payment gateway the super admin turned on (or "" if none configured).
  async activeGateway() {
    return { active: await this.gw.active() };
  }

  // Fallback for when webhooks aren't set up yet (e.g. sandbox testing): when the
  // user returns from PayPal approval, verify the subscription status directly and
  // activate it. Safe to call repeatedly — it no-ops until PayPal reports ACTIVE.
  async confirmPending(orgId: string): Promise<{ active: boolean }> {
    const txn = await this.prisma.transaction.findFirst({ where: { orgId, gateway: "paypal", status: "pending" }, orderBy: { createdAt: "desc" } });
    if (!txn?.gatewayRef) return { active: false };
    try {
      const { token, base } = await this.ppToken();
      const sub = await this.pp(`/v1/billing/subscriptions/${txn.gatewayRef}`, "GET", null, token, base);
      // Only ACTIVE means the subscription is truly billing (APPROVED is transient
      // and can precede the first charge).
      if (sub?.status === "ACTIVE") {
        // Store PayPal's real next charge date so the UI shows "Renews <date>"
        // instead of "No active billing period".
        const nextBilling = sub?.billing_info?.next_billing_time ? new Date(sub.billing_info.next_billing_time) : null;
        await this.activate(orgId, txn.planId, "paypal", null, txn.gatewayRef, nextBilling);
        return { active: true };
      }
    } catch {
      /* PayPal not reachable / not approved yet */
    }
    return { active: false };
  }

  // Start a free trial on a plan that offers one (e.g. Starter's 7 days). One per
  // org — only for accounts that have never had a subscription.
  async startTrial(orgId: string, planId: string) {
    const existing = await this.prisma.subscription.findUnique({ where: { orgId } });
    if (existing) throw new BadRequestException("A free trial is only available for new accounts.");
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new NotFoundException("Plan not found");
    const days = Number(plan.trialDays) || 0;
    if (days <= 0) throw new BadRequestException("This plan does not offer a free trial.");
    const ends = new Date(Date.now() + days * 24 * 3600 * 1000);
    await this.prisma.subscription.create({ data: { orgId, planId: plan.id, status: "TRIALING", currentPeriodEnd: ends, gateway: "trial" } });
    await this.notifyOrgAdmins(orgId, { title: "Free trial started", body: `Your ${days}-day ${plan.name} trial is now active.`, link: "/dashboard/settings/billing" });
    await this.emailOrgAdmins(orgId, "Your free trial has started", `Your ${days}-day <b>${plan.name}</b> trial is now active. Explore every feature — you won't be charged until you choose to upgrade. Your trial ends on ${ends.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`, { label: "Open dashboard", url: `${WEB()}/dashboard` });
    await this.alertSuperAdmins(orgId, `New trial: ${plan.name}`, "Free trial started", { Plan: plan.name, Trial: `${days} days, ends ${ends.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}` });
    return { ok: true, trialEndsAt: ends.toISOString() };
  }

  // Render a branded invoice PDF for one of this org's transactions. Verifies
  // the transaction belongs to the org before generating.
  async invoicePdf(orgId: string, txnId: string): Promise<{ buffer: Buffer; filename: string }> {
    const txn = await this.prisma.transaction.findFirst({ where: { id: txnId, orgId } });
    if (!txn) throw new NotFoundException("Invoice not found");
    const [org, admin, branding, plan] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
      this.prisma.user.findFirst({ where: { orgId, role: "ADMIN" }, select: { email: true }, orderBy: { createdAt: "asc" } }),
      this.prisma.platformSetting.findUnique({ where: { key: "branding" } }),
      txn.planId ? this.prisma.plan.findUnique({ where: { id: txn.planId }, select: { name: true } }) : Promise.resolve(null),
    ]);
    const b: any = branding?.value ?? {};
    const buffer = await renderInvoicePdf({
      product: b.productName || "SerpScale",
      supportEmail: b.supportEmail || "",
      invoiceNo: txn.id.slice(-8).toUpperCase(),
      date: new Date(txn.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      orgName: org?.name ?? "Customer",
      orgEmail: admin?.email ?? "",
      planName: plan?.name ?? "Subscription",
      amountCents: txn.amountCents,
      currency: txn.currency,
      status: txn.status,
      gateway: txn.gateway,
    });
    return { buffer, filename: `invoice-${txn.id.slice(-8).toUpperCase()}.pdf` };
  }

  // This org's payment history (newest first) with plan names resolved.
  async transactions(orgId: string) {
    const txns = await this.prisma.transaction.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 100 });
    const planIds = [...new Set(txns.map((t) => t.planId).filter(Boolean))] as string[];
    const plans = planIds.length ? await this.prisma.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true } }) : [];
    const nameById = new Map(plans.map((p) => [p.id, p.name]));
    return txns.map((t) => ({
      id: t.id,
      planName: t.planId ? nameById.get(t.planId) ?? null : null,
      amountCents: t.amountCents,
      currency: t.currency,
      status: t.status,
      gateway: t.gateway,
      createdAt: t.createdAt,
    }));
  }

  // Current plan usage vs limits — shown on the billing page.
  async usage(orgId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId }, include: { plan: true } });
    const limits: any = { ...((sub?.plan?.limits as any) ?? {}), ...((sub?.limitOverrides as any) ?? {}) };
    const [projects, seats, clients] = await Promise.all([
      this.prisma.project.count({ where: { orgId } }),
      this.prisma.user.count({ where: { orgId, isActive: true } }),
      this.prisma.client.count({ where: { orgId } }),
    ]);
    // A cap of 0 is real (none allowed); only a missing/blank value is unlimited.
    const lim = (k: string) => {
      const has = limits[k] != null && limits[k] !== "";
      const v = Number(limits[k]);
      return has && Number.isFinite(v) && v >= 0 ? v : null;
    };
    return {
      plan: sub?.plan?.name ?? null,
      status: sub?.status ?? null,
      projects: { used: projects, limit: lim("projects") },
      seats: { used: seats, limit: lim("seats") },
      clients: { used: clients, limit: lim("clients") },
      keywords: { limit: lim("keywords") },
    };
  }

  // Verify a PayPal webhook is genuinely from PayPal (transmission signature check).
  // When no webhookId is configured we cannot verify (dev) — allow but log.
  async verifyPaypalWebhook(headers: Record<string, any>, body: any): Promise<boolean> {
    const { webhookId } = await this.gw.paypal();
    if (!webhookId) {
      // Fail CLOSED. Without a webhookId we cannot prove the event came from
      // PayPal, and the handler grants real subscriptions off the body — so an
      // unverified event must be rejected. Only an explicit dev opt-in bypasses
      // this (never set it in production).
      if (process.env.PAYPAL_ALLOW_UNVERIFIED_WEBHOOKS === "1" && process.env.NODE_ENV !== "production") {
        this.logger.warn("PayPal webhookId not set — accepting UNVERIFIED webhook (dev opt-in only)");
        return true;
      }
      this.logger.error("PayPal webhookId not configured — rejecting unverified webhook");
      return false;
    }
    try {
      const { token, base } = await this.ppToken();
      const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_algo: headers["paypal-auth-algo"],
          cert_url: headers["paypal-cert-url"],
          transmission_id: headers["paypal-transmission-id"],
          transmission_sig: headers["paypal-transmission-sig"],
          transmission_time: headers["paypal-transmission-time"],
          webhook_id: webhookId,
          webhook_event: body,
        }),
      });
      const data: any = await res.json();
      return data?.verification_status === "SUCCESS";
    } catch (e) {
      this.logger.warn(`PayPal webhook verification failed: ${String(e).slice(0, 120)}`);
      return false;
    }
  }

  // ------------------------------------------------------------------ checkout
  async createCheckout(orgId: string, planId: string, gateway: string, keywords?: number): Promise<{ url: string }> {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new NotFoundException("Plan not found");
    // Apply the chosen keyword tier's price (the marketing/billing dropdown). The
    // matching keyword limit is applied on activation via the paid amount.
    const tiers = Array.isArray(plan.pricingTiers) ? (plan.pricingTiers as any[]) : [];
    const tier = keywords != null ? tiers.find((t) => Number(t.keywords) === Number(keywords)) : null;
    if (tier) plan.priceCents = tier.priceCents;
    // Free plan — no gateway round-trip; activate immediately.
    if ((plan.priceCents ?? 0) <= 0) {
      await this.activate(orgId, plan.id, "manual", null, null, null);
      return { url: `${WEB()}/dashboard/settings/billing?activated=1` };
    }
    return gateway === "paypal" ? this.stripeOrPaypal(orgId, plan, "paypal") : this.stripeOrPaypal(orgId, plan, "stripe");
  }

  private stripeOrPaypal(orgId: string, plan: any, gw: "stripe" | "paypal") {
    return gw === "paypal" ? this.createPaypalSubscription(orgId, plan) : this.createStripeCheckout(orgId, plan);
  }

  private async createStripeCheckout(orgId: string, plan: any): Promise<{ url: string }> {
    const stripe = await this.gw.stripe();
    if (!stripe) throw new BadRequestException("Stripe is not configured");
    await this.prisma.transaction.create({ data: { orgId, planId: plan.id, amountCents: plan.priceCents, currency: plan.currency, status: "pending", gateway: "stripe" } });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{
        price_data: {
          currency: plan.currency,
          unit_amount: plan.priceCents,
          recurring: { interval: plan.interval === "year" ? "year" : "month" },
          product_data: { name: plan.name },
        },
        quantity: 1,
      }],
      client_reference_id: orgId,
      metadata: { orgId, planId: plan.id },
      subscription_data: { metadata: { orgId, planId: plan.id } },
      success_url: `${WEB()}/dashboard/settings/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${WEB()}/dashboard/settings/billing?canceled=1`,
    });
    return { url: session.url ?? `${WEB()}/dashboard/settings/billing` };
  }

  // ------------------------------------------------------------------ PayPal REST
  private async ppToken(): Promise<{ token: string; base: string; live: boolean }> {
    const { clientId, clientSecret, base, live } = await this.gw.paypal();
    if (!clientId || !clientSecret) throw new BadRequestException("PayPal is not configured");
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const data: any = await res.json();
    if (!data.access_token) throw new BadRequestException("PayPal auth failed");
    return { token: data.access_token, base, live: !!live };
  }
  private async pp(path: string, method: string, body: any, token: string, base: string): Promise<any> {
    const res = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return res.json().catch(() => ({}));
  }

  // A plan with keyword tiers needs one PayPal plan per distinct price shown in
  // the dropdown (PayPal has no inline/dynamic pricing like Stripe), cached in
  // paypalPlanIds/paypalPlanIdsLive keyed by priceCents. Creates + caches on
  // first use for a given price; reuses it afterwards.
  private async ensurePaypalPlan(plan: any, priceCents: number, token: string, base: string, live: boolean): Promise<string> {
    const field = live ? "paypalPlanIdsLive" : "paypalPlanIds";
    const map = (plan[field] as Record<string, string> | null) ?? {};
    const key = String(priceCents);
    if (map[key]) return map[key];

    const product = await this.pp("/v1/catalogs/products", "POST", { name: plan.name, type: "SERVICE" }, token, base);
    if (!product?.id) throw new BadRequestException("PayPal product creation failed. Check your PayPal credentials.");
    const planRes = await this.pp("/v1/billing/plans", "POST", {
      product_id: product.id,
      name: plan.name,
      billing_cycles: [{
        frequency: { interval_unit: plan.interval === "year" ? "YEAR" : "MONTH", interval_count: 1 },
        tenure_type: "REGULAR", sequence: 1, total_cycles: 0,
        pricing_scheme: { fixed_price: { value: (priceCents / 100).toFixed(2), currency_code: String(plan.currency).toUpperCase() } },
      }],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
    }, token, base);
    const ppPlanId = planRes.id;
    if (!ppPlanId) throw new BadRequestException("PayPal plan creation failed. Check your PayPal credentials.");
    const nextMap = { ...map, [key]: ppPlanId };
    await this.prisma.plan.update({ where: { id: plan.id }, data: { [field]: nextMap } });
    plan[field] = nextMap;
    return ppPlanId;
  }

  private async createPaypalSubscription(orgId: string, plan: any): Promise<{ url: string }> {
    const { token, base, live } = await this.ppToken();
    const ppPlanId = await this.ensurePaypalPlan(plan, plan.priceCents, token, base, live);
    const sub = await this.pp("/v1/billing/subscriptions", "POST", {
      plan_id: ppPlanId,
      custom_id: orgId,
      application_context: { return_url: `${WEB()}/dashboard/settings/billing/success?pp=1`, cancel_url: `${WEB()}/dashboard/settings/billing?canceled=1` },
    }, token, base);
    if (!sub?.id) throw new BadRequestException("PayPal subscription creation failed. Please try again.");
    await this.prisma.transaction.create({ data: { orgId, planId: plan.id, amountCents: plan.priceCents, currency: plan.currency, status: "pending", gateway: "paypal", gatewayRef: sub.id } });
    const approve = (sub.links || []).find((l: any) => l.rel === "approve");
    if (!approve?.href) throw new BadRequestException("PayPal subscription creation failed");
    return { url: approve.href };
  }

  // ------------------------------------------------------------------ lifecycle
  async activate(orgId: string, planId: string | null | undefined, gateway: string, customerId: string | null, subscriptionId: string | null, periodEnd: Date | null) {
    if (!planId) return;
    const existing = await this.prisma.subscription.findUnique({ where: { orgId } });
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    // If the plan has keyword tiers, match the amount actually paid to a tier and
    // apply that tier's keyword count as a per-tenant limit override, so a customer
    // who paid for more keywords gets them.
    const tiers = Array.isArray((plan as any)?.pricingTiers) ? ((plan as any).pricingTiers as any[]) : [];
    let limitOverrides = (existing?.limitOverrides as any) ?? undefined;
    // Only apply a keyword-tier override for a gateway-confirmed subscription
    // (subscriptionId present) — never off an unverified pending transaction.
    if (tiers.length && subscriptionId) {
      const txn = await this.prisma.transaction.findFirst({ where: { orgId, planId, gateway, status: { in: ["pending", "succeeded"] } }, orderBy: { createdAt: "desc" } });
      const tier = txn ? tiers.find((t) => Number(t.priceCents) === txn.amountCents) : null;
      if (tier) limitOverrides = { ...(limitOverrides || {}), keywords: tier.keywords };
    }
    // Upgrade/plan-change: if a different gateway subscription was already
    // running, cancel the old one at the gateway so the customer isn't billed
    // twice. Also clear any scheduled (pending) change — this new plan wins.
    if (existing?.gatewaySubscriptionId && existing.gatewaySubscriptionId !== subscriptionId) {
      await this.cancelGatewaySub(existing.gateway, existing.gatewaySubscriptionId);
    }
    const data: any = { planId, status: "ACTIVE", gateway, gatewayCustomerId: customerId, gatewaySubscriptionId: subscriptionId, currentPeriodEnd: periodEnd, pendingPlanId: null, pendingKeywords: null, ...(limitOverrides !== undefined ? { limitOverrides } : {}) };
    if (existing) await this.prisma.subscription.update({ where: { orgId }, data });
    else await this.prisma.subscription.create({ data: { orgId, ...data } });
    await this.prisma.transaction.updateMany({ where: { orgId, planId, status: "pending", gateway }, data: { status: "succeeded" } });
    await this.notifyOrgAdmins(orgId, {
      title: "Subscription active",
      body: `Your ${plan?.name ?? "plan"} subscription is active.`,
      link: "/dashboard/settings/billing",
    });
    await this.emailOrgAdmins(orgId, "Payment confirmed — subscription active", `Thank you for your purchase! Your <b>${plan?.name ?? "plan"}</b> subscription is now active. You can download your invoice anytime from the billing page.`, { label: "View billing", url: `${WEB()}/dashboard/settings/billing` });
    // Platform-owner alert: full payment/subscription details.
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    const admin = await this.prisma.user.findFirst({ where: { orgId, role: "ADMIN" }, select: { email: true }, orderBy: { createdAt: "asc" } });
    const txn = await this.prisma.transaction.findFirst({ where: { orgId, planId, gateway, status: "succeeded" }, orderBy: { createdAt: "desc" } });
    const amt = txn ? `${txn.currency?.toLowerCase() === "usd" ? "$" : (txn.currency?.toUpperCase() ?? "") + " "}${(txn.amountCents / 100).toFixed(2)}` : "—";
    this.email.notifySuperAdmins(
      `New payment: ${plan?.name ?? "plan"} — ${org?.name ?? orgId}`,
      "Payment received — subscription active",
      `A customer just paid for a subscription.
       <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:6px">
         <tr><td style="padding:5px 0;color:#6b7280;width:120px">Customer</td><td style="padding:5px 0;font-weight:600">${org?.name ?? "—"}</td></tr>
         <tr><td style="padding:5px 0;color:#6b7280">Account email</td><td style="padding:5px 0">${admin?.email ?? "—"}</td></tr>
         <tr><td style="padding:5px 0;color:#6b7280">Plan</td><td style="padding:5px 0">${plan?.name ?? "—"}</td></tr>
         <tr><td style="padding:5px 0;color:#6b7280">Amount</td><td style="padding:5px 0;font-weight:600">${amt}</td></tr>
         <tr><td style="padding:5px 0;color:#6b7280">Gateway</td><td style="padding:5px 0">${gateway}${subscriptionId ? ` · ${subscriptionId}` : ""}</td></tr>
         <tr><td style="padding:5px 0;color:#6b7280">When</td><td style="padding:5px 0">${new Date().toLocaleString("en-US")}</td></tr>
       </table>`,
    ).catch(() => {});
  }

  // Notify every active admin of an org about a billing event (honours their prefs).
  private async notifyOrgAdmins(orgId: string, payload: { title: string; body: string; link: string }) {
    const admins = await this.prisma.user.findMany({ where: { orgId, role: "ADMIN", isActive: true }, select: { id: true } });
    await this.notifications.notifyMany(admins.map((a) => a.id), "billing", payload);
  }

  // Transactional billing email (trial start, purchase confirmation) — sent
  // regardless of notification prefs, since these are account-critical receipts.
  private async emailOrgAdmins(orgId: string, subject: string, body: string, cta?: { label: string; url: string }) {
    const admins = await this.prisma.user.findMany({ where: { orgId, role: "ADMIN", isActive: true }, select: { email: true } });
    await Promise.all(admins.map((a) => this.email.sendBranded(a.email, subject, subject, body, cta, orgId).catch(() => {})));
  }

  // Platform-owner alert with the customer's details — for trials, renewals,
  // cancellations, etc. (activation has its own richer version above).
  private async alertSuperAdmins(orgId: string, subject: string, title: string, lines: Record<string, string>) {
    const [org, admin] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
      this.prisma.user.findFirst({ where: { orgId, role: "ADMIN" }, select: { email: true }, orderBy: { createdAt: "asc" } }),
    ]);
    const rows: Record<string, string> = { Customer: org?.name ?? "—", "Account email": admin?.email ?? "—", ...lines, When: new Date().toLocaleString("en-US") };
    const table = Object.entries(rows).map(([k, v]) => `<tr><td style="padding:5px 0;color:#6b7280;width:120px">${k}</td><td style="padding:5px 0">${v}</td></tr>`).join("");
    await this.email.notifySuperAdmins(subject, title, `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:6px">${table}</table>`).catch(() => undefined);
  }

  async cancel(orgId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId } });
    if (!sub) throw new NotFoundException("No subscription");
    if (sub.gateway === "stripe" && sub.gatewaySubscriptionId) {
      const stripe = await this.gw.stripe();
      await stripe?.subscriptions.cancel(sub.gatewaySubscriptionId).catch(() => {});
    } else if (sub.gateway === "paypal" && sub.gatewaySubscriptionId) {
      const { token, base } = await this.ppToken();
      await this.pp(`/v1/billing/subscriptions/${sub.gatewaySubscriptionId}/cancel`, "POST", { reason: "user requested" }, token, base).catch(() => {});
    }
    await this.prisma.subscription.update({ where: { orgId }, data: { status: "CANCELED", pendingPlanId: null, pendingKeywords: null } });
    await this.notifyOrgAdmins(orgId, {
      title: "Subscription canceled",
      body: "Your subscription was canceled. Access continues until the period ends.",
      link: "/dashboard/settings/billing",
    });
    await this.alertSuperAdmins(orgId, "Subscription canceled by customer", "Subscription canceled", { Event: "Customer canceled from billing", Plan: sub.planId });
    return { ok: true };
  }

  /** Cancel a subscription at the payment gateway (best effort) — used when an
   *  upgrade replaces an old subscription, so the customer is never charged twice. */
  private async cancelGatewaySub(gateway: string | null | undefined, subId: string | null | undefined) {
    if (!subId) return;
    try {
      if (gateway === "stripe") {
        const stripe = await this.gw.stripe();
        await stripe?.subscriptions.cancel(subId).catch(() => {});
      } else if (gateway === "paypal") {
        const { token, base } = await this.ppToken();
        await this.pp(`/v1/billing/subscriptions/${subId}/cancel`, "POST", { reason: "plan changed" }, token, base).catch(() => {});
      }
    } catch { /* best effort — never block activation */ }
  }

  // ------------------------------------------------------------------ webhooks
  async handleStripeEvent(event: Stripe.Event) {
    const stripe = await this.gw.stripe();
    const bySub = async (subId?: string | null) => (subId ? this.prisma.subscription.findFirst({ where: { gatewaySubscriptionId: subId } }) : null);
    try {
      if (event.type === "checkout.session.completed") {
        const s: any = event.data.object;
        const orgId = s.metadata?.orgId || s.client_reference_id;
        const planId = s.metadata?.planId;
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        let periodEnd: Date | null = null;
        if (subId && stripe) { const sub: any = await stripe.subscriptions.retrieve(subId); periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null; }
        await this.activate(orgId, planId, "stripe", typeof s.customer === "string" ? s.customer : s.customer?.id ?? null, subId ?? null, periodEnd);
      } else if (event.type === "invoice.paid") {
        const inv: any = event.data.object;
        const local = await bySub(typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id);
        if (local) {
          await this.prisma.subscription.update({ where: { orgId: local.orgId }, data: { status: "ACTIVE", currentPeriodEnd: inv.lines?.data?.[0]?.period?.end ? new Date(inv.lines.data[0].period.end * 1000) : local.currentPeriodEnd } });
          await this.notifyOrgAdmins(local.orgId, { title: "Payment received", body: "Your subscription renewed successfully.", link: "/dashboard/settings/billing" });
        }
      } else if (event.type === "invoice.payment_failed") {
        const inv: any = event.data.object;
        const local = await bySub(typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id);
        if (local) {
          await this.prisma.subscription.update({ where: { orgId: local.orgId }, data: { status: "PAST_DUE" } });
          await this.notifyOrgAdmins(local.orgId, { title: "Payment failed", body: "We couldn't charge your payment method. Please update it to keep your subscription active.", link: "/dashboard/settings/billing" });
        }
      } else if (event.type === "customer.subscription.deleted") {
        const sub: any = event.data.object;
        const local = await bySub(sub.id);
        if (local) {
          await this.prisma.subscription.update({ where: { orgId: local.orgId }, data: { status: "CANCELED" } });
          await this.notifyOrgAdmins(local.orgId, { title: "Subscription ended", body: "Your subscription has ended.", link: "/dashboard/settings/billing" });
        }
      }
    } catch (e) {
      this.logger.warn(`stripe webhook ${event.type} failed: ${String(e).slice(0, 100)}`);
    }
  }

  async handlePaypalEvent(body: any) {
    const type = body?.event_type;
    const res = body?.resource ?? {};
    const orgId = res.custom_id;
    const subId = res.id || res.billing_agreement_id;
    try {
      if (type === "BILLING.SUBSCRIPTION.ACTIVATED" && orgId) {
        // Match the exact checkout by the PayPal subscription id we stored as
        // gatewayRef, so the correct plan is assigned even if the org has more
        // than one pending checkout. Fall back to the latest pending.
        const txn =
          (subId && (await this.prisma.transaction.findFirst({ where: { orgId, gateway: "paypal", status: "pending", gatewayRef: subId } }))) ||
          (await this.prisma.transaction.findFirst({ where: { orgId, gateway: "paypal", status: "pending" }, orderBy: { createdAt: "desc" } }));
        const nextBilling = res?.billing_info?.next_billing_time ? new Date(res.billing_info.next_billing_time) : null;
        await this.activate(orgId, txn?.planId ?? null, "paypal", null, subId ?? null, nextBilling);
      } else if (type === "PAYMENT.SALE.COMPLETED" && subId) {
        const local = await this.prisma.subscription.findFirst({ where: { gatewaySubscriptionId: subId } });
        // Ignore late/out-of-order or replayed sale events for a subscription the
        // user already canceled — a stray PAYMENT.SALE.COMPLETED must NOT
        // resurrect a CANCELED subscription back to ACTIVE.
        if (local && local.status !== "CANCELED") {
          // Advance the billing period so "Renews on <date>" stays correct.
          let nextBilling: Date | null = null;
          try {
            const { token, base } = await this.ppToken();
            const sub = await this.pp(`/v1/billing/subscriptions/${subId}`, "GET", null, token, base);
            if (sub?.billing_info?.next_billing_time) nextBilling = new Date(sub.billing_info.next_billing_time);
          } catch { /* fall back to status-only update below */ }
          await this.prisma.subscription.update({
            where: { orgId: local.orgId },
            data: { status: "ACTIVE", ...(nextBilling ? { currentPeriodEnd: nextBilling } : {}) },
          });
          // A new billing period started — apply any scheduled plan change (downgrade).
          await this.applyPendingChange(local.orgId);
          await this.notifyOrgAdmins(local.orgId, { title: "Payment received", body: "Your subscription renewed successfully.", link: "/dashboard/settings/billing" });
          await this.alertSuperAdmins(local.orgId, "Recurring payment received", "Subscription renewed", { Event: "Recurring renewal payment", Gateway: `paypal${subId ? ` · ${subId}` : ""}` });
        }
      } else if ((type === "BILLING.SUBSCRIPTION.CANCELLED" || type === "BILLING.SUBSCRIPTION.SUSPENDED") && subId) {
        const local = await this.prisma.subscription.findFirst({ where: { gatewaySubscriptionId: subId } });
        if (local) {
          const canceled = type.includes("CANCELLED");
          await this.prisma.subscription.update({ where: { orgId: local.orgId }, data: { status: canceled ? "CANCELED" : "PAST_DUE" } });
          await this.notifyOrgAdmins(local.orgId, canceled
            ? { title: "Subscription ended", body: "Your subscription has been canceled.", link: "/dashboard/settings/billing" }
            : { title: "Subscription paused", body: "Your subscription was suspended (usually a payment issue). Please review your billing.", link: "/dashboard/settings/billing" });
          await this.alertSuperAdmins(local.orgId, canceled ? "Subscription canceled" : "Subscription suspended (payment issue)", canceled ? "Subscription canceled" : "Subscription suspended", { Event: canceled ? "Canceled at PayPal" : "Suspended — payment failed", Gateway: `paypal${subId ? ` · ${subId}` : ""}` });
        }
      }
    } catch (e) {
      this.logger.warn(`paypal webhook ${type} failed: ${String(e).slice(0, 100)}`);
    }
  }
}
