import { SearchOrchestrator } from "./search-orchestrator";
import { ProviderSelector } from "./provider-selector";
import { RankingService } from "../domain/ranking.service";
import { CreditExhaustedError } from "../domain/errors";
import { MockSerpProvider } from "../infrastructure/providers/mock.provider";
import { MockNormalizer } from "../infrastructure/normalizers/mock.normalizer";
import type {
  ICache, IClock, ICreditService, IQueue, ISerpJobRepository, ISnapshotRepository,
  JobRecord, NewSnapshotInput, PersistedSnapshot,
} from "../domain/ports";
import type { NormalizedSerp } from "../domain/serp.types";
import type { RunSearchInput } from "./dto";

// ---- In-memory test doubles (no I/O — fully deterministic) ----
class FakeCache implements ICache {
  store = new Map<string, unknown>();
  locks = new Set<string>();
  async get<T>(k: string) { return (this.store.get(k) as T) ?? null; }
  async set<T>(k: string, v: T) { this.store.set(k, v); }
  async del(k: string) { this.store.delete(k); }
  async lock(k: string) { if (this.locks.has(k)) return false; this.locks.add(k); return true; }
}
class FakeQueue implements IQueue {
  jobs: { name: string; data: unknown }[] = [];
  async enqueue<T>(name: string, data: T, opts?: { jobId?: string }) { this.jobs.push({ name, data }); return opts?.jobId ?? "job-1"; }
}
class FakeSnapshots implements ISnapshotRepository {
  byId = new Map<string, PersistedSnapshot>();
  byHash = new Map<string, PersistedSnapshot>();
  seq = 0;
  async create(input: NewSnapshotInput) { const p = { id: `snap-${++this.seq}`, serp: input.serp }; this.byId.set(p.id, p); this.byHash.set(`${input.orgId}:${input.serp.metadata.contentHash}`, p); return p; }
  async findById(id: string) { return this.byId.get(id) ?? null; }
  async findByContentHash(orgId: string, hash: string) { return this.byHash.get(`${orgId}:${hash}`) ?? null; }
  async findLatestFresh() { return null; }
}
class FakeJobs implements ISerpJobRepository {
  jobs = new Map<string, JobRecord>();
  byKey = new Map<string, string>();
  seq = 0;
  async create(i: { orgId: string; idempotencyKey?: string }) { const id = `job-${++this.seq}`; const r: JobRecord = { id, status: "QUEUED", snapshotId: null, provider: null, error: null }; this.jobs.set(id, r); if (i.idempotencyKey) this.byKey.set(i.idempotencyKey, id); return r; }
  async findById(id: string) { return this.jobs.get(id) ?? null; }
  async findByIdempotencyKey(k: string) { const id = this.byKey.get(k); return id ? this.jobs.get(id)! : null; }
  async markRunning(id: string, p: string) { const j = this.jobs.get(id)!; j.status = "RUNNING"; j.provider = p; }
  async markSucceeded(id: string, s: string) { const j = this.jobs.get(id)!; j.status = "SUCCEEDED"; j.snapshotId = s; }
  async markFailed(id: string, e: string, dead: boolean) { const j = this.jobs.get(id)!; j.status = dead ? "DEAD" : "FAILED"; j.error = e; }
}
class FakeCredits implements ICreditService {
  balance: number; reserved = 0; committed = 0; refunded = 0;
  constructor(balance = 100) { this.balance = balance; }
  async reserve(_o: string, u: number) { if (this.balance - this.reserved < u) throw new CreditExhaustedError("org"); this.reserved += u; }
  async commit(_o: string, u: number) { this.committed += u; this.reserved -= u; this.balance -= u; }
  async refund(_o: string, u: number) { this.refunded += u; this.reserved -= u; }
}
class FixedClock implements IClock { constructor(private t: Date) {} now() { return this.t; } setTime(t: Date) { this.t = t; } }

