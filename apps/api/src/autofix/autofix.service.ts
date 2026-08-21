import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { buildRemediationPlan, type RemediationPlan } from "./remediation";
import { composePrBody, openPullRequest, prBranchName, type OpenedPr } from "./github";
import { GithubConnectionService } from "./github-connection.service";

@Injectable()
export class AutofixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: GithubConnectionService,
  ) {}

  // Load the audit's issue codes + the project's domain/brand for templating.
  private async loadContext(crawlId: string) {
    const crawl = await this.prisma.crawl.findUnique({ where: { id: crawlId } });
    if (!crawl) throw new NotFoundException("Crawl not found");
    const project = await this.prisma.project.findUnique({ where: { id: crawl.projectId ?? undefined } });
    if (!project) throw new NotFoundException("Project not found");
    const summary = Array.isArray(crawl.issuesSummary) ? (crawl.issuesSummary as { code?: string }[]) : [];
    const codes = summary.map((i) => i.code).filter((c): c is string => !!c);
    const domain = project.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return { projectId: project.id, codes, domain, brand: project.name };
  }

  // Preview the remediation plan (no side effects).
  async plan(crawlId: string): Promise<RemediationPlan & { domain: string }> {
    const { codes, domain, brand } = await this.loadContext(crawlId);
    return { domain, ...buildRemediationPlan(codes, { domain, brand }) };
  }

  // Generate the auto-fixable artifacts and open a PR against the campaign's
  // CONNECTED repo (token comes from the stored, encrypted connection).
  async createPullRequest(crawlId: string): Promise<OpenedPr & { plan: RemediationPlan }> {
    const { projectId, codes, domain, brand } = await this.loadContext(crawlId);
    const plan = buildRemediationPlan(codes, { domain, brand });
    if (!plan.files.length) {
      throw new BadRequestException(
        "No auto-fixable files for this audit — the remaining issues need template/code changes (see the plan's manual items).",
      );
    }
    const target = await this.connections.getTarget(projectId);
    const branch = prBranchName(crawlId);
    const body = composePrBody(plan, { domain });
    const pr = await openPullRequest(target, branch, `SEO auto-fix for ${domain}`, body, plan.files);
    return { ...pr, plan };
  }
}
