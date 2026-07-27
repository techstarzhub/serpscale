import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DataForSeoService } from "../dataforseo/dataforseo.service";
import { NotificationsService } from "../notifications/notifications.service";

type KeywordRow = { id: string; keyword: string; country: string; device: string; project: { id: string; orgId: string | null; domain: string } };

/** Tracks Google organic rank for chosen keywords over time (scheduled daily). */
@Injectable()
export class RankTrackerService {
  private readonly logger = new Logger(RankTrackerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataforseo: DataForSeoService,
    private readonly notifications: NotificationsService,
  ) {}

  // A rank move worth notifying about = crossing the top-10 boundary, or
  // entering / dropping out of the top 100 entirely.
  private significant(before: number | null, after: number | null): "up" | "down" | null {
    const inTop10 = (p: number | null) => p != null && p <= 10;
    if (before == null && after == null) return null;
    if (!inTop10(before) && inTop10(after)) return "up"; // entered page 1
    if (inTop10(before) && !inTop10(after)) return "down"; // fell off page 1
    if (before != null && after == null) return "down"; // dropped out of top 100
    if (before == null && after != null) return "up"; // newly ranked
    return null;
  }

  // Keywords tracked for a project, with latest position + recent history + delta.
  async list(projectId: string) {
    const kws = await this.prisma.rankKeyword.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { checks: { orderBy: { checkedAt: "desc" }, take: 30 } },
    });
    return kws.map((k) => {
      const [latest, prev] = k.checks;
      const improved =
        latest && prev && latest.position != null && prev.position != null ? prev.position - latest.position : null;
      return {
        id: k.id,
        keyword: k.keyword,
        country: k.country,
        device: k.device,
        lastCheckedAt: k.lastCheckedAt,
        position: latest?.position ?? null,
        url: latest?.url ?? null,
        delta: improved, // positive = moved up (improved)
        best: k.checks.reduce<number | null>((b, c) => (c.position != null && (b == null || c.position < b) ? c.position : b), null),
        history: [...k.checks].reverse().map((c) => ({ position: c.position, at: c.checkedAt })),
      };
    });
  }

  async add(projectId: string, keyword: string, country = "US", device = "desktop") {
    const text = (keyword ?? "").trim().slice(0, 200);
    if (!text) throw new BadRequestException("A keyword is required.");
    const dev = device === "mobile" ? "mobile" : "desktop";
    const c = (country || "US").toUpperCase().slice(0, 2);
    const row = await this.prisma.rankKeyword.upsert({
      where: { projectId_keyword_country_device: { projectId, keyword: text, country: c, device: dev } },
      create: { projectId, keyword: text, country: c, device: dev },
      update: {},
      include: { project: { select: { id: true, orgId: true, domain: true } } },
    });
    // First reading right away so the user sees a position immediately.
    this.check(row as KeywordRow).catch(() => {});
    return { id: row.id, keyword: row.keyword, country: row.country, device: row.device };
  }

  async remove(projectId: string, id: string) {
    await this.prisma.rankKeyword.deleteMany({ where: { id, projectId } });
    return { ok: true };
  }

  // One live rank reading -> stored as history (+ notify on a significant move).
  async check(kw: KeywordRow) {
    const r: any = await this.dataforseo.serpRank(kw.keyword, kw.project.domain, kw.country, "en", kw.device, true);
    if (!r?.connected) return null;
    const prev = await this.prisma.rankCheck.findFirst({ where: { keywordId: kw.id }, orderBy: { checkedAt: "desc" }, select: { position: true } });
    await this.prisma.rankCheck.create({ data: { keywordId: kw.id, position: r.position ?? null, url: r.url ?? null } });
    await this.prisma.rankKeyword.update({ where: { id: kw.id }, data: { lastCheckedAt: new Date() } });

    // Notify the org's admins only on a meaningful move (and only once a baseline exists).
    if (prev && kw.project.orgId) {
      const dir = this.significant(prev.position, r.position ?? null);
      if (dir) {
        const label = (p: number | null) => (p == null ? "outside top 100" : `#${p}`);
        const admins = await this.prisma.user.findMany({ where: { orgId: kw.project.orgId, role: "ADMIN", isActive: true }, select: { id: true } });
        void this.notifications.notifyMany(admins.map((a) => a.id), "rank_change", {
          title: dir === "up" ? `Ranking improved: "${kw.keyword}"` : `Ranking dropped: "${kw.keyword}"`,
          body: `${kw.project.domain} moved from ${label(prev.position)} to ${label(r.position ?? null)} for "${kw.keyword}".`,
          link: `/dashboard/projects/${kw.project.id}`,
        });
      }
    }
    return r;
  }

  // Manual "refresh now" for a project's tracked keywords.
  async checkProject(projectId: string) {
    const kws = await this.prisma.rankKeyword.findMany({
      where: { projectId },
      include: { project: { select: { id: true, orgId: true, domain: true } } },
    });
    let checked = 0;
    for (const kw of kws) {
      try {
        if (await this.check(kw as KeywordRow)) checked++;
      } catch (e) {
        this.logger.warn(`rank check failed for "${kw.keyword}": ${String(e).slice(0, 80)}`);
      }
    }
    return { checked, total: kws.length };
  }

  // Scheduler entry point: check keywords not read in the last ~20h (daily cadence).
  async checkDue(limit = 500) {
    const cutoff = new Date(Date.now() - 20 * 3600_000);
    const kws = await this.prisma.rankKeyword.findMany({
      where: { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }] },
      include: { project: { select: { id: true, orgId: true, domain: true } } },
      orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
      take: limit,
    });
    let checked = 0;
    for (const kw of kws) {
      try {
        if (await this.check(kw as KeywordRow)) checked++;
      } catch {
        /* keep going — one bad keyword must not stop the batch */
      }
    }
    if (kws.length) this.logger.log(`scheduled rank tracking: checked ${checked}/${kws.length} keyword(s)`);
    return { checked, scanned: kws.length };
  }
}
