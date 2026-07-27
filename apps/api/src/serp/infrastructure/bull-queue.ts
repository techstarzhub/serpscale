import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue, type ConnectionOptions } from "bullmq";
import type { IQueue } from "../domain/ports";
import { SERP_DLQ_NAME, SERP_QUEUE_NAME } from "../serp.tokens";

export function redisConnection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL || "redis://127.0.0.1:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    // BullMQ requires this to be null for blocking worker commands.
    maxRetriesPerRequest: null,
  };
}

/** BullMQ-backed IQueue. Owns the primary + dead-letter queues. */
@Injectable()
export class BullQueue implements IQueue, OnModuleDestroy {
  private readonly logger = new Logger(BullQueue.name);
  readonly queue: Queue;
  readonly dlq: Queue;

  constructor() {
    const connection = redisConnection();
    this.queue = new Queue(SERP_QUEUE_NAME, { connection });
    this.dlq = new Queue(SERP_DLQ_NAME, { connection });
  }

  async enqueue<T>(name: string, data: T, opts?: { jobId?: string; priority?: number }): Promise<string> {
    const job = await this.queue.add(name, data, {
      jobId: opts?.jobId, // idempotent enqueue — same id is not re-added
      priority: opts?.priority,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: false, // keep for forensics; DLQ is separate
    });
    return job.id!;
  }

  /** Park a permanently-failed job in the dead-letter queue. */
  async toDeadLetter(payload: unknown, error: string): Promise<void> {
    await this.dlq.add("dead", { payload, error, deadAt: new Date().toISOString() }, { removeOnComplete: false });
    this.logger.warn(`job moved to DLQ: ${error}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close().catch(() => {});
    await this.dlq.close().catch(() => {});
  }
}
