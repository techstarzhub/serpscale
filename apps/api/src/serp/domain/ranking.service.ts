/**
 * Pure domain service — ranking + Share-of-Voice maths. No I/O, fully unit-testable.
 */
import type { NormalizedSerp, OrganicItem } from "./serp.types";

export interface RankResult {
  domain: string;
  /** Best organic rank for the domain, or null if it does not appear. */
  rank: number | null;
  /** Absolute page position, or null. */
  position: number | null;
  url: string | null;
}

export class RankingService {
  private static normalizeDomain(domain: string): string {
    return domain.replace(/^www\./i, "").toLowerCase();
  }

  /** Where does `domain` rank in this SERP? Returns its best organic position. */
  findRank(serp: NormalizedSerp, domain: string): RankResult {
    const target = RankingService.normalizeDomain(domain);
    let best: OrganicItem | null = null;
    for (const item of serp.organic) {
      if (RankingService.normalizeDomain(item.domain) === target) {
        if (!best || item.rank < best.rank) best = item;
      }
    }
    return {
      domain: target,
      rank: best?.rank ?? null,
      position: best?.position ?? null,
      url: best?.url ?? null,
    };
  }

  /** Position delta vs a previous rank (negative = improved, up the page). */
  computeDelta(current: number | null, previous: number | null): number | null {
    if (current == null || previous == null) return null;
    return current - previous;
  }

  /**
   * Share of Voice: a domain's weighted visibility across many SERPs. Higher
   * ranks are worth exponentially more (CTR curve ≈ 1 / rank^0.9), capped to top 20.
   */
  shareOfVoice(serps: NormalizedSerp[], domain: string): number {
    if (serps.length === 0) return 0;
    const weightFor = (rank: number) => (rank <= 20 ? 1 / Math.pow(rank, 0.9) : 0);
    const maxWeight = weightFor(1);
    let total = 0;
    for (const serp of serps) {
      const { rank } = this.findRank(serp, domain);
      if (rank != null) total += weightFor(rank);
    }
    // Normalize to 0..1 against the theoretical max (rank 1 on every SERP).
    return Math.round((total / (maxWeight * serps.length)) * 1000) / 1000;
  }
}
