import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DataForSeoService } from "../dataforseo/dataforseo.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EntitlementsService } from "../entitlements/entitlements.service";

type KeywordRow = { id: string; keyword: string; country: string; device: string; project: { id: string; orgId: string | null; domain: string } };

/** Tracks Google organic rank for chosen keywords over time (scheduled daily). */
@Injectable()
export class RankTrackerService {
  private readonly logger = new Logger(RankTrackerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataforseo: DataForSeoService,
    private readonly notifications: NotificationsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  // Decide which keywords may actually be rank-checked (each check costs money):
  //   1. The org's subscription must be ACTIVE — an unpaid / lapsed / canceled org
  //      must NOT keep incurring paid SERP checks (user endpoints are gated by
  //      @RequireFeature, but the scheduler bypasses guards, so re-check here).
  //   2. Only the paid number of keywords is tracked: an org may keep more rows
  //      than its plan allows (e.g. left over after a downgrade), but we check
  //      only the OLDEST `limit` of them — "jitne keywords ki payment hui, utne
  //      hi track honge". Beyond the cap, keywords simply stop being refreshed.
  // Fails closed: any org we can't verify is skipped.
  private async eligibleForCheck<T extends { id: string; project: { orgId: string | null } }>(kws: T[]): Promise<T[]> {
    const orgIds = [...new Set(kws.map((k) => k.project.orgId).filter((o): o is string => !!o))];
    const info = new Map<string, { active: boolean; allowed: Set<string> | null }>();
    await Promise.all(
      orgIds.map(async (orgId) => {
        try {
          const ent = await this.entitlements.forOrg(orgId);
          if (!ent.active) return info.set(orgId, { active: false, allowed: new Set() });
          const cap = ent.limits.keywords;
          if (cap == null) return info.set(orgId, { active: true, allowed: null }); // unlimited
          const oldest = await this.prisma.rankKeyword.findMany({
            where: { project: { orgId } },
            orderBy: { createdAt: "asc" },
            take: cap,
            select: { id: true },
          });
          info.set(orgId, { active: true, allowed: new Set(oldest.map((o) => o.id)) });
        } catch {
          info.set(orgId, { active: false, allowed: new Set() }); // fail closed
        }
      }),
    );
    return kws.filter((k) => {
      const orgId = k.project.orgId;
      if (!orgId) return true; // no org → no plan limit applies
      const i = info.get(orgId);
      if (!i || !i.active) return false;
      return i.allowed === null || i.allowed.has(k.id);
    });
  }

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
    // Enforce the plan's keyword cap — but only for genuinely new keywords, so
    // re-adding an existing one is never blocked. Counts across the whole org.
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { orgId: true } });
    const orgId = project?.orgId ?? null;
    // Count-check + create in one transaction under a per-org advisory lock so
    // concurrent adds can't both slip past the keyword cap (TOCTOU race).
    const row = await this.prisma.$transaction(async (tx) => {
      if (orgId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`;
      const exists = await tx.rankKeyword.findUnique({
        where: { projectId_keyword_country_device: { projectId, keyword: text, country: c, device: dev } },
        select: { id: true },
      });
      if (orgId && !exists) {
        const kwCount = await tx.rankKeyword.count({ where: { project: { orgId } } });
        await this.entitlements.assertWithinLimit(orgId, "keywords", kwCount);
      }
      return tx.rankKeyword.upsert({
        where: { projectId_keyword_country_device: { projectId, keyword: text, country: c, device: dev } },
        create: { projectId, keyword: text, country: c, device: dev },
        update: {},
        include: { project: { select: { id: true, orgId: true, domain: true } } },
      });
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
    await this.applyReading(kw, r.position ?? null, r.url ?? null);
    return r;
  }

  // Store one reading (position/url) as history + notify on a significant move.
  // Shared by the live check() and the Standard-mode drain, so both paths record
  // history and fire the same "rank moved" notifications identically.
  private async applyReading(kw: KeywordRow, position: number | null, url: string | null) {
    const prev = await this.prisma.rankCheck.findFirst({ where: { keywordId: kw.id }, orderBy: { checkedAt: "desc" }, select: { position: true } });
    await this.prisma.rankCheck.create({ data: { keywordId: kw.id, position, url } });
    await this.prisma.rankKeyword.update({ where: { id: kw.id }, data: { lastCheckedAt: new Date() } });

    // Notify the org's admins only on a meaningful move (and only once a baseline exists).
    if (prev && kw.project.orgId) {
      const dir = this.significant(prev.position, position);
      if (dir) {
        const label = (p: number | null) => (p == null ? "outside top 100" : `#${p}`);
        const admins = await this.prisma.user.findMany({ where: { orgId: kw.project.orgId, role: "ADMIN", isActive: true }, select: { id: true } });
        void this.notifications.notifyMany(admins.map((a) => a.id), "rank_change", {
          title: dir === "up" ? `Ranking improved: "${kw.keyword}"` : `Ranking dropped: "${kw.keyword}"`,
          body: `${kw.project.domain} moved from ${label(prev.position)} to ${label(position)} for "${kw.keyword}".`,
          link: `/dashboard/projects/${kw.project.id}`,
        });
      }
    }
  }

  // A manual "Refresh now" only re-checks keywords that haven't been checked
  // within this window. Each live check costs money, and the scheduler already
  // updates daily — so repeated clicks must NOT re-spend on still-fresh data.
  private static readonly REFRESH_COOLDOWN_MS = 12 * 3600_000; // 12h

  // Manual "refresh now" for a project's tracked keywords.
  async checkProject(projectId: string) {
    const cutoffMs = Date.now() - RankTrackerService.REFRESH_COOLDOWN_MS;
    const kws = await this.prisma.rankKeyword.findMany({
      where: { projectId },
      include: { project: { select: { id: true, orgId: true, domain: true } } },
    });
    // Skip anything checked within the cooldown — those are already up to date,
    // so re-checking them would just burn money for the same result.
    const fresh = kws.filter((k) => !k.lastCheckedAt || new Date(k.lastCheckedAt).getTime() < cutoffMs);
    // Enforce the same active-subscription + paid-keyword-cap rule as the
    // scheduler, so a manual "Refresh now" can't check an inactive org or spend
    // on keywords beyond the plan's paid limit.
    const due = await this.eligibleForCheck(fresh);
    let checked = 0;
    for (const kw of due) {
      try {
        if (await this.check(kw as KeywordRow)) checked++;
      } catch (e) {
        this.logger.warn(`rank check failed for "${kw.keyword}": ${String(e).slice(0, 80)}`);
      }
    }
    return { checked, skipped: kws.length - due.length, total: kws.length };
  }

  // Opt-in: use DataForSEO's Standard (queue) SERP mode for the bulk daily
  // refresh — ~3x cheaper than live/advanced, at the cost of being async. Off by
  // default (keeps the proven live path) until verified against the real API.
  private standardMode(): boolean {
    return process.env.RANK_TRACKER_STANDARD === "1";
  }

  // Scheduler entry point: check keywords not read in the last 44h (every-2-day cadence).
  async checkDue(limit = 500) {
    if (this.standardMode()) return this.postDue(limit);
    const cutoff = new Date(Date.now() - 44 * 3600_000);
    const due = await this.prisma.rankKeyword.findMany({
      where: { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }] },
      include: { project: { select: { id: true, orgId: true, domain: true } } },
      orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
      take: limit,
    });
    const kws = await this.eligibleForCheck(due);
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

  // ---- Standard (queue) mode: post cheap SERP tasks now, drain results later ----

  // Post Standard SERP tasks for due keywords (cheap, async). Results arrive via
  // drainSerpTasks(). We de-dupe by keyword+country+device so several campaigns
  // tracking the same term only pay for one SERP; the result maps to all of them.
  async postDue(limit = 500) {
    const cutoff = new Date(Date.now() - 44 * 3600_000);
    const due = await this.prisma.rankKeyword.findMany({
      where: { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }] },
      include: { project: { select: { id: true, orgId: true, domain: true } } },
      orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
      take: limit,
    });
    const kws = await this.eligibleForCheck(due);
    if (!kws.length) return { posted: 0, scanned: 0 };

    // Dedupe: one task per unique (keyword|country|device); tag carries the id of
    // one representative keyword, and every sibling shares that SERP on drain.
    const groups = new Map<string, (typeof kws)[number]>();
    for (const k of kws) {
      const key = `${k.country}|${k.device}|${k.keyword.toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, k);
    }
    const posted = await this.dataforseo.serpTaskPostBatch(
      [...groups.values()].map((k) => ({ keyword: k.keyword, country: k.country, device: k.device, tag: k.id })),
    );
    // Optimistically mark ALL scanned keywords as checked so the next daily run
    // doesn't re-post while results are still pending; the drain writes history.
    if (posted > 0) {
      await this.prisma.rankKeyword.updateMany({ where: { id: { in: kws.map((k) => k.id) } }, data: { lastCheckedAt: new Date() } });
    }
    this.logger.log(`scheduled rank tracking (standard): posted ${posted} SERP task(s) for ${kws.length} keyword(s)`);
    return { posted, scanned: kws.length };
  }

  // Drain finished Standard SERP tasks → store positions + notify. Runs on a short
  // poller since results are ready a few minutes after posting. One SERP updates
  // every keyword sharing its keyword+country+device (the de-dupe from postDue).
  async drainSerpTasks() {
    const ids = await this.dataforseo.serpTasksReady();
    if (!ids.length) return { drained: 0 };
    let drained = 0;
    for (const id of ids) {
      try {
        const res = await this.dataforseo.serpTaskResult(id);
        if (!res?.tag) continue;
        const rep = await this.prisma.rankKeyword.findUnique({ where: { id: res.tag } });
        if (!rep) continue; // not one of ours (or deleted)
        // Fan the one SERP out to every keyword sharing keyword+country+device.
        const siblings = await this.prisma.rankKeyword.findMany({
          where: { keyword: rep.keyword, country: rep.country, device: rep.device },
          include: { project: { select: { id: true, orgId: true, domain: true } } },
        });
        for (const kw of siblings) {
          const { position, url } = this.dataforseo.positionInSerp(res.items, kw.project.domain);
          await this.applyReading(kw as KeywordRow, position, url);
          drained++;
        }
      } catch (e) {
        this.logger.warn(`drain serp task ${id} failed: ${String(e).slice(0, 80)}`);
      }
    }
    if (drained) this.logger.log(`scheduled rank tracking (standard): drained ${drained} reading(s)`);
    return { drained };
  }
}
