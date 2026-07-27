import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { ICreditService } from "../domain/ports";
import { CreditExhaustedError } from "../domain/errors";

const STARTER_BALANCE = 1000; // seed balance auto-granted on first use (demo)

/**
 * Credit metering with atomic, race-free reservations. `reserve` uses a single
 * conditional UPDATE so two concurrent requests can never over-spend.
 */
@Injectable()
export class PrismaCreditService implements ICreditService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensure(orgId: string): Promise<void> {
    await this.prisma.serpCredit.upsert({ where: { orgId }, create: { orgId, balance: STARTER_BALANCE }, update: {} });
  }

  async reserve(orgId: string, units: number): Promise<void> {
    await this.ensure(orgId);
    // Atomic guard: only reserve if the available (balance - reserved) covers it.
    const affected = await this.prisma.$executeRaw`
      UPDATE "SerpCredit" SET "reserved" = "reserved" + ${units}, "updatedAt" = now()
      WHERE "orgId" = ${orgId} AND ("balance" - "reserved") >= ${units}`;
    if (affected === 0) throw new CreditExhaustedError(orgId);
  }

  async commit(orgId: string, units: number, meta: { jobId?: string; action: string }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE "SerpCredit" SET "balance" = "balance" - ${units}, "reserved" = GREATEST("reserved" - ${units}, 0), "updatedAt" = now()
        WHERE "orgId" = ${orgId}`,
      this.prisma.serpUsageLog.create({ data: { orgId, action: meta.action, units, jobId: meta.jobId } }),
    ]);
  }

  async refund(orgId: string, units: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "SerpCredit" SET "reserved" = GREATEST("reserved" - ${units}, 0), "updatedAt" = now()
      WHERE "orgId" = ${orgId}`;
  }
}
