import { Module } from "@nestjs/common";
import { CrawlModule } from "../crawl/crawl.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { CopilotModule } from "../copilot/copilot.module";
import { ClientsModule } from "../clients/clients.module";
import { RankTrackerModule } from "../rank-tracker/rank-tracker.module";
import { ProjectsService } from "./projects.service";
import { ProjectsController } from "./projects.controller";

@Module({
  imports: [CrawlModule, IntegrationsModule, DataForSeoModule, CopilotModule, ClientsModule, RankTrackerModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
