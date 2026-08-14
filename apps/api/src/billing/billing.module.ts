import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { GatewayService } from "./gateway.service";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";
import { WebhooksController } from "./webhooks.controller";
import { TrialReminderScheduler } from "./trial-reminder.scheduler";

@Module({
  imports: [PrismaModule],
  controllers: [BillingController, WebhooksController],
  providers: [GatewayService, BillingService, TrialReminderScheduler],
  exports: [BillingService, GatewayService],
})
export class BillingModule {}
