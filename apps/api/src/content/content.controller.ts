import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS as P } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { FeaturesGuard } from "../entitlements/features.guard";
import { RequireFeature } from "../entitlements/require-feature.decorator";
import { AuditService } from "../auth/audit.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { ContentService } from "./content.service";

@UseGuards(JwtAuthGuard, PermissionsGuard, FeaturesGuard)
@Controller("projects")
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  // ---- Saved keywords ----
  @Get(":id/keywords/saved")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  listKeywords(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.content.listKeywords(user, id);
  }

  @Post(":id/keywords/saved")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  async saveKeyword(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: { keyword?: string; volume?: number; difficulty?: number; cpc?: number },
  ) {
    const res = await this.content.saveKeyword(user, id, dto);
    await this.audit.log(user, "content.keyword.save", { target: dto?.keyword ?? undefined, metadata: { projectId: id } });
    return res;
  }

  @Delete(":id/keywords/saved/:kid")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  async removeKeyword(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("kid") kid: string) {
    const res = await this.content.removeKeyword(user, id, kid);
    await this.audit.log(user, "content.keyword.remove", { target: kid, metadata: { projectId: id } });
    return res;
  }

  // AI keyword advisor — real data + AI prioritisation for what to target next.
  @Get(":id/keywords/ai-suggestions")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  aiSuggestions(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("seed") seed?: string,
    @Query("country") country?: string,
    @Query("language") language?: string,
  ) {
    return this.content.aiKeywordSuggestions(user, id, { seed, country, language });
  }

  // ---- Search history ----
  @Post(":id/search-history")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  logSearch(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { kind?: string; term?: string; result?: unknown }) {
    return this.content.logSearch(user, id, dto);
  }

  @Get(":id/search-history")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  mySearches(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.content.mySearches(user, id);
  }

  @Get(":id/search-history/:sid")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  getSearch(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("sid") sid: string) {
    return this.content.getSearch(user, id, sid);
  }

  @Delete(":id/search-history/:sid")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  removeSearch(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("sid") sid: string) {
    return this.content.removeSearch(user, id, sid);
  }

  // Org-admin: everyone's searches (name + avatar). Gated by team management.
  @Get("search-activity/all")
  @RequirePermissions(P.TEAM_MANAGE)
  orgSearchActivity(@CurrentUser() user: AuthUser) {
    return this.content.orgSearchActivity(user);
  }

  // Real internal pages (for auto internal-linking + the editor's link picker).
  @Get(":id/internal-pages")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  internalPages(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.content.internalPages(user, id);
  }

  // ---- Blog drafts ----
  @Get(":id/blogs")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  @RequireFeature("content")
  listBlogs(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.content.listBlogs(user, id);
  }

  @Get(":id/blogs/:bid")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  @RequireFeature("content")
  getBlog(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("bid") bid: string) {
    return this.content.getBlog(user, id, bid);
  }

  @Post(":id/blogs")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  @RequireFeature("content")
  async saveBlog(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { title?: string; content?: string; keywords?: string[] }) {
    const res = await this.content.saveBlog(user, id, dto);
    await this.audit.log(user, "content.blog.save", { target: dto?.title ?? undefined, metadata: { projectId: id } });
    return res;
  }

  @Delete(":id/blogs/:bid")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  @RequireFeature("content")
  async removeBlog(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("bid") bid: string) {
    const res = await this.content.removeBlog(user, id, bid);
    await this.audit.log(user, "content.blog.delete", { target: bid, metadata: { projectId: id } });
    return res;
  }

  // Generate a blog from selected keywords — streamed token-by-token over SSE.
  @Post(":id/blog/generate")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  @RequireFeature("content")
  async generate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: { keywords?: string[]; title?: string; tone?: string; wordCount?: number; instructions?: string; images?: boolean; imageCount?: number; keepImages?: string[] },
    @Res() res: Response,
  ) {
    if (!Array.isArray(dto?.keywords) || dto.keywords.length === 0) {
      throw new BadRequestException("Select at least one keyword.");
    }
    // Enforce the plan's monthly blog-generation cap BEFORE streaming (image-only
    // regenerations don't count — this is for fresh writes). Throws 403 with a
    // clear upgrade message; headers aren't flushed yet so it returns cleanly.
    await this.entitlements.assertBlogQuota(user.orgId);
    // Record usage UP-FRONT (right after the quota check), before streaming — so the
    // generation still counts toward the monthly cap even if the client disconnects
    // mid-stream. Otherwise a user could bypass the limit by aborting each request.
    // This also narrows the check→count concurrency window to milliseconds.
    await this.audit.log(user, "content.blog.generate", { target: dto?.title ?? undefined, metadata: { projectId: id, keywords: dto.keywords.length } });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    try {
      for await (const ev of this.content.generateBlog(user, id, dto)) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    } catch {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Couldn't generate the blog right now." })}\n\n`);
    } finally {
      res.end();
    }
  }

  // Regenerate ONLY the images for an existing draft (keeps the text) — streamed.
  @Post(":id/blog/reimage")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  @RequireFeature("content")
  async reimage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: { content?: string; keywords?: string[]; imageCount?: number },
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    try {
      for await (const ev of this.content.reimageBlog(user, id, dto)) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
      await this.audit.log(user, "content.image.generate", { target: "reimage", metadata: { projectId: id, count: dto?.imageCount ?? 1 } });
    } catch {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Couldn't regenerate images right now." })}\n\n`);
    } finally {
      res.end();
    }
  }

  // Download a draft as PDF or Word (.doc).
  @Post(":id/blog/export")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  @RequireFeature("content")
  async exportBlog(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: { content?: string; title?: string; format?: string },
    @Res() res: Response,
  ) {
    const { buffer, filename, contentType } = await this.content.exportBlog(user, id, dto);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // Generate a single AI image from a prompt (editor's "Generate image" button).
  @Post(":id/blog/image")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  @RequireFeature("content")
  async blogImage(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { prompt?: string; aspectRatio?: string }) {
    const res = await this.content.generateImage(user, id, dto);
    await this.audit.log(user, "content.image.generate", { target: (dto?.prompt ?? "").slice(0, 80), metadata: { projectId: id } });
    return res;
  }
}