function build(overrides?: { credits?: FakeCredits; clock?: FixedClock }) {
  const snapshots = new FakeSnapshots();
  const jobs = new FakeJobs();
  const cache = new FakeCache();
  const queue = new FakeQueue();
  const credits = overrides?.credits ?? new FakeCredits();
  const clock = overrides?.clock ?? new FixedClock(new Date("2026-07-24T12:00:00Z"));
  const selector = new ProviderSelector([new MockSerpProvider()]);
  const normalizers = new Map([["mock", new MockNormalizer()]]);
  const orch = new SearchOrchestrator(snapshots, jobs, selector, normalizers, cache, queue, credits, new RankingService(), clock);
  return { orch, snapshots, jobs, cache, queue, credits, clock };
}

const input: RunSearchInput = { orgId: "org-1", query: "seo tools", engine: "google", country: "US", language: "en", device: "desktop", freshnessSeconds: 3600 };

describe("SearchOrchestrator.run", () => {
  it("returns a fresh cached snapshot without touching credits or the queue", async () => {
    const { orch, cache, credits, queue } = build();
    const cached: NormalizedSerp = { ...(await freshSerp()), fetchedAt: new Date("2026-07-24T11:59:00Z").toISOString() };
    // seed cache under the exact key the orchestrator computes
    const key = (orch as any).cacheKey(input);
    cache.store.set(key, cached);

    const out = await orch.run(input);
    expect(out.status).toBe("cached");
    expect(credits.reserved).toBe(0);
    expect(queue.jobs).toHaveLength(0);
  });

  it("reserves a credit and enqueues a job on a cache miss", async () => {
    const { orch, credits, queue, jobs } = build();
    const out = await orch.run(input);
    expect(out.status).toBe("queued");
    expect(credits.reserved).toBe(1);
    expect(queue.jobs).toHaveLength(1);
    expect(jobs.jobs.size).toBe(1);
  });

  it("is idempotent — the same idempotencyKey returns the same job", async () => {
    const { orch, queue } = build();
    const withKey = { ...input, idempotencyKey: "abc" };
    const a = await orch.run(withKey);
    const b = await orch.run(withKey);
    expect(a).toEqual(b);
    expect(queue.jobs).toHaveLength(1); // enqueued once
  });

  it("throws CreditExhaustedError when the balance is empty", async () => {
    const { orch } = build({ credits: new FakeCredits(0) });
    await expect(orch.run(input)).rejects.toBeInstanceOf(CreditExhaustedError);
  });

  it("treats an expired cache entry as a miss", async () => {
    const { orch, cache, queue } = build();
    const key = (orch as any).cacheKey(input);
    cache.store.set(key, { ...(await freshSerp()), fetchedAt: new Date("2026-07-24T10:00:00Z").toISOString() }); // 2h old > 1h freshness
    const out = await orch.run(input);
    expect(out.status).toBe("queued");
    expect(queue.jobs).toHaveLength(1);
  });
});

describe("SearchOrchestrator.fulfill", () => {
  it("fetches, persists, caches and commits the credit", async () => {
    const { orch, snapshots, cache, credits } = build();
    const enq = await orch.run(input);
    const jobId = enq.status === "queued" ? enq.jobId : "";
    const persisted = await orch.fulfill(input, jobId);

    expect(persisted.id).toMatch(/^snap-/);
    expect(snapshots.byId.size).toBe(1);
    expect(cache.store.get((orch as any).cacheKey(input))).toBeTruthy();
    expect(credits.committed).toBe(1);
  });

  it("dedupes identical SERPs via the content hash (no duplicate snapshot)", async () => {
    const { orch, snapshots, jobs } = build();
    const j1 = await orch.run(input);
    await orch.fulfill(input, j1.status === "queued" ? j1.jobId : "");
    // a second job for the same query → same content hash → snapshot is reused
    const j2 = await jobs.create({ orgId: input.orgId });
    await orch.fulfill(input, j2.id);
    expect(snapshots.byId.size).toBe(1);
    expect(jobs.jobs.get(j2.id)?.snapshotId).toBe("snap-1"); // points at the reused snapshot
  });
});

async function freshSerp(): Promise<NormalizedSerp> {
  const raw = await new MockSerpProvider().fetch({ query: input.query, engine: "google", locale: { country: "US", language: "en" }, device: "desktop" });
  return new MockNormalizer().normalize(raw);
}
