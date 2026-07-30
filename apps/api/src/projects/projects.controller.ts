import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS as P } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { FeaturesGuard } from "../entitlements/features.guard";
import { RequireFeature } from "../entitlements/require-feature.decorator";
import { ProjectsService } from "./projects.service";
import { CrawlService } from "../crawl/crawl.service";
import { GoogleService } from "../integrations/google.service";
import { DataForSeoService } from "../dataforseo/dataforseo.service";
import { CopilotChatService } from "../copilot/copilot-chat.service";
import { ClientsService } from "../clients/clients.service";
import { RankTrackerService } from "../rank-tracker/rank-tracker.service";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateProjectDto, UpdateProjectDto } from "./dto/project.dto";

// "?fresh=1" / "?fresh=true" → bypass cache and re-fetch live (Refresh button).
const isFresh = (v?: string) => v === "1" || v === "true";

@UseGuards(JwtAuthGuard, PermissionsGuard, FeaturesGuard)
@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly crawls: CrawlService,
    private readonly google: GoogleService,
    private readonly dataforseo: DataForSeoService,
    private readonly copilotChat: CopilotChatService,
    private readonly clients: ClientsService,
    private readonly email: EmailService,
    private readonly rankTracker: RankTrackerService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- Scheduled rank tracking ----

  @Get(":id/rank-keywords")
  @RequirePermissions(P.RANKS_VIEW)
  @RequireFeature("ranks")
  async rankKeywords(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.projects.get(user, id);
    return this.rankTracker.list(id);
  }

  @Post(":id/rank-keywords")
  @RequirePermissions(P.RANKS_VIEW)
  @RequireFeature("ranks")
  async addRankKeyword(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { keyword?: string; country?: string; device?: string }) {
    await this.projects.get(user, id);
    return this.rankTracker.add(id, dto?.keyword ?? "", dto?.country, dto?.device);
  }

  @Delete(":id/rank-keywords/:kid")
  @RequirePermissions(P.RANKS_VIEW)
  @RequireFeature("ranks")
  async removeRankKeyword(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("kid") kid: string) {
    await this.projects.get(user, id);
    return this.rankTracker.remove(id, kid);
  }

  @Post(":id/rank-keywords/refresh")
  @RequirePermissions(P.RANKS_VIEW)
  @RequireFeature("ranks")
  async refreshRankKeywords(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.projects.get(user, id);
    return this.rankTracker.checkProject(id);
  }

  // Gather every dataset for a report (all cached) — shared by download + send.
  private async reportData(project: { id: string; domain: string; orgId: string | null; createdById: string | null }) {
    return Promise.all([
      this.google.cached(`gsc:${project.id}:28`, 3 * 3600_000, () => this.google.gscForProject(project as any, 28)).catch(() => null),
      this.google.cached(`ga:${project.id}:28`, 3 * 3600_000, () => this.google.gaForProject(project as any, 28)).catch(() => null),
      this.dataforseo.backlinksForDomain(project.domain).catch(() => null),
      this.dataforseo.rankedKeywords(project.domain).catch(() => null),
      this.dataforseo.competitors(project.domain).catch(() => null),
    ]);
  }

  // No permission gate: the service scopes the list (view-all -> every campaign,
  // view-assigned -> only assigned, client -> theirs, none -> empty).
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user);
  }

  @Post()
  @RequirePermissions(P.PROJECTS_CREATE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  // Access is enforced by projects.get -> assertAccess (view-all / assigned / client).
  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.get(user, id);
  }

  @Patch(":id")
  @RequirePermissions(P.PROJECTS_EDIT)
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(user, id, dto);
  }

  // Archive / restore a campaign (soft — data is kept, just hidden by default).
  @Patch(":id/archive")
  @RequirePermissions(P.PROJECTS_EDIT)
  setArchived(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { archived?: boolean }) {
    return this.projects.setArchived(user, id, dto?.archived !== false);
  }

  // Generate (or fetch) the campaign's public read-only view key.
  @Post(":id/share")
  @RequirePermissions(P.PROJECTS_EDIT)
  generateShare(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.generateShare(user, id);
  }

  // Revoke the public view key — the link stops working immediately.
  @Delete(":id/share")
  @RequirePermissions(P.PROJECTS_EDIT)
  revokeShare(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.revokeShare(user, id);
  }

  @Delete(":id")
  @RequirePermissions(P.PROJECTS_DELETE)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.remove(user, id);
  }

  // ---- Site crawl / audit ----

  @Post(":id/crawl")
  @RequirePermissions(P.AUDIT_RUN)
  @RequireFeature("audit")
  async startCrawl(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { maxPages?: number },
  ) {
    const project = await this.projects.get(user, id);
    const maxPages = Math.min(100000, Math.max(1, Number(body?.maxPages) || 1000));
    return this.crawls.start(project, maxPages, user.id);
  }

  // Cancel the running audit for this campaign.
  @Post(":id/crawl/cancel")
  @RequirePermissions(P.AUDIT_RUN)
  @RequireFeature("audit")
  async cancelCrawl(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.projects.get(user, id); // access check
    return this.crawls.cancel(id);
  }

  @Get(":id/crawl/latest")
  @RequirePermissions(P.AUDIT_VIEW)
  @RequireFeature("audit")
  async latestCrawl(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.projects.get(user, id); // access check
    return this.crawls.latestForProject(id);
  }

  @Get(":id/crawl/history")
  @RequirePermissions(P.AUDIT_VIEW)
  @RequireFeature("audit")
  async crawlHistory(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.projects.get(user, id); // access check
    return this.crawls.historyForProject(id);
  }

  // Download a full branded PDF report — technical audit + Search Console +
  // Analytics + keyword rankings + backlinks + competitors (all cached).
  @Get(":id/report.pdf")
  @RequirePermissions(P.REPORTS_GENERATE)
  async report(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
    const project = await this.projects.get(user, id);
    // White-label: an agency-client's own brand for its portal users, else the org's.
    const brand = await this.clients.reportBrand(user, id);

    // Gather every dataset in parallel; each is cached so this is fast + cheap.
    const [gsc, ga, backlinks, ranked, competitors] = await Promise.all([
      this.google.cached(`gsc:${id}:28`, 3 * 3600_000, () => this.google.gscForProject(project, 28)).catch(() => null),
      this.google.cached(`ga:${id}:28`, 3 * 3600_000, () => this.google.gaForProject(project, 28)).catch(() => null),
      this.dataforseo.backlinksForDomain(project.domain).catch(() => null),
      this.dataforseo.rankedKeywords(project.domain).catch(() => null),
      this.dataforseo.competitors(project.domain).catch(() => null),
    ]);

    const pdf = await this.crawls.reportPdf(project, brand, { gsc, ga, backlinks, ranked, competitors });
    if (!pdf) {
      res.status(404).json({ error: "No data to report yet. Run an audit or connect Google / DataForSEO." });
      return;
    }
    const safe = project.domain.replace(/[^a-z0-9.-]/gi, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safe}-seo-report.pdf"`);
    res.send(pdf);
  }

  // Email this campaign's white-label PDF report to a client's members.
  @Post(":id/send-report")
  @RequirePermissions(P.CLIENTS_SEND_REPORTS)
  async sendReport(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { clientId?: string }) {
    const project = await this.projects.get(user, id);
    if (!dto?.clientId) throw new BadRequestException("clientId is required.");
    const { brand, emails, clientName } = await this.clients.recipientsForReport(user, dto.clientId, id);
    if (!emails.length) throw new BadRequestException("This client has no members or contact email to send to.");

    const [gsc, ga, backlinks, ranked, competitors] = await this.reportData(project);
    const pdf = await this.crawls.reportPdf(project, brand, { gsc, ga, backlinks, ranked, competitors });
    if (!pdf) throw new BadRequestException("No data to report yet. Run an audit or connect Google / Analytics first.");

    const safe = project.domain.replace(/[^a-z0-9.-]/gi, "_");
    let sent = 0;
    for (const to of emails) {
      const ok = await this.email.sendBranded(
        to,
        `SEO report — ${project.domain}`,
        "Your SEO report is ready",
        `Please find attached the latest SEO report for <b>${project.domain}</b>. It covers rankings, traffic, backlinks and technical health.`,
        undefined,
        user.orgId,
        [{ filename: `${safe}-seo-report.pdf`, content: pdf }],
      );
      if (ok) sent++;
    }
    void this.notifications.notify(user.id, "report_sent", {
      title: `Report sent to ${clientName}`,
      body: `The ${project.domain} report was emailed to ${sent} recipient(s).`,
      link: `/dashboard/projects/${id}`,
    });
    return { sent, total: emails.length, client: clientName };
  }

  // On-demand PageSpeed for a single page (must be on the project's domain).
  @Get(":id/pagespeed")
  @RequirePermissions(P.AUDIT_VIEW)
  @RequireFeature("audit")
  async pagespeed(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("url") url?: string, @Query("fresh") fresh?: string) {
    const project = await this.projects.get(user, id);
    if (!url) return { error: "url required" };
    let host: string;
    try {
      host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return { error: "invalid url" };
    }
    const domain = project.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
    if (host !== domain) return { error: "url must be on the project domain" };
    // PageSpeed is slow (~15s for mobile+desktop) — cache 24h so the dashboard is instant.
    return this.google.cached(`pagespeed:${id}:${url}`, 24 * 3600_000, () => this.crawls.pageSpeedFor(url), isFresh(fresh));
  }

  // ---- Google Search Console data (auto-matched to the project domain) ----

  @Get(":id/gsc")
  @RequirePermissions(P.OVERVIEW_VIEW)
  async gsc(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("days") days?: string,
    @Query("fresh") fresh?: string,
  ) {
    const project = await this.projects.get(user, id);
    const d = Math.min(90, Math.max(7, Number(days) || 28));
    // Cache even a "not matched" result (30m) so an unmatched domain doesn't
    // re-run Google's expensive property/site scan on every page load. Matched
    // data caches for 3h. Refresh button (?fresh=1) always bypasses.
    const key = `gsc:${id}:${d}`;
    const matched = (await this.google.peek<any>(key))?.matched === true;
    return this.google.cached(key, matched ? 3 * 3600_000 : 30 * 60_000, () => this.google.gscForProject(project, d), isFresh(fresh), true);
  }

  // ---- Google Analytics 4 traffic (auto-matched to the project domain) ----

  @Get(":id/ga")
  @RequirePermissions(P.TRAFFIC_VIEW)
  @RequireFeature("traffic")
  async ga(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("days") days?: string,
    @Query("fresh") fresh?: string,
  ) {
    const project = await this.projects.get(user, id);
    const d = Math.min(90, Math.max(7, Number(days) || 28));
    // Same as GSC: cache the "not matched" result (30m) so an unmatched domain
    // doesn't rescan every GA4 property (with its stream URIs) on every load.
    const key = `ga:${id}:${d}`;
    const matched = (await this.google.peek<any>(key))?.matched === true;
    return this.google.cached(key, matched ? 3 * 3600_000 : 30 * 60_000, () => this.google.gaForProject(project, d), isFresh(fresh), true);
  }

  // ---- Google Business Profile (GMB): rating + reviews, matched by domain ----

  @Get(":id/gmb")
  @RequirePermissions(P.OVERVIEW_VIEW)
  async gmb(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("fresh") fresh?: string) {
    const project = await this.projects.get(user, id);
    // cacheEmpty=true: cache even a "not connected / quota pending" result (1h) so
    // the dashboard doesn't re-hit Google for every campaign on every refresh.
    // Once GMB is truly connected it caches the real rating/reviews for 6h via a refresh.
    const matched = (await this.google.peek<any>(`gmb:${id}`))?.matched === true;
    const ttl = matched ? 6 * 3600_000 : 60 * 60_000;
    return this.google.cached(`gmb:${id}`, ttl, () => this.google.gmbForProject(project), isFresh(fresh), true);
  }

  // ---- DataForSEO: backlinks (cached 24h in the service) ----

  @Get(":id/backlinks")
  @RequirePermissions(P.BACKLINKS_VIEW)
  @RequireFeature("backlinks")
  async backlinks(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("fresh") fresh?: string, @Query("cachedOnly") cachedOnly?: string) {
    const project = await this.projects.get(user, id);
    return this.dataforseo.backlinksForDomain(project.domain, isFresh(fresh), cachedOnly === "1");
  }

  // ---- DataForSEO Labs: keyword ideas + ranked keywords (cached 7d) ----

  @Get(":id/keywords")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  @RequireFeature("keywords")
  async keywordIdeas(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("seed") seed?: string,
    @Query("country") country?: string,
    @Query("language") language?: string,
    @Query("fresh") fresh?: string,
  ) {
    await this.projects.get(user, id); // access check
    if (!seed || !seed.trim()) return { connected: true, keywords: [] };
    return this.dataforseo.keywordIdeas(seed.trim(), country, language || "en", isFresh(fresh));
  }

  @Get(":id/ranked-keywords")
  @RequirePermissions(P.RANKS_VIEW)
  @RequireFeature("ranks")
  async rankedKeywords(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("country") country?: string,
    @Query("language") language?: string,
    @Query("fresh") fresh?: string,
    @Query("cachedOnly") cachedOnly?: string,
  ) {
    const project = await this.projects.get(user, id);
    return this.dataforseo.rankedKeywords(project.domain, country, language || "en", isFresh(fresh), cachedOnly === "1");
  }

  // ---- DataForSEO Labs: competitors + domain rank overview ----

  @Get(":id/competitors")
  @RequirePermissions(P.COMPETITORS_VIEW)
  @RequireFeature("competitors")
  async competitors(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("country") country?: string,
    @Query("language") language?: string,
    @Query("fresh") fresh?: string,
    @Query("cachedOnly") cachedOnly?: string,
  ) {
    const project = await this.projects.get(user, id);
    return this.dataforseo.competitors(project.domain, country, language || "en", isFresh(fresh), cachedOnly === "1");
  }

  @Get(":id/keyword-gap")
  @RequirePermissions(P.COMPETITORS_VIEW)
  @RequireFeature("competitors")
  async keywordGap(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("competitor") competitor: string,
    @Query("country") country?: string,
    @Query("language") language?: string,
  ) {
    const project = await this.projects.get(user, id);
    if (!competitor || !competitor.trim()) return { connected: true, keywords: [] };
    return this.dataforseo.keywordGap(project.domain, competitor.trim(), country, language || "en");
  }

  // ---- Domain Analytics: technology stack + contacts ----

  @Get(":id/technologies")
  @RequirePermissions(P.DOMAIN_VIEW)
  @RequireFeature("domain")
  async technologies(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("fresh") fresh?: string, @Query("cachedOnly") cachedOnly?: string) {
    const project = await this.projects.get(user, id);
    return this.dataforseo.technologies(project.domain, isFresh(fresh), cachedOnly === "1");
  }

  // ---- Business Data: local listings (category + coordinate) ----

  @Get(":id/local")
  @RequirePermissions(P.COMPETITORS_VIEW)
  @RequireFeature("competitors")
  async local(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("category") category?: string,
    @Query("coordinate") coordinate?: string,
    @Query("keyword") keyword?: string,
  ) {
    await this.projects.get(user, id); // access check
    if (!coordinate || !coordinate.trim()) return { connected: true, businesses: [] };
    return this.dataforseo.localBusinesses(category || "", coordinate.trim(), keyword);
  }

  // ---- AI Optimization: LLM visibility ----

  // Streams brand visibility across every AI assistant — each model's card updates as
  // soon as that assistant answers (SSE), instead of waiting for all of them.
  @Get(":id/ai-visibility")
  @RequirePermissions(P.AI_VIEW)
  @RequireFeature("ai")
  async aiVisibility(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Res() res: Response,
    @Query("prompt") prompt?: string,
  ) {
    const project = await this.projects.get(user, id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const send = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    const q = (prompt ?? "").trim();
    const brand = project.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split(".")[0];
    if (!q) { send({ type: "done" }); return res.end(); }
    const models = this.dataforseo.aiModelList;
    send({ type: "init", brand, models });
    await Promise.all(
      models.map(async (m) => {
        try {
          const result = await this.dataforseo.checkAiModel(m.engine, q, project.domain);
          send({ type: "model", result });
        } catch {
          send({ type: "model", result: { ...m, connected: false, mentioned: false, text: "" } });
        }
      }),
    );
    send({ type: "done" });
    res.end();
  }

  // AI "how to fix" for a single site-audit issue (stack-aware).
  @Post(":id/audit-fix")
  @RequirePermissions(P.AUDIT_VIEW)
  @RequireFeature("audit")
  async auditFix(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { code?: string }) {
    const project = await this.projects.get(user, id);
    if (!dto?.code) throw new BadRequestException("An issue code is required.");
    return { fix: await this.copilotChat.auditFix(project, dto.code) };
  }

  // Read-only campaign team (assigned members + clients) — visible to anyone with
  // campaign access, including client-portal users, so they see who works on it.
  @Get(":id/team")
  campaignTeam(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.campaignTeam(user, id);
  }

  // ---- Campaign team: assign / unassign members from the campaign header ----
  @Get(":id/members")
  @RequirePermissions(P.TEAM_MANAGE)
  campaignMembers(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.campaignMembers(user, id);
  }

  @Post(":id/members")
  @RequirePermissions(P.TEAM_MANAGE)
  assignMember(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { userId?: string }) {
    if (!dto?.userId) throw new BadRequestException("userId is required.");
    return this.projects.assignMember(user, id, dto.userId);
  }

  @Delete(":id/members/:userId")
  @RequirePermissions(P.TEAM_MANAGE)
  unassignMember(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("userId") userId: string) {
    return this.projects.unassignMember(user, id, userId);
  }

  // ---- Attach / detach clients to this campaign from the header ----
  @Get(":id/clients")
  @RequirePermissions(P.CLIENTS_ASSIGN_CAMPAIGNS)
  campaignClients(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.projects.campaignClients(user, id);
  }

  @Post(":id/clients")
  @RequirePermissions(P.CLIENTS_ASSIGN_CAMPAIGNS)
  attachClient(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { clientId?: string }) {
    if (!dto?.clientId) throw new BadRequestException("clientId is required.");
    return this.projects.attachClient(user, id, dto.clientId);
  }

  @Delete(":id/clients/:clientId")
  @RequirePermissions(P.CLIENTS_ASSIGN_CAMPAIGNS)
  detachClient(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("clientId") clientId: string) {
    return this.projects.detachClient(user, id, clientId);
  }

  // Whole-audit prioritised AI action plan.
  @Post(":id/audit-plan")
  @RequirePermissions(P.AUDIT_VIEW)
  @RequireFeature("audit")
  async auditPlan(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const project = await this.projects.get(user, id);
    return { plan: await this.copilotChat.auditPlan(project) };
  }

  // Stack-aware AI fix for a Lighthouse finding (performance / accessibility / SEO / best-practices).
  @Post(":id/lighthouse-fix")
  @RequirePermissions(P.AUDIT_VIEW)
  @RequireFeature("audit")
  async lighthouseFix(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: { title?: string; description?: string; category?: string; display?: string; evidence?: string[] },
  ) {
    const project = await this.projects.get(user, id);
    if (!dto?.title) throw new BadRequestException("A finding title is required.");
    return {
      fix: await this.copilotChat.lighthouseFix(project, {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        display: dto.display,
        evidence: Array.isArray(dto.evidence) ? dto.evidence.slice(0, 12).map((e) => String(e)) : [],
      }),
    };
  }

  // ---- Streaming (SSE) variants — same grounded fixes, but token-by-token ----

  private async streamFixSse(res: Response, gen: AsyncGenerator<{ type: string }>) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    try {
      for await (const ev of gen) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    } catch {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Couldn't generate a fix right now." })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Post(":id/audit-fix/stream")
  @RequirePermissions(P.AUDIT_VIEW)
  @RequireFeature("audit")
  async auditFixStream(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { code?: string }, @Res() res: Response) {
    const project = await this.projects.get(user, id);
    if (!dto?.code) throw new BadRequestException("An issue code is required.");
    await this.streamFixSse(res, this.copilotChat.auditFixStream(project, dto.code));
  }

  @Post(":id/audit-plan/stream")
  @RequirePermissions(P.AUDIT_VIEW)
  @RequireFeature("audit")
  async auditPlanStream(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
    const project = await this.projects.get(user, id);
    await this.streamFixSse(res, this.copilotChat.auditPlanStream(project));
  }

  @Post(":id/lighthouse-fix/stream")
  @RequirePermissions(P.AUDIT_VIEW)
  @RequireFeature("audit")
  async lighthouseFixStream(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: { title?: string; description?: string; category?: string; display?: string; evidence?: string[] },
    @Res() res: Response,
  ) {
    const project = await this.projects.get(user, id);
    if (!dto?.title) throw new BadRequestException("A finding title is required.");
    await this.streamFixSse(res, this.copilotChat.lighthouseFixStream(project, {
      title: dto.title,
      description: dto.description,
      category: dto.category,
      display: dto.display,
      evidence: Array.isArray(dto.evidence) ? dto.evidence.slice(0, 12).map((e) => String(e)) : [],
    }));
  }

  // ---- AI SEO Copilot — agentic, streaming chat over the project's own data ----

  // Load a chat thread. Members see their own; org admins may pass ?userId= to
  // read any member's thread in the project.
  @Get(":id/copilot/history")
  @RequirePermissions(P.AI_COPILOT_VIEW)
  @RequireFeature("copilot")
  async copilotHistory(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("userId") userId?: string) {
    await this.projects.get(user, id); // enforces campaign access
    let target = user.id;
    if (userId && userId !== user.id) {
      if (user.role !== "ADMIN") throw new ForbiddenException("You can only view your own chat.");
      target = userId;
    }
    return { configured: this.copilotChat.configured, messages: await this.copilotChat.history(id, target) };
  }

  // Admin oversight: list every member who has chatted in this project.
  @Get(":id/copilot/threads")
  @RequirePermissions(P.AI_COPILOT_VIEW)
  @RequireFeature("copilot")
  async copilotThreads(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.projects.get(user, id);
    if (user.role !== "ADMIN") throw new ForbiddenException("Only admins can view team chats.");
    return { threads: await this.copilotChat.threads(id) };
  }

  // Proactive prioritized action brief for the site (cached ~12h).
  @Get(":id/copilot/brief")
  @RequirePermissions(P.AI_COPILOT_VIEW)
  @RequireFeature("copilot")
  async copilotBrief(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const project = await this.projects.get(user, id);
    if (!this.copilotChat.configured) return { text: "", generatedAt: null };
    return this.copilotChat.brief(project);
  }

  @Delete(":id/copilot/history")
  @RequirePermissions(P.AI_COPILOT_VIEW)
  @RequireFeature("copilot")
  async copilotClear(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.projects.get(user, id);
    return this.copilotChat.clear(id, user.id);
  }

  // Ask a question — streams tool activity + answer tokens back as Server-Sent Events.
  // Tightly rate-limited: each answer runs an agentic LLM loop, so cap abuse/cost.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post(":id/copilot/stream")
  @RequirePermissions(P.AI_COPILOT_VIEW)
  @RequireFeature("copilot")
  async copilotStream(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: { question: string },
    @Res() res: Response,
  ) {
    const project = await this.projects.get(user, id);
    const q = (dto?.question || "").trim().slice(0, 2000);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    if (!q) {
      res.write(`data: ${JSON.stringify({ type: "done", message: null })}\n\n`);
      res.end();
      return;
    }
    try {
      for await (const ev of this.copilotChat.streamAnswer(project, user.id, q)) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    } catch {
      res.write(`data: ${JSON.stringify({ type: "error", message: "The AI couldn't respond right now." })}\n\n`);
    } finally {
      res.end();
    }
  }
}
