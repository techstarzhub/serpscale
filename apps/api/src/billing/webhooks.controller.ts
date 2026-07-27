import { BadRequestException, Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { GatewayService } from "./gateway.service";
import { BillingService } from "./billing.service";

/** PUBLIC gateway webhooks (no JWT). Both gateways are signature-verified: Stripe
 *  against the raw body, PayPal via its verify-webhook-signature API + webhookId. */
@SkipThrottle()
@Controller("billing/webhooks")
export class WebhooksController {
  constructor(private readonly gw: GatewayService, private readonly billing: BillingService) {}

  @Post("stripe")
  @HttpCode(200)
  async stripe(@Req() req: RawBodyRequest<Request>, @Headers("stripe-signature") sig: string) {
    const stripe = await this.gw.stripe();
    const secret = await this.gw.stripeWebhookSecret();
    if (!stripe || !secret) throw new BadRequestException("Stripe not configured");
    if (!req.rawBody) throw new BadRequestException("Missing raw body");
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, secret);
    } catch {
      throw new BadRequestException("Invalid signature");
    }
    await this.billing.handleStripeEvent(event);
    return { received: true };
  }

  @Post("paypal")
  @HttpCode(200)
  async paypal(@Req() req: Request) {
    const body = (req as any).body;
    const ok = await this.billing.verifyPaypalWebhook(req.headers as Record<string, any>, body);
    if (!ok) throw new BadRequestException("Invalid PayPal webhook signature");
    await this.billing.handlePaypalEvent(body);
    return { received: true };
  }
}
