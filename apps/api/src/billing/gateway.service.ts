import { Injectable } from "@nestjs/common";
import Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service";

/** Reads the super-admin gateway keys (PlatformSetting "payment_gateways") and
 *  lazily builds the Stripe client + PayPal REST config from them. */
@Injectable()
export class GatewayService {
  constructor(private readonly prisma: PrismaService) {}
  private stripeClient: Stripe | null = null;
  private stripeKeyUsed = "";

  async config(): Promise<any> {
    const s = await this.prisma.platformSetting.findUnique({ where: { key: "payment_gateways" } }).catch(() => null);
    return (s?.value as any) ?? {};
  }

  async active(): Promise<string> {
    return (await this.config())?.active ?? "";
  }

  async stripe(): Promise<Stripe | null> {
    const key = (await this.config())?.stripe?.secretKey;
    if (!key) return null;
    if (this.stripeClient && this.stripeKeyUsed === key) return this.stripeClient;
    this.stripeClient = new Stripe(key);
    this.stripeKeyUsed = key;
    return this.stripeClient;
  }

  async stripeWebhookSecret(): Promise<string> {
    return (await this.config())?.stripe?.webhookSecret ?? "";
  }

  async paypal(): Promise<{ clientId?: string; clientSecret?: string; webhookId?: string; live?: boolean; base: string }> {
    const pp = (await this.config())?.paypal ?? {};
    return { ...pp, base: pp.live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com" };
  }
}
