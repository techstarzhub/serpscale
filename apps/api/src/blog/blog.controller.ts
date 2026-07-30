import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../auth/decorators/current-user.decorator";
import { BlogService } from "./blog.service";

// ---- Super-admin CMS: manage blog articles + categories ----
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller("blog")
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list() {
    return this.blog.adminList();
  }

  // categories (declared before :id so they aren't captured as an article id)
  @Get("categories")
  categories() {
    return this.blog.listCategories();
  }

  @Post("categories")
  createCategory(@Body() dto: { name?: string }) {
    return this.blog.createCategory(dto);
  }

  @Patch("categories/:id")
  updateCategory(@Param("id") id: string, @Body() dto: { name?: string }) {
    return this.blog.updateCategory(id, dto);
  }

  @Delete("categories/:id")
  removeCategory(@Param("id") id: string) {
    return this.blog.removeCategory(id);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.blog.adminGet(id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.blog.create(user, dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: any) {
    return this.blog.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.blog.remove(id);
  }

  @Post(":id/cover")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } })) // 5MB
  setCover(@Param("id") id: string, @UploadedFile() file: Express.Multer.File) {
    return this.blog.setCover(id, file);
  }

  @Delete(":id/cover")
  removeCover(@Param("id") id: string) {
    return this.blog.removeCover(id);
  }
}

// ---- Public read API consumed by the marketing site (no auth) ----
@Controller("public/blog")
export class BlogPublicController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list(
    @Query("category") category?: string,
    @Query("tag") tag?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.blog.publicList({ category, tag, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  }

  @Get("categories")
  categories() {
    return this.blog.publicCategories();
  }

  @Get("slugs")
  slugs() {
    return this.blog.publicSlugs();
  }

  @Get(":slug")
  bySlug(@Param("slug") slug: string) {
    return this.blog.publicBySlug(slug);
  }
}
