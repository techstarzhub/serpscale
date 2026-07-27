/**
 * Ports (interfaces) the application depends on. Infrastructure implements them.
 * This is Dependency Inversion — business logic never imports Prisma/Redis/HTTP.
 */
import type { NormalizedSerp, RawProviderResult, SerpRequest } from "./serp.types";

// --- Providers (Strategy pattern) ---
export interface ISerpProvider {
  readonly name: string;
  readonly costPerQuery: number;
  isHealthy(): Promise<boolean>;
  fetch(req: SerpRequest): Promise<RawProviderResult>;
}

export interface ISerpNormalizer {
  /** The provider name this normalizer handles. */
  readonly provider: string;
  normalize(raw: RawProviderResult): NormalizedSerp;
}

// --- Persistence (Repository pattern) ---
export interface PersistedSnapshot {
  id: string;
  serp: NormalizedSerp;
}

export interface NewSnapshotInput {
  orgId: string;
  keywordId?: string;
  serp: NormalizedSerp;
}

export interface ISnapshotRepository {
  create(input: NewSnapshotInput): Promise<PersistedSnapshot>;
  findById(id: string): Promise<PersistedSnapshot | null>;
  findByContentHash(orgId: string, hash: string): Promise<PersistedSnapshot | null>;
  findLatestFresh(keywordId: string, maxAgeMs: number): Promise<PersistedSnapshot | null>;
}

export interface JobRecord {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "DEAD";
  snapshotId: string | null;
  provider: string | null;
  error: string | null;
}

export interface ISerpJobRepository {
  create(input: { orgId: string; keywordId?: string; idempotencyKey?: string }): Promise<JobRecord>;
  findById(id: string): Promise<JobRecord | null>;
  findByIdempotencyKey(key: string): Promise<JobRecord | null>;
  markRunning(id: string, provider: string): Promise<void>;
  markSucceeded(id: string, snapshotId: string): Promise<void>;
  markFailed(id: string, error: string, dead: boolean): Promise<void>;
}

// --- Credits / metering ---
export interface ICreditService {
  /** Atomically reserve credits or throw CreditExhaustedError. */
  reserve(orgId: string, units: number): Promise<void>;
  /** Convert a reservation into a spend + write a usage log. */
  commit(orgId: string, units: number, meta: { jobId?: string; action: string }): Promise<void>;
  /** Return reserved credits on failure. */
  refund(orgId: string, units: number): Promise<void>;
}

// --- Cross-cutting infra ports ---
export interface ICache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Single-flight lock (SET NX). Returns true if the lock was acquired. */
  lock(key: string, ttlSeconds: number): Promise<boolean>;
}

export interface IQueue {
  enqueue<T>(name: string, data: T, opts?: { jobId?: string; priority?: number }): Promise<string>;
}

export interface IClock {
  now(): Date;
}
