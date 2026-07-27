import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import type { ICache } from "../domain/ports";

/** Redis-backed cache implementing the ICache port, with SET-NX single-flight locks. */
@Injectable()
export class RedisCache implements ICache, OnModuleDestroy {
  private readonly logger = new Logger(RedisCache.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    this.redis.on("error", (e) => this.logger.warn(`redis error: ${e.message}`));
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key).catch(() => null);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds).catch(() => {});
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key).catch(() => {});
  }

  async lock(key: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.redis.set(key, "1", "EX", ttlSeconds, "NX").catch(() => null);
    return res === "OK";
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => {});
  }
}
