import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { GatewayService } from "./gateway.service";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";
import { WebhooksController } from "./webhooks.controller";

@Module({
  imports: [PrismaModule],
  controllers: [BillingController, WebhooksController],
  providers: [GatewayService, BillingService],
  exports: [BillingService, GatewayService],
})
export class BillingModule {}
