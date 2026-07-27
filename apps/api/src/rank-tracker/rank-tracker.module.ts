import { Module } from "@nestjs/common";
import { DataForSeoModule } from "../dataforseo/dataforseo.module";
import { RankTrackerService } from "./rank-tracker.service";
import { RankTrackerScheduler } from "./rank-tracker.scheduler";

@Module({
  imports: [DataForSeoModule],
  providers: [RankTrackerService, RankTrackerScheduler],
  exports: [RankTrackerService],
})
export class RankTrackerModule {}
