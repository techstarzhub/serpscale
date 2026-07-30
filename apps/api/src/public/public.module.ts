import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { CrawlModule } from "../crawl/crawl.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { RankTrackerModule } from "../rank-tracker/rank-tracker.module";
import { PublicController } from "./public.controller";
import { PublicFormsController } from "./public-forms.controller";
import { PublicFormsService } from "./public-forms.service";
import { CaptchaService } from "./captcha.service";

// Unauthenticated campaign share view + the marketing site's public forms.
// PrismaService and EmailService come from their @Global modules.
@Module({
  imports: [ProjectsModule, CrawlModule, IntegrationsModule, DataForSeoModule, RankTrackerModule],
  controllers: [PublicController, PublicFormsController],
  providers: [PublicFormsService, CaptchaService],
})
export class PublicModule {}
