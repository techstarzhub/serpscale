import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { CrawlModule } from "../crawl/crawl.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { RankTrackerModule } from "../rank-tracker/rank-tracker.module";
import { CopilotModule } from "../copilot/copilot.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

// Aggregates every campaign's cached metrics into one payload for the dashboard.
// PrismaService + PermissionsService are global (PrismaModule / AuthzModule).
@Module({
  imports: [ProjectsModule, CrawlModule, IntegrationsModule, DataForSeoModule, RankTrackerModule, CopilotModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
