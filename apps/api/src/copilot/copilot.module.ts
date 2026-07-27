import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { CrawlModule } from "../crawl/crawl.module";
import { CopilotService } from "./copilot.service";
import { CopilotChatService } from "./copilot-chat.service";

@Module({
  imports: [IntegrationsModule, DataForSeoModule, CrawlModule],
  providers: [CopilotService, CopilotChatService],
  exports: [CopilotService, CopilotChatService],
})
export class CopilotModule {}
