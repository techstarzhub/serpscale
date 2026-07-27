import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../auth/guards/permissions.guard";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { PERMISSIONS } from "../../auth/permissions";
import { CurrentUser, type AuthUser } from "../../auth/decorators/current-user.decorator";
import { SearchOrchestrator } from "../application/search-orchestrator";
import { RunSearchSchema, type JobStatusOutput } from "../application/dto";
import { DomainError } from "../domain/errors";
import { SERP_TOKENS } from "../serp.tokens";
import type { ISerpJobRepository, ISnapshotRepository } from "../domain/ports";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.KEYWORDS_RESEARCH)
@Controller("serp")
export class SerpController {
  constructor(
    @Inject(SERP_TOKENS.Orchestrator) private readonly orchestrator: SearchOrchestrator,
    @Inject(SERP_TOKENS.JobRepository) private readonly jobs: ISerpJobRepository,
    @Inject(SERP_TOKENS.SnapshotRepository) private readonly snapshots: ISnapshotRepository,
  ) {}

  private orgOf(user: AuthUser): string {
    return user.orgId ?? `user:${user.id}`;
  }

  /** Run a search — returns a cached snapshot (200) or enqueues a job (202). */
  @Post("search")
  @HttpCode(200)
  async search(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = RunSearchSchema.safeParse({ ...(body as object), orgId: this.orgOf(user) });
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    try {
      return await this.orchestrator.run(parsed.data);
    } catch (err) {
      if (err instanceof DomainError) throw new BadRequestException({ code: err.code, message: err.message });
      throw err;
    }
  }

  /** Poll a job; includes the snapshot once it has succeeded. Org-scoped. */
  @Get("search/:jobId")
  async jobStatus(@CurrentUser() user: AuthUser, @Param("jobId") jobId: string): Promise<JobStatusOutput> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new BadRequestException("Unknown job");
    // IDOR guard — a job belongs to exactly one org; never leak across tenants.
    if ((job as any).orgId && (job as any).orgId !== this.orgOf(user)) throw new ForbiddenException("Not found");
    const snapshot = job.snapshotId ? (await this.snapshots.findById(job.snapshotId))?.serp ?? null : null;
    return { jobId: job.id, status: job.status, provider: job.provider, error: job.error, snapshot };
  }

  @Get("snapshots/:id")
  async snapshot(@Param("id") id: string) {
    // Snapshots are immutable, content-hash-deduped PUBLIC Google results (shared
    // across orgs), so they carry no tenant-private data. Access still requires the
    // keywords.research permission (controller-level guard).
    const snap = await this.snapshots.findById(id);
    if (!snap) throw new BadRequestException("Unknown snapshot");
    return snap.serp;
  }
}
