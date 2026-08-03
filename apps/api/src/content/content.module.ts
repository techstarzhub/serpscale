import { Module } from "@nestjs/common";
import { CopilotModule } from "../copilot/copilot.module";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { ImagesModule } from "../images/images.module";
import { ProjectsModule } from "../projects/projects.module";
import { ContentService } from "./content.service";
import { ContentController } from "./content.controller";

// Content workflow: save researched keywords + generate blog drafts from them.
@Module({
  imports: [CopilotModule, DataForSeoModule, ImagesModule, ProjectsModule],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
