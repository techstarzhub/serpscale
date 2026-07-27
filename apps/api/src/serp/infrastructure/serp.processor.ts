import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Worker, UnrecoverableError, type Job } from "bullmq";
import { SearchOrchestrator } from "../application/search-orchestrator";
import type { RunSearchInput } from "../application/dto";
import { DomainError } from "../domain/errors";
import { SERP_TOKENS } from "../serp.tokens";
import { SERP_QUEUE_NAME } from "../serp.tokens";
import { BullQueue, redisConnection } from "./bull-queue";
import { PrismaService } from "../../prisma/prisma.service";

interface FetchJobData {
  input: RunSearchInput;
  jobId: string;
}

/**
 * The worker. Runs the async fetch → normalize → persist pipeline, with a
 * concurrency pool, exponential retries, and dead-letter handling on give-up.
 */
@Injectable()
export class SerpProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SerpProcessor.name);
  private worker?: Worker<FetchJobData>;

  constructor(
    @Inject(SERP_TOKENS.Orchestrator) private readonly orchestrator: SearchOrchestrator,
    private readonly bull: BullQueue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Recover jobs left RUNNING by a previous crash so they never stay stuck.
    await this.prisma.serpJob
      .updateMany({ where: { status: "RUNNING" }, data: { status: "FAILED", error: "Interrupted by a restart" } })
      .catch(() => {});
    if (process.env.SERP_WORKER_DISABLED === "true") return;
    this.worker = new Worker<FetchJobData>(
      SERP_QUEUE_NAME,
      async (job) => this.handle(job),
      { connection: redisConnection(), concurrency: Number(process.env.SERP_WORKER_CONCURRENCY || 8) },
    );

    this.worker.on("completed", (job) => this.logger.log(`job ${job.id} completed`));
    this.worker.on("failed", async (job, err) => {
      if (!job) return;
      const isFinal = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (isFinal) {
        await this.bull.toDeadLetter(job.data, err.message).catch(() => {});
        await this.orchestrator.onDead(job.data.input, job.data.jobId, err.message).catch(() => {});
      }
    });
  }

  private async handle(job: Job<FetchJobData>): Promise<void> {
    const { input, jobId } = job.data;
    try {
      await this.orchestrator.fulfill(input, jobId);
    } catch (err) {
      // Permanent domain errors must not be retried — fail fast into the DLQ.
      if (err instanceof DomainError && !err.retryable) {
        throw new UnrecoverableError(err.message);
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => {});
  }
}
