/** Base class for all domain errors — carries an HTTP-mappable code. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus = 400,
    /** Transient errors are safe to retry; permanent ones are not. */
    readonly retryable = false,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class CreditExhaustedError extends DomainError {
  constructor(orgId: string) {
    super(`Insufficient SERP credits for org ${orgId}`, "CREDIT_EXHAUSTED", 402, false);
  }
}

export class ProviderUnavailableError extends DomainError {
  constructor(provider: string) {
    super(`SERP provider "${provider}" is unavailable`, "PROVIDER_UNAVAILABLE", 503, true);
  }
}

export class NoProviderError extends DomainError {
  constructor() {
    super("No healthy SERP provider available", "NO_PROVIDER", 503, true);
  }
}

export class InvalidSearchError extends DomainError {
  constructor(message: string) {
    super(message, "INVALID_SEARCH", 422, false);
  }
}
