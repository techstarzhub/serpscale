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

  // Resolve a gateway's active key set from its test/live config. Supports the
  // new shape ({ mode, testKeys, liveKeys }) and the legacy flat shape.
  private resolve(gw: any): { keys: any; live: boolean } {
    if (!gw) return { keys: {}, live: false };
    if (gw.testKeys || gw.liveKeys) {
      const live = gw.mode === "live";
      return { keys: (live ? gw.liveKeys : gw.testKeys) ?? {}, live };
    }
    // Legacy flat keys (PayPal used a `live` boolean).
    return { keys: gw, live: gw.live === true };
  }

  private async stripeKeys(): Promise<any> {
    return this.resolve((await this.config())?.stripe).keys;
  }

  async stripe(): Promise<Stripe | null> {
    const key = (await this.stripeKeys())?.secretKey;
    if (!key) return null;
    if (this.stripeClient && this.stripeKeyUsed === key) return this.stripeClient;
    this.stripeClient = new Stripe(key);
    this.stripeKeyUsed = key;
    return this.stripeClient;
  }

  async stripeWebhookSecret(): Promise<string> {
    return (await this.stripeKeys())?.webhookSecret ?? "";
  }

  async paypal(): Promise<{ clientId?: string; clientSecret?: string; webhookId?: string; live?: boolean; base: string }> {
    const { keys, live } = this.resolve((await this.config())?.paypal);
    return {
      clientId: keys.clientId,
      clientSecret: keys.clientSecret,
      webhookId: keys.webhookId,
      live,
      base: live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
    };
  }
}
