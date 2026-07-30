import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ArticleStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { AuthUser } from "../auth/decorators/current-user.decorator";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "post";
}

interface ArticleInput {
  title?: string;
  slug?: string;
  excerpt?: string | null;
  content?: string;
  status?: "DRAFT" | "PUBLISHED";
  metaTitle?: string | null;
  metaDescription?: string | null;
  tags?: string[];
  categoryIds?: string[];
  publishedAt?: string | null;
}

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ---- slugs ----
  private async uniqueSlug(base: string, ignoreId?: string): Promise<string> {
    const root = slugify(base);
    let slug = root;
    let i = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clash = await this.prisma.article.findFirst({ where: { slug, id: ignoreId ? { not: ignoreId } : undefined }, select: { id: true } });
      if (!clash) return slug;
      slug = `${root}-${i++}`;
    }
  }

  private async cover(coverKey: string | null): Promise<string | null> {
    return coverKey ? this.storage.signedUrl(coverKey) : null;
  }

  private async map(a: any) {
    return {
      id: a.id,
      title: a.title,
      slug: a.slug,
      excerpt: a.excerpt,
      content: a.content,
      status: a.status,
      metaTitle: a.metaTitle,
      metaDescription: a.metaDescription,
      tags: a.tags ?? [],
      categories: (a.categories ?? []).map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })),
      author: a.author ? { id: a.author.id, name: a.author.name, email: a.author.email } : null,
      coverUrl: await this.cover(a.coverKey ?? null),
      publishedAt: a.publishedAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  // ================= ADMIN =================

  async adminList() {
    const rows = await this.prisma.article.findMany({
      orderBy: { updatedAt: "desc" },
      include: { categories: true, author: { select: { id: true, name: true, email: true } } },
    });
    return Promise.all(rows.map((r) => this.map(r)));
  }

  async adminGet(id: string) {
    const a = await this.prisma.article.findUnique({
      where: { id },
      include: { categories: true, author: { select: { id: true, name: true, email: true } } },
    });
    if (!a) throw new NotFoundException("Article not found");
    return this.map(a);
  }

  async create(user: AuthUser, dto: ArticleInput) {
    const title = (dto.title ?? "").trim();
    if (!title) throw new BadRequestException("Title is required.");
    const slug = await this.uniqueSlug(dto.slug || title);
    const status = dto.status === "PUBLISHED" ? ArticleStatus.PUBLISHED : ArticleStatus.DRAFT;
    const a = await this.prisma.article.create({
      data: {
        title,
        slug,
        excerpt: dto.excerpt ?? null,
        content: dto.content ?? "",
        status,
        metaTitle: dto.metaTitle ?? null,
        metaDescription: dto.metaDescription ?? null,
        tags: dto.tags ?? [],
        authorId: user.id,
        publishedAt: status === ArticleStatus.PUBLISHED ? (dto.publishedAt ? new Date(dto.publishedAt) : new Date()) : null,
        ...(dto.categoryIds?.length ? { categories: { connect: dto.categoryIds.map((id) => ({ id })) } } : {}),
      },
      include: { categories: true, author: { select: { id: true, name: true, email: true } } },
    });
    return this.map(a);
  }

  async update(id: string, dto: ArticleInput) {
    const existing = await this.prisma.article.findUnique({ where: { id }, select: { id: true, slug: true, status: true, publishedAt: true } });
    if (!existing) throw new NotFoundException("Article not found");

    const data: Prisma.ArticleUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.slug !== undefined && dto.slug.trim()) data.slug = await this.uniqueSlug(dto.slug, id);
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.metaTitle !== undefined) data.metaTitle = dto.metaTitle;
    if (dto.metaDescription !== undefined) data.metaDescription = dto.metaDescription;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.categoryIds !== undefined) data.categories = { set: dto.categoryIds.map((cid) => ({ id: cid })) };

    if (dto.status !== undefined) {
      const status = dto.status === "PUBLISHED" ? ArticleStatus.PUBLISHED : ArticleStatus.DRAFT;
      data.status = status;
      // First time going live → stamp publishedAt.
      if (status === ArticleStatus.PUBLISHED && !existing.publishedAt) {
        data.publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : new Date();
      }
      if (status === ArticleStatus.DRAFT) data.publishedAt = null;
    } else if (dto.publishedAt !== undefined && existing.status === ArticleStatus.PUBLISHED) {
      data.publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : new Date();
    }

    const a = await this.prisma.article.update({
      where: { id },
      data,
      include: { categories: true, author: { select: { id: true, name: true, email: true } } },
    });
    return this.map(a);
  }

  async remove(id: string) {
    const a = await this.prisma.article.findUnique({ where: { id }, select: { coverKey: true } });
    if (!a) throw new NotFoundException("Article not found");
    if (a.coverKey) await this.storage.remove(a.coverKey).catch(() => {});
    await this.prisma.article.delete({ where: { id } });
    return { ok: true };
  }

  async setCover(id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded.");
    const existing = await this.prisma.article.findUnique({ where: { id }, select: { coverKey: true } });
    if (!existing) throw new NotFoundException("Article not found");
    const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = this.storage.key("blog", id, `cover-${Date.now()}.${ext}`);
    await this.storage.put(key, file.buffer, file.mimetype || "image/jpeg");
    if (existing.coverKey) await this.storage.remove(existing.coverKey).catch(() => {});
    await this.prisma.article.update({ where: { id }, data: { coverKey: key } });
    return { coverUrl: await this.storage.signedUrl(key) };
  }

  async removeCover(id: string) {
    const a = await this.prisma.article.findUnique({ where: { id }, select: { coverKey: true } });
    if (a?.coverKey) await this.storage.remove(a.coverKey).catch(() => {});
    await this.prisma.article.update({ where: { id }, data: { coverKey: null } });
    return { ok: true };
  }

  // ---- categories ----
  async listCategories() {
    const rows = await this.prisma.articleCategory.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { articles: true } } },
    });
    return rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c._count.articles }));
  }

  async createCategory(dto: { name?: string }) {
    const name = (dto.name ?? "").trim();
    if (!name) throw new BadRequestException("Category name is required.");
    const slug = await this.uniqueCategorySlug(name);
    return this.prisma.articleCategory.create({ data: { name, slug } });
  }

  async updateCategory(id: string, dto: { name?: string }) {
    const name = (dto.name ?? "").trim();
    if (!name) throw new BadRequestException("Category name is required.");
    return this.prisma.articleCategory.update({ where: { id }, data: { name } });
  }

  async removeCategory(id: string) {
    await this.prisma.articleCategory.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Category not found");
    });
    return { ok: true };
  }

  private async uniqueCategorySlug(base: string): Promise<string> {
    const root = slugify(base);
    let slug = root;
    let i = 1;
    while (await this.prisma.articleCategory.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${root}-${i++}`;
    }
    return slug;
  }

  // ================= PUBLIC (marketing site) =================

  async publicList(opts: { category?: string; tag?: string; limit?: number; page?: number }) {
    const take = Math.min(Math.max(opts.limit ?? 24, 1), 60);
    const page = Math.max(opts.page ?? 1, 1);
    const where: Prisma.ArticleWhereInput = {
      status: ArticleStatus.PUBLISHED,
      ...(opts.category ? { categories: { some: { slug: opts.category } } } : {}),
      ...(opts.tag ? { tags: { has: opts.tag } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * take,
        take,
        include: { categories: true, author: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.article.count({ where }),
    ]);
    return { total, page, pageSize: take, posts: await Promise.all(rows.map((r) => this.map(r))) };
  }

  async publicBySlug(slug: string) {
    const a = await this.prisma.article.findFirst({
      where: { slug, status: ArticleStatus.PUBLISHED },
      include: { categories: true, author: { select: { id: true, name: true, email: true } } },
    });
    if (!a) throw new NotFoundException("Post not found");
    return this.map(a);
  }

  async publicCategories() {
    const rows = await this.prisma.articleCategory.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { articles: { where: { status: ArticleStatus.PUBLISHED } } } } },
    });
    return rows.filter((c) => c._count.articles > 0).map((c) => ({ name: c.name, slug: c.slug, count: c._count.articles }));
  }

  async publicSlugs() {
    const rows = await this.prisma.article.findMany({
      where: { status: ArticleStatus.PUBLISHED },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
    });
    return rows;
  }
}
