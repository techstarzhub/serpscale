import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { RequirePermissions } from "../auth/decorators/require-permissions.decorator";
import { PERMISSIONS as P } from "../auth/permissions";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { ContentService } from "./content.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("projects")
export class ContentController {
  constructor(private readonly content: ContentService) {}

  // ---- Saved keywords ----
  @Get(":id/keywords/saved")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  listKeywords(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.content.listKeywords(user, id);
  }

  @Post(":id/keywords/saved")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  saveKeyword(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: { keyword?: string; volume?: number; difficulty?: number; cpc?: number },
  ) {
    return this.content.saveKeyword(user, id, dto);
  }

  @Delete(":id/keywords/saved/:kid")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  removeKeyword(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("kid") kid: string) {
    return this.content.removeKeyword(user, id, kid);
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
  listBlogs(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.content.listBlogs(user, id);
  }

  @Get(":id/blogs/:bid")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  getBlog(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("bid") bid: string) {
    return this.content.getBlog(user, id, bid);
  }

  @Post(":id/blogs")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  saveBlog(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: { title?: string; content?: string; keywords?: string[] }) {
    return this.content.saveBlog(user, id, dto);
  }

  @Delete(":id/blogs/:bid")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  removeBlog(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("bid") bid: string) {
    return this.content.removeBlog(user, id, bid);
  }

  // Generate a blog from selected keywords — streamed token-by-token over SSE.
  @Post(":id/blog/generate")
  @RequirePermissions(P.KEYWORDS_RESEARCH)
  async generate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: { keywords?: string[]; title?: string; tone?: string; wordCount?: number; instructions?: string },
    @Res() res: Response,
  ) {
    if (!Array.isArray(dto?.keywords) || dto.keywords.length === 0) {
      throw new BadRequestException("Select at least one keyword.");
    }
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
}
