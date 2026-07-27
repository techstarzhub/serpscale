import { Module } from "@nestjs/common";
import { CrawlService } from "./crawl.service";
import { CrawlsController } from "./crawl.controller";

@Module({
  controllers: [CrawlsController],
  providers: [CrawlService],
  exports: [CrawlService],
})
export class CrawlModule {}
