/** DI tokens for the domain/application ports (wired in serp.module.ts). */
export const SERP_TOKENS = {
  SnapshotRepository: Symbol("ISnapshotRepository"),
  JobRepository: Symbol("ISerpJobRepository"),
  CreditService: Symbol("ICreditService"),
  Cache: Symbol("ICache"),
  Queue: Symbol("IQueue"),
  Clock: Symbol("IClock"),
  Providers: Symbol("ISerpProvider[]"),
  Normalizers: Symbol("Map<string,ISerpNormalizer>"),
  Orchestrator: Symbol("SearchOrchestrator"),
} as const;

export const SERP_QUEUE_NAME = "serp.fetch";
export const SERP_DLQ_NAME = "serp.dead";
