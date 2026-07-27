import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SERP_TOKENS } from "./serp.tokens";

// domain / application
import { RankingService } from "./domain/ranking.service";
import { ProviderSelector } from "./application/provider-selector";
import { SearchOrchestrator } from "./application/search-orchestrator";
import type { ISerpNormalizer, ISerpProvider } from "./domain/ports";

// infrastructure
import { PrismaSnapshotRepository } from "./infrastructure/prisma-snapshot.repository";
import { PrismaJobRepository } from "./infrastructure/prisma-job.repository";
import { PrismaCreditService } from "./infrastructure/prisma-credit.service";
import { RedisCache } from "./infrastructure/redis-cache";
import { BullQueue } from "./infrastructure/bull-queue";
import { SystemClock } from "./infrastructure/clock";
import { SerpProcessor } from "./infrastructure/serp.processor";
import { MockSerpProvider } from "./infrastructure/providers/mock.provider";
import { MockNormalizer } from "./infrastructure/normalizers/mock.normalizer";
import { GoogleScraperProvider } from "./infrastructure/providers/google-scraper.provider";
import { GoogleNormalizer } from "./infrastructure/normalizers/google.normalizer";
import { DataForSeoProvider } from "./infrastructure/providers/dataforseo.provider";
import { DataForSeoNormalizer } from "./infrastructure/normalizers/dataforseo.normalizer";

// interface
import { SerpController } from "./interface/serp.controller";

/**
 * Composition root for the SERP module. This is the ONLY place concrete
 * implementations are bound to their ports — swap any adapter here without
 * touching domain/application code.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SerpController],
  providers: [
    RankingService,
    BullQueue,
    SerpProcessor,

    // Ports → concrete adapters
    { provide: SERP_TOKENS.SnapshotRepository, useClass: PrismaSnapshotRepository },
    { provide: SERP_TOKENS.JobRepository, useClass: PrismaJobRepository },
    { provide: SERP_TOKENS.CreditService, useClass: PrismaCreditService },
    { provide: SERP_TOKENS.Cache, useClass: RedisCache },
    { provide: SERP_TOKENS.Clock, useClass: SystemClock },
    { provide: SERP_TOKENS.Queue, useExisting: BullQueue },

    // Provider registry (add real providers here — OCP). Scraper is primary;
    // the mock only joins the pool when SERP_ALLOW_MOCK=true (tests / offline dev).
    MockSerpProvider,
    GoogleScraperProvider,
    DataForSeoProvider,
    {
      provide: SERP_TOKENS.Providers,
      useFactory: (dfs: DataForSeoProvider, scraper: GoogleScraperProvider, mock: MockSerpProvider): ISerpProvider[] => {
        // Priority: DataForSEO (reliable, no proxy/CAPTCHA) → self-hosted scraper
        // (if enabled with good IPs) → mock (offline/dev fallback).
        const providers: ISerpProvider[] = [];
        if (process.env.DATAFORSEO_LOGIN) providers.push(dfs);
        if (process.env.SERP_SCRAPER_ENABLED === "true") providers.push(scraper);
        if (providers.length === 0 || process.env.SERP_ALLOW_MOCK === "true") providers.push(mock);
        return providers;
      },
      inject: [DataForSeoProvider, GoogleScraperProvider, MockSerpProvider],
    },
    {
      provide: SERP_TOKENS.Normalizers,
      useFactory: (): Map<string, ISerpNormalizer> =>
        new Map<string, ISerpNormalizer>([
          ["dataforseo", new DataForSeoNormalizer()],
          ["google-scraper", new GoogleNormalizer()],
          ["mock", new MockNormalizer()],
        ]),
    },

    // Orchestrator — assembled from ports (pure application service)
    {
      provide: SERP_TOKENS.Orchestrator,
      useFactory: (snapshots, jobs, providers, normalizers, cache, queue, credits, ranking, clock) =>
        new SearchOrchestrator(snapshots, jobs, new ProviderSelector(providers), normalizers, cache, queue, credits, ranking, clock),
      inject: [
        SERP_TOKENS.SnapshotRepository,
        SERP_TOKENS.JobRepository,
        SERP_TOKENS.Providers,
        SERP_TOKENS.Normalizers,
        SERP_TOKENS.Cache,
        SERP_TOKENS.Queue,
        SERP_TOKENS.CreditService,
        RankingService,
        SERP_TOKENS.Clock,
      ],
    },
  ],
})
export class SerpModule {}
