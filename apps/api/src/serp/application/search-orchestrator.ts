import { createHash } from "crypto";
import type {
  ICache,
  IClock,
  ICreditService,
  IQueue,
  ISerpJobRepository,
  ISerpNormalizer,
  ISnapshotRepository,
  PersistedSnapshot,
} from "../domain/ports";
import type { NormalizedSerp, SerpRequest } from "../domain/serp.types";
import { RankingService } from "../domain/ranking.service";
import { ProviderSelector } from "./provider-selector";
import type { RunSearchInput, RunSearchOutput } from "./dto";

export const SERP_FETCH_JOB = "serp.fetch";
const FRESHNESS_LOCK_TTL = 30;

/**
 * The orchestrating application service. `run()` is the synchronous API path
 * (cache → credits → enqueue). `fulfill()` is the async worker path
 * (provider → normalize → persist → cache → commit). One reason to change each.
 */
export class SearchOrchestrator {
  constructor(
    private readonly snapshots: ISnapshotRepository,
    private readonly jobs: ISerpJobRepository,
    private readonly selector: ProviderSelector,
    private readonly normalizers: Map<string, ISerpNormalizer>,
    private readonly cache: ICache,
    private readonly queue: IQueue,
    private readonly credits: ICreditService,
    private readonly ranking: RankingService,
    private readonly clock: IClock,
  ) {}

  private cacheKey(i: RunSearchInput): string {
    const q = createHash("sha1").update(i.query.trim().toLowerCase()).digest("hex").slice(0, 16);
    return `serp:snap:${i.engine}:${i.country}:${i.language}:${i.device}:${q}`;
  }

  private request(i: RunSearchInput): SerpRequest {
    return {
      query: i.query,
      engine: i.engine,
      locale: { country: i.country, language: i.language },
      device: i.device,
    };
  }

  private isFresh(serp: NormalizedSerp, maxAgeSeconds: number): boolean {
    if (maxAgeSeconds === 0) return false;
    const age = (this.clock.now().getTime() - new Date(serp.fetchedAt).getTime()) / 1000;
    return age <= maxAgeSeconds;
  }

  /** API path: return a fresh cached snapshot, or enqueue an async fetch. */
  async run(input: RunSearchInput): Promise<RunSearchOutput> {
    const key = this.cacheKey(input);

    const cached = await this.cache.get<NormalizedSerp>(key);
    if (cached && this.isFresh(cached, input.freshnessSeconds)) {
      return { status: "cached", snapshot: cached };
    }

    // Idempotency: a client retry with the same key returns the same job.
    if (input.idempotencyKey) {
      const existing = await this.jobs.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return { status: "queued", jobId: existing.id };
    }

    await this.credits.reserve(input.orgId, 1); // atomic; throws if exhausted

    const job = await this.jobs.create({
      orgId: input.orgId,
      keywordId: input.keywordId,
      idempotencyKey: input.idempotencyKey,
    });

    try {
      await this.queue.enqueue(SERP_FETCH_JOB, { input, jobId: job.id }, { jobId: job.id });
    } catch (err) {
      await this.credits.refund(input.orgId, 1);
      await this.jobs.markFailed(job.id, "Failed to enqueue", false);
      throw err;
    }

    return { status: "queued", jobId: job.id };
  }

  /**
   * Worker path: fetch, normalize, dedupe, persist, cache, commit. Idempotent —
   * a duplicated job re-uses the identical snapshot via the content hash.
   */
  async fulfill(input: RunSearchInput, jobId: string): Promise<PersistedSnapshot> {
    const provider = await this.selector.select();
    await this.jobs.markRunning(jobId, provider.name);

    const raw = await provider.fetch(this.request(input));
    const normalizer = this.normalizers.get(provider.name);
    if (!normalizer) throw new Error(`No normalizer registered for provider "${provider.name}"`);
    const serp = normalizer.normalize(raw);

    // Dedupe: if an identical SERP already exists, reuse it (no duplicate rows).
    const existing = await this.snapshots.findByContentHash(input.orgId, serp.metadata.contentHash);
    const persisted =
      existing ??
      (await this.snapshots.create({ orgId: input.orgId, keywordId: input.keywordId, serp }));

    await this.cache.set(this.cacheKey(input), serp, Math.max(input.freshnessSeconds, 300));
    await this.jobs.markSucceeded(jobId, persisted.id);
    await this.credits.commit(input.orgId, 1, { jobId, action: "search" });

    return persisted;
  }

  /** Called by the processor when a job exhausts retries (moves to DLQ). */
  async onDead(input: RunSearchInput, jobId: string, error: string): Promise<void> {
    await this.credits.refund(input.orgId, 1);
    await this.jobs.markFailed(jobId, error, true);
  }

  /** Single-flight guard so a stampede triggers one provider call, not N. */
  async acquireFetchLock(input: RunSearchInput): Promise<boolean> {
    return this.cache.lock(`${this.cacheKey(input)}:lock`, FRESHNESS_LOCK_TTL);
  }
}
