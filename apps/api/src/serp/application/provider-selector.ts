import { NoProviderError } from "../domain/errors";
import type { ISerpProvider } from "../domain/ports";

/**
 * Strategy that picks a provider by policy: prefer the cheapest healthy one,
 * fall back through the rest. Open/Closed — add a provider without touching
 * callers. A real deployment would layer in circuit-breaker state and coverage.
 */
export class ProviderSelector {
  constructor(private readonly providers: ISerpProvider[]) {}

  async select(): Promise<ISerpProvider> {
    const ranked = [...this.providers].sort((a, b) => a.costPerQuery - b.costPerQuery);
    for (const provider of ranked) {
      if (await provider.isHealthy().catch(() => false)) return provider;
    }
    throw new NoProviderError();
  }
}
