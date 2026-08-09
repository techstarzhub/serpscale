import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { GoogleService } from "./google.service";

/**
 * Keeps Google connections alive automatically so users don't have to reconnect.
 * Google access tokens live ~1h; this sweeps every 30 min to refresh any that are
 * expired or about to expire using the stored refresh token. It also flags a
 * connection whose refresh token has been revoked (invalid_grant) as "expired" so
 * the UI can prompt a one-time reconnect — a revoked refresh token cannot be
 * recovered by code (Google requires fresh user consent).
 */
@Injectable()
export class GoogleTokenScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoogleTokenScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private kickoff?: ReturnType<typeof setTimeout>;
  private readonly INTERVAL_MS = 30 * 60_000;

  constructor(private readonly google: GoogleService) {}

  onModuleInit() {
    const sweep = () =>
      this.google
        .refreshDueTokens()
        .then((r) => {
          if (r.refreshed || r.needsReconnect) {
            this.logger.log(`google tokens: ${r.refreshed} refreshed, ${r.needsReconnect} need reconnect`);
          }
        })
        .catch((e) => this.logger.warn(`token refresh sweep failed: ${String(e).slice(0, 120)}`));
    // First sweep shortly after boot, then on a steady cadence.
    this.kickoff = setTimeout(sweep, 15_000);
    this.timer = setInterval(sweep, this.INTERVAL_MS);
    this.logger.log("google token auto-refresh scheduled (every 30m)");
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.kickoff) clearTimeout(this.kickoff);
  }
}
