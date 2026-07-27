import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { ISerpJobRepository, JobRecord } from "../domain/ports";

@Injectable()
export class PrismaJobRepository implements ISerpJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toRecord(j: { id: string; status: string; snapshotId: string | null; provider: string | null; error: string | null }): JobRecord {
    return { id: j.id, status: j.status as JobRecord["status"], snapshotId: j.snapshotId, provider: j.provider, error: j.error };
  }

  async create(input: { orgId: string; keywordId?: string; idempotencyKey?: string }): Promise<JobRecord> {
    const j = await this.prisma.serpJob.create({
      data: { orgId: input.orgId, keywordId: input.keywordId, idempotencyKey: input.idempotencyKey, status: "QUEUED" },
    });
    return this.toRecord(j);
  }

  async findById(id: string): Promise<JobRecord | null> {
    const j = await this.prisma.serpJob.findUnique({ where: { id } });
    return j ? this.toRecord(j) : null;
  }

  async findByIdempotencyKey(key: string): Promise<JobRecord | null> {
    const j = await this.prisma.serpJob.findUnique({ where: { idempotencyKey: key } });
    return j ? this.toRecord(j) : null;
  }

  async markRunning(id: string, provider: string): Promise<void> {
    await this.prisma.serpJob.update({
      where: { id },
      data: { status: "RUNNING", provider, startedAt: new Date(), attempts: { increment: 1 } },
    });
  }

  async markSucceeded(id: string, snapshotId: string): Promise<void> {
    await this.prisma.serpJob.update({ where: { id }, data: { status: "SUCCEEDED", snapshotId, finishedAt: new Date(), error: null } });
  }

  async markFailed(id: string, error: string, dead: boolean): Promise<void> {
    await this.prisma.serpJob.update({ where: { id }, data: { status: dead ? "DEAD" : "FAILED", error: error.slice(0, 500), finishedAt: new Date() } });
  }
}
