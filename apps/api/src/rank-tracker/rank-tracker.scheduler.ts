import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { RankTrackerService } from "./rank-tracker.service";

const QUEUE = "rank-tracker";

function redisConnection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL || "redis://127.0.0.1:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: url.password } : {}),
  };
}

/**
 * BullMQ-driven scheduler: a repeatable daily job re-checks the Google rank of
 * every tracked keyword, building rank history automatically. Runs in-process
 * against the shared Redis (same infra the SERP module uses).
 */
@Injectable()
export class RankTrackerScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RankTrackerScheduler.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly tracker: RankTrackerService) {}

  async onModuleInit() {
    // Redis is optional for local dev — if it's unavailable, skip scheduling
    // (manual "refresh now" still works) rather than crashing the app.
    try {
      const connection = redisConnection();
      this.queue = new Queue(QUEUE, { connection });
      // Idempotent: adding the same repeatable key just keeps one schedule.
      await this.queue.add(
        "daily-rank-check",
        {},
        { repeat: { pattern: "0 3 * * *" }, removeOnComplete: true, removeOnFail: 20 },
      );
      // In Standard (queue) mode the daily job only POSTS cheap SERP tasks; a
      // separate poller drains the finished results every few minutes.
      if (process.env.RANK_TRACKER_STANDARD === "1") {
        await this.queue.add(
          "drain-serp-tasks",
          {},
          { repeat: { pattern: "*/5 * * * *" }, removeOnComplete: true, removeOnFail: 20 },
        );
      }
      this.worker = new Worker(
        QUEUE,
        async (job) => {
          if (job.name === "drain-serp-tasks") await this.tracker.drainSerpTasks();
          else await this.tracker.checkDue(500);
        },
        { connection, concurrency: 1 },
      );
      this.worker.on("failed", (_job, err) => this.logger.warn(`rank-tracker job failed: ${String(err).slice(0, 120)}`));
      this.logger.log("rank tracker scheduled (daily 03:00)");
    } catch (e) {
      this.logger.warn(`rank tracker scheduler not started (Redis unavailable?): ${String(e).slice(0, 120)}`);
    }
  }

  async onModuleDestroy() {
    await this.worker?.close().catch(() => {});
    await this.queue?.close().catch(() => {});
  }
}
