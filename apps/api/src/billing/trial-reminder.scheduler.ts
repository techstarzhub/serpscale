import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../notifications/notifications.service";

const WEB = () => process.env.WEB_ORIGIN || "http://localhost:3000";

/**
 * Sends proactive trial-ending reminder emails + in-app notifications.
 * Two buckets: "3 days left" and "1 day left". Each bucket is sent at most
 * once per org (deduped via DataCache) so restart-loops can't spam.
 */
@Injectable()
export class TrialReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrialReminderScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private readonly INTERVAL_MS = 6 * 60 * 60_000; // sweep every 6h

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    setTimeout(() => this.sweep().catch(() => {}), 60_000); // first run 1 min after boot
    this.timer = setInterval(() => this.sweep().catch(() => {}), this.INTERVAL_MS);
    this.logger.log("trial reminder scheduler started (every 6h)");
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep() {
    const now = Date.now();
    const trials = await this.prisma.subscription.findMany({
      where: { status: "TRIALING" },
      select: { orgId: true, currentPeriodEnd: true, planId: true },
    });

    for (const sub of trials) {
      if (!sub.currentPeriodEnd) continue;
      const msLeft = new Date(sub.currentPeriodEnd).getTime() - now;
      const daysLeft = msLeft / (24 * 3600_000);

      // Only act within 0–4 days before expiry (negative = already expired)
      if (daysLeft > 4 || daysLeft < 0) continue;

      // Two reminder buckets: ≤1.5d remaining → "1 day" email; else → "3 days" email
      const bucket = daysLeft <= 1.5 ? "1d" : "3d";
      const cacheKey = `trial-remind:${bucket}:${sub.orgId}`;

      const already = await this.prisma.dataCache.findUnique({ where: { key: cacheKey } });
      if (already) continue;

      const admins = await this.prisma.user.findMany({
        where: { orgId: sub.orgId, role: "ADMIN", isActive: true },
        select: { id: true, email: true },
      });
      if (!admins.length) continue;

      const plan = sub.planId
        ? await this.prisma.plan.findUnique({ where: { id: sub.planId }, select: { name: true } })
        : null;
      const daysText = bucket === "1d" ? "tomorrow" : "in 3 days";
      const daysNum = bucket === "1d" ? "1" : "3";
      const endDate = new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      await Promise.all(
        admins.map((a) =>
          this.email
            .sendBranded(
              a.email,
              `Your free trial ends ${daysText}`,
              `Your free trial ends ${daysText}`,
              `Your <b>${plan?.name ?? "trial"}</b> free trial expires on <b>${endDate}</b> (${daysNum} day${daysNum === "1" ? "" : "s"} left).<br><br>Subscribe before your trial ends to keep uninterrupted access to all features.`,
              { label: "Choose a plan", url: `${WEB()}/dashboard/settings/billing` },
              sub.orgId,
            )
            .catch(() => {}),
        ),
      );

      await this.notifications.notifyMany(
        admins.map((a) => a.id),
        "billing",
        {
          title: `Trial ends ${daysText}`,
          body: `Your ${plan?.name ?? ""} trial expires on ${endDate}. Subscribe now to keep access.`,
          link: "/dashboard/settings/billing",
        },
      );

      // Mark sent so this bucket isn't fired again (even across restarts)
      await this.prisma.dataCache
        .create({ data: { key: cacheKey, payload: { sentAt: new Date().toISOString() } } })
        .catch(() => {});

      this.logger.log(`trial reminder (${bucket}) → org ${sub.orgId}`);
    }
  }
}
