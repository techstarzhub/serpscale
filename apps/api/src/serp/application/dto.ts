import { z } from "zod";
import type { NormalizedSerp } from "../domain/serp.types";

/** Transport-agnostic input, validated at the edge with zod. */
export const RunSearchSchema = z.object({
  orgId: z.string().min(1),
  query: z.string().trim().min(1).max(256),
  engine: z.enum(["google", "bing", "yahoo", "duckduckgo"]).default("google"),
  country: z.string().length(2).default("US"),
  language: z.string().min(2).max(5).default("en"),
  device: z.enum(["desktop", "mobile", "tablet"]).default("desktop"),
  /** Max acceptable snapshot age in seconds for a cache hit (0 = force fresh). */
  freshnessSeconds: z.number().int().min(0).max(86_400).default(3600),
  keywordId: z.string().optional(),
  idempotencyKey: z.string().max(128).optional(),
});

export type RunSearchInput = z.infer<typeof RunSearchSchema>;

export type RunSearchOutput =
  | { status: "cached"; snapshot: NormalizedSerp }
  | { status: "queued"; jobId: string };

export interface JobStatusOutput {
  jobId: string;
  status: string;
  provider: string | null;
  error: string | null;
  snapshot: NormalizedSerp | null;
}
