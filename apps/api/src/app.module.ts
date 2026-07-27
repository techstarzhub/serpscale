import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { StorageModule } from "./storage/storage.module";
import { AuthModule } from "./auth/auth.module";
import { AuthzModule } from "./auth/authz.module";
import { EmailModule } from "./email/email.module";
import { UsersModule } from "./users/users.module";
import { ProjectsModule } from "./projects/projects.module";
import { CrawlModule } from "./crawl/crawl.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { SerpModule } from "./serp/serp.module";
import { TeamModule } from "./team/team.module";
import { ClientsModule } from "./clients/clients.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AccessRequestModule } from "./access-request/access-request.module";
import { AdminModule } from "./admin/admin.module";
import { BillingModule } from "./billing/billing.module";
import { AutofixModule } from "./autofix/autofix.module";
import { ContentModule } from "./content/content.module";
import { DashboardModule } from "./dashboard/dashboard.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limit: 120 requests / minute / IP. Auth + webhook routes tighten
    // this further with @Throttle / @SkipThrottle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    StorageModule,
    AuthModule,
    AuthzModule,
    EmailModule,
    UsersModule,
    ProjectsModule,
    CrawlModule,
    IntegrationsModule,
    SerpModule,
    TeamModule,
    ClientsModule,
    NotificationsModule,
    AccessRequestModule,
    AdminModule,
    BillingModule,
    AutofixModule,
    ContentModule,
    DashboardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
