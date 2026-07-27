import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service";
import { GatewayService } from "./gateway.service";
import { NotificationsService } from "../notifications/notifications.service";

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
  ) {}

  publicPlans() {
    return this.prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" } });
  }

  subscription(orgId: string) {
    return this.prisma.subscription.findUnique({ where: { orgId }, include: { plan: true } });
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
    const lim = (k: string) => (Number(limits[k]) > 0 ? Number(limits[k]) : null); // null = unlimited/not set
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
      this.logger.warn("PayPal webhookId not configured — skipping signature verification");
      return true;
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
  async createCheckout(orgId: string, planId: string, gateway: string): Promise<{ url: string }> {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new NotFoundException("Plan not found");
    // Free plan — no gateway round-trip; activate immediately.
    if ((plan.priceCents ?? 0) <= 0) {
      await this.activate(orgId, plan.id, "manual", null, null, null);
      return { url: `${WEB()}/settings/billing?activated=1` };
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
      success_url: `${WEB()}/settings/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${WEB()}/settings/billing?canceled=1`,
    });
    return { url: session.url ?? `${WEB()}/settings/billing` };
  }

  // ------------------------------------------------------------------ PayPal REST
  private async ppToken(): Promise<{ token: string; base: string }> {
    const { clientId, clientSecret, base } = await this.gw.paypal();
    if (!clientId || !clientSecret) throw new BadRequestException("PayPal is not configured");
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const data: any = await res.json();
    if (!data.access_token) throw new BadRequestException("PayPal auth failed");
    return { token: data.access_token, base };
  }
  private async pp(path: string, method: string, body: any, token: string, base: string): Promise<any> {
    const res = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return res.json().catch(() => ({}));
  }

  private async createPaypalSubscription(orgId: string, plan: any): Promise<{ url: string }> {
    const { token, base } = await this.ppToken();
    let ppPlanId: string | null = plan.paypalPlanId;
    if (!ppPlanId) {
      const product = await this.pp("/v1/catalogs/products", "POST", { name: plan.name, type: "SERVICE" }, token, base);
      if (!product?.id) throw new BadRequestException("PayPal product creation failed. Check your PayPal credentials.");
      const planRes = await this.pp("/v1/billing/plans", "POST", {
        product_id: product.id,
        name: plan.name,
        billing_cycles: [{
          frequency: { interval_unit: plan.interval === "year" ? "YEAR" : "MONTH", interval_count: 1 },
          tenure_type: "REGULAR", sequence: 1, total_cycles: 0,
          pricing_scheme: { fixed_price: { value: (plan.priceCents / 100).toFixed(2), currency_code: String(plan.currency).toUpperCase() } },
        }],
        payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
      }, token, base);
      ppPlanId = planRes.id;
      if (!ppPlanId) throw new BadRequestException("PayPal plan creation failed. Check your PayPal credentials.");
      await this.prisma.plan.update({ where: { id: plan.id }, data: { paypalPlanId: ppPlanId } });
    }
    const sub = await this.pp("/v1/billing/subscriptions", "POST", {
      plan_id: ppPlanId,
      custom_id: orgId,
      application_context: { return_url: `${WEB()}/settings/billing/success?pp=1`, cancel_url: `${WEB()}/settings/billing?canceled=1` },
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
    const data: any = { planId, status: "ACTIVE", gateway, gatewayCustomerId: customerId, gatewaySubscriptionId: subscriptionId, currentPeriodEnd: periodEnd };
    const existing = await this.prisma.subscription.findUnique({ where: { orgId } });
    if (existing) await this.prisma.subscription.update({ where: { orgId }, data });
    else await this.prisma.subscription.create({ data: { orgId, ...data } });
    await this.prisma.transaction.updateMany({ where: { orgId, planId, status: "pending", gateway }, data: { status: "succeeded" } });
    const plan = await this.prisma.plan.findUnique({ where: { id: planId }, select: { name: true } });
    await this.notifyOrgAdmins(orgId, {
      title: "Subscription active",
      body: `Your ${plan?.name ?? "plan"} subscription is active.`,
      link: "/dashboard/settings/billing",
    });
  }

  // Notify every active admin of an org about a billing event (honours their prefs).
  private async notifyOrgAdmins(orgId: string, payload: { title: string; body: string; link: string }) {
    const admins = await this.prisma.user.findMany({ where: { orgId, role: "ADMIN", isActive: true }, select: { id: true } });
    await this.notifications.notifyMany(admins.map((a) => a.id), "billing", payload);
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
    await this.prisma.subscription.update({ where: { orgId }, data: { status: "CANCELED" } });
    await this.notifyOrgAdmins(orgId, {
      title: "Subscription canceled",
      body: "Your subscription was canceled. Access continues until the period ends.",
      link: "/dashboard/settings/billing",
    });
    return { ok: true };
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
        const txn = await this.prisma.transaction.findFirst({ where: { orgId, gateway: "paypal", status: "pending" }, orderBy: { createdAt: "desc" } });
        await this.activate(orgId, txn?.planId ?? null, "paypal", null, subId ?? null, null);
      } else if (type === "PAYMENT.SALE.COMPLETED" && subId) {
        const local = await this.prisma.subscription.findFirst({ where: { gatewaySubscriptionId: subId } });
        if (local) {
          await this.prisma.subscription.update({ where: { orgId: local.orgId }, data: { status: "ACTIVE" } });
          await this.notifyOrgAdmins(local.orgId, { title: "Payment received", body: "Your subscription renewed successfully.", link: "/dashboard/settings/billing" });
        }
      } else if ((type === "BILLING.SUBSCRIPTION.CANCELLED" || type === "BILLING.SUBSCRIPTION.SUSPENDED") && subId) {
        const local = await this.prisma.subscription.findFirst({ where: { gatewaySubscriptionId: subId } });
        if (local) {
          const canceled = type.includes("CANCELLED");
          await this.prisma.subscription.update({ where: { orgId: local.orgId }, data: { status: canceled ? "CANCELED" : "PAST_DUE" } });
          await this.notifyOrgAdmins(local.orgId, canceled
            ? { title: "Subscription ended", body: "Your subscription has been canceled.", link: "/dashboard/settings/billing" }
            : { title: "Subscription paused", body: "Your subscription was suspended (usually a payment issue). Please review your billing.", link: "/dashboard/settings/billing" });
        }
      }
    } catch (e) {
      this.logger.warn(`paypal webhook ${type} failed: ${String(e).slice(0, 100)}`);
    }
  }
}
