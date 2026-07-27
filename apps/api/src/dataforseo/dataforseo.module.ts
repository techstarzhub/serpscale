import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DataForSeoService } from "./dataforseo.service";

/**
 * DataForSEO-backed data (backlinks, keyword ideas, ranked keywords). Heavily
 * cached so each feature costs a fraction of a cent per project per week.
 */
@Module({
  imports: [PrismaModule],
  providers: [DataForSeoService],
  exports: [DataForSeoService],
})
export class DataForSeoModule {}
