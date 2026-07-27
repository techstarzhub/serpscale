import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { appSecret, decryptSecret, encryptSecret } from "../common/crypto";
import { verifyRepoAccess, type PrTarget } from "./github";

export interface ConnectInput {
  owner: string;
  repo: string;
  token: string;
  defaultBranch?: string;
  label?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  owner?: string;
  repo?: string;
  defaultBranch?: string | null;
  accountLabel?: string | null;
  updatedAt?: Date;
}

@Injectable()
export class GithubConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  // Connect (or re-connect) a repo: verify the token can access it, then store
  // the token encrypted. Verification means we never save a dead/wrong token.
  async connect(projectId: string, input: ConnectInput): Promise<ConnectionStatus> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException("Project not found");
    if (!input?.owner || !input?.repo || !input?.token) {
      throw new BadRequestException("owner, repo and token are required");
    }

    const target: PrTarget = { owner: input.owner, repo: input.repo, token: input.token, baseBranch: input.defaultBranch };
    let defaultBranch: string;
    let canPush: boolean;
    try {
      const info = await verifyRepoAccess(target);
      defaultBranch = input.defaultBranch || info.defaultBranch;
      canPush = info.permissionPush;
    } catch (e) {
      throw new BadRequestException(`Could not access ${input.owner}/${input.repo}: ${String(e).slice(0, 160)}`);
    }
    if (!canPush) {
      throw new BadRequestException("The token can read but not write to this repo — a token with push access is required to open PRs.");
    }

    const tokenCipher = encryptSecret(input.token, appSecret());
    const row = await this.prisma.githubConnection.upsert({
      where: { projectId },
      create: { projectId, owner: input.owner, repo: input.repo, defaultBranch, tokenCipher, accountLabel: input.label ?? null },
      update: { owner: input.owner, repo: input.repo, defaultBranch, tokenCipher, accountLabel: input.label ?? null, status: "connected" },
    });
    return this.toStatus(row);
  }

  async status(projectId: string): Promise<ConnectionStatus> {
    const row = await this.prisma.githubConnection.findUnique({ where: { projectId } });
    return row ? this.toStatus(row) : { connected: false };
  }

  async disconnect(projectId: string): Promise<{ ok: true }> {
    await this.prisma.githubConnection.deleteMany({ where: { projectId } });
    return { ok: true };
  }

  // Internal: decrypt the stored token into a ready-to-use PR target. Throws if
  // the project has no connection (so autofix can prompt the user to connect).
  async getTarget(projectId: string): Promise<PrTarget> {
    const row = await this.prisma.githubConnection.findUnique({ where: { projectId } });
    if (!row) throw new BadRequestException("No GitHub repo connected for this campaign — connect one first.");
    let token: string;
    try {
      token = decryptSecret(row.tokenCipher, appSecret());
    } catch {
      throw new BadRequestException("Stored GitHub token could not be decrypted — reconnect the repo.");
    }
    return { owner: row.owner, repo: row.repo, token, baseBranch: row.defaultBranch ?? undefined };
  }

  private toStatus(row: {
    owner: string;
    repo: string;
    defaultBranch: string | null;
    accountLabel: string | null;
    updatedAt: Date;
  }): ConnectionStatus {
    return {
      connected: true,
      owner: row.owner,
      repo: row.repo,
      defaultBranch: row.defaultBranch,
      accountLabel: row.accountLabel,
      updatedAt: row.updatedAt,
    };
  }
}
