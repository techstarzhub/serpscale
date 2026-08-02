import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CopilotService, type ChatTurn } from "../copilot/copilot.service";
import { DataForSeoService } from "../dataforseo/dataforseo.service";
import { StorageService } from "../storage/storage.service";
import { ImagesService } from "../images/images.service";
import { ProjectsService } from "../projects/projects.service";
import { renderPdf } from "../crawl/report";
import { blogToHtml } from "./blog-export";
import type { AuthUser } from "../auth/decorators/current-user.decorator";

type BlogEvent =
  | { type: "token"; text: string }
  | { type: "status"; message: string }
  | { type: "done"; full: string }
  | { type: "error"; message: string };

// How many in-body section images to add (on top of the cover). Keeps a blog
// visually rich without ballooning cost (~₹0.26/image).
const MAX_SECTION_IMAGES = 3;

const toInt = (v: unknown) => (v == null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v)));
const toNum = (v: unknown) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

// Approximate word count of a markdown draft (meta lines + syntax stripped).
const blogWords = (t: string) =>
  t
    .replace(/^\s*meta (title|description):.*$/gim, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>`|~-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

// Split off the trailing conclusion / FAQ so continuation rounds extend the BODY and
// the wrap-up stays at the very end (instead of new sections landing after it).
const splitTrailer = (t: string): { body: string; trailer: string } => {
  const m = t.match(/\n#{1,6}\s*(conclusion|final thoughts?|wrapping up|in summary|key takeaways?|faq|frequently asked questions?)\b/i);
  if (!m || m.index == null) return { body: t, trailer: "" };
  return { body: t.slice(0, m.index).trimEnd(), trailer: t.slice(m.index).trim() };
};

// gpt-oss sometimes prefixes a stray refusal ("I'm sorry, but I can't provide that.")
// before happily writing the content anyway — strip it.
const stripRefusal = (t: string): string =>
  t.replace(/^\s*(i['’]m sorry[^.\n]*\.?|i\s+(can'?t|cannot)\s+(provide|help|assist|do)[^.\n]*\.?|sorry,[^.\n]*\.?)\s*/i, "").trimStart();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Utility pages we don't weave into prose (fine only as a last-resort related list).
const isUtilityPage = (url: string) => /\/(login|signup|register|cart|checkout|account|privacy|terms|policy|sitemap)\b/i.test(url);

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: CopilotService,
    private readonly storage: StorageService,
    private readonly dfs: DataForSeoService,
    private readonly images: ImagesService,
    private readonly projects: ProjectsService,
  ) {}

  // ---- AI keyword advisor ----

  // Combines REAL keyword data (volume/difficulty/trend from the data provider +
  // the domain's striking-distance rankings) with AI prioritisation to recommend the
  // keywords most worth targeting to improve rankings. Numbers are always real; the AI
  // only groups, picks and explains — it never invents keywords or metrics.
  async aiKeywordSuggestions(user: AuthUser, projectId: string, opts?: { seed?: string; country?: string; language?: string }) {
    const project = await this.project(user, projectId);
    const country = opts?.country;
    const language = opts?.language || "en";
    const domain = project.domain;

    const saved = await this.prisma.savedKeyword.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 40 });
    const savedTerms = saved.map((s) => s.keyword);

    // Seeds: explicit seed, else top saved keywords, else the domain name itself.
    const seeds = (opts?.seed?.trim() ? [opts.seed.trim()] : savedTerms.slice(0, 3));
    if (!seeds.length) seeds.push(domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split(".")[0].replace(/[-_]+/g, " "));

    // Real candidate keywords (deduped) + the domain's striking-distance rankings.
    const ideaLists = await Promise.all(seeds.slice(0, 3).map((s) => this.dfs.keywordIdeas(s, country, language).catch(() => ({ connected: false, keywords: [] as any[] }))));
    const connected = ideaLists.some((l: any) => l?.connected !== false);
    const byKw = new Map<string, any>();
    for (const l of ideaLists) for (const k of (l as any).keywords ?? []) if (k.keyword && !byKw.has(k.keyword)) byKw.set(k.keyword, k);

    let striking: any[] = [];
    try {
      const ranked: any = await this.dfs.rankedKeywords(domain, country, language);
      striking = (ranked?.keywords ?? []).filter((k: any) => k.position != null && k.position >= 4 && k.position <= 20);
      for (const k of striking) if (k.keyword && !byKw.has(k.keyword)) byKw.set(k.keyword, k);
    } catch { /* provider optional */ }

    if (!byKw.size) return { connected, summary: "", groups: [] as any[] };

    const trendDir = (t?: number[]) => {
      if (!Array.isArray(t) || t.length < 4) return "flat";
      const recent = t.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const older = t.slice(0, Math.max(1, t.length - 3)).reduce((a, b) => a + b, 0) / Math.max(1, t.length - 3);
      if (older > 0 && recent > older * 1.15) return "up";
      if (older > 0 && recent < older * 0.85) return "down";
      return "flat";
    };

    // Compact real-data payload for the model (cap sizes to stay cheap/fast).
    const candidates = [...byKw.values()]
      .filter((k) => (k.volume ?? 0) > 0)
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 70)
      .map((k) => ({ keyword: k.keyword, volume: k.volume ?? 0, difficulty: k.difficulty ?? null, cpc: k.cpc ?? null, trend: trendDir(k.trend), position: k.position ?? null }));

    const system =
      `You are a senior SEO strategist. From the REAL keyword data provided, choose the best keywords for this site to target to improve its Google rankings. ` +
      `Only use keywords that appear in the data — NEVER invent keywords, and never change or invent any numbers. ` +
      `Group your picks into up to four buckets and return STRICT JSON only (no prose, no markdown) shaped exactly as:\n` +
      `{"summary":"1-2 sentence strategy","groups":[{"key":"quick_wins|trending|high_value|easy_wins","title":"short title","note":"one-line why this bucket matters","keywords":[{"keyword":"...","reason":"one concrete sentence on why to target it and how it helps ranking"}]}]}\n` +
      `Guidance: "quick_wins" = keywords the site already ranks 4-20 for (has a position) — closest to page one. "trending" = trend is up. "high_value" = strong volume with reasonable difficulty. "easy_wins" = low difficulty / long-tail. Put 3-6 keywords in each relevant bucket, skip a bucket if nothing fits, and prefer keywords related to the site's existing focus.`;
    const q =
      `Site: ${domain}\n` +
      `Keywords already saved by the user (their focus): ${savedTerms.slice(0, 20).join(", ") || "(none yet)"}\n` +
      `REAL keyword data (choose only from these):\n${JSON.stringify(candidates)}`;

    let parsed: any = null;
    try {
      const raw = await this.llm.once(system, q, []);
      const jsonStr = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
      parsed = JSON.parse(jsonStr);
    } catch { parsed = null; }

    // Enrich the AI's picks with the REAL metrics (AI never supplies numbers).
    const enrich = (kw: string, reason?: string) => {
      const k = byKw.get(kw) || [...byKw.values()].find((x) => x.keyword?.toLowerCase() === kw?.toLowerCase());
      if (!k) return null;
      return { keyword: k.keyword, volume: k.volume ?? 0, difficulty: k.difficulty ?? null, cpc: k.cpc ?? null, trend: trendDir(k.trend), position: k.position ?? null, reason: (reason || "").slice(0, 240) };
    };

    let groups: any[] = [];
    if (parsed?.groups?.length) {
      groups = parsed.groups
        .map((g: any) => ({
          key: String(g.key || "").slice(0, 20) || "picks",
          title: String(g.title || "Suggestions").slice(0, 60),
          note: String(g.note || "").slice(0, 120),
          items: (g.keywords ?? []).map((it: any) => enrich(it.keyword, it.reason)).filter(Boolean).slice(0, 8),
        }))
        .filter((g: any) => g.items.length);
    }

    // Deterministic fallback if the model returned nothing usable — still real data.
    if (!groups.length) {
      const all = [...byKw.values()];
      const mk = (title: string, note: string, key: string, items: any[]) => (items.length ? [{ key, title, note, items: items.map((k) => enrich(k.keyword)).filter(Boolean).slice(0, 8) }] : []);
      groups = [
        ...mk("Quick wins", "Already ranking 4-20 — a push can reach page one", "quick_wins", all.filter((k) => k.position >= 4 && k.position <= 20).sort((a, b) => a.position - b.position)),
        ...mk("Trending up", "Search interest rising", "trending", all.filter((k) => trendDir(k.trend) === "up" && (k.volume ?? 0) >= 30).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))),
        ...mk("High value", "Strong volume, worth the effort", "high_value", all.filter((k) => (k.volume ?? 0) >= 200).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))),
        ...mk("Easy wins", "Low difficulty, quicker to rank", "easy_wins", all.filter((k) => k.difficulty != null && k.difficulty < 30 && (k.volume ?? 0) >= 20).sort((a, b) => (a.difficulty ?? 99) - (b.difficulty ?? 99))),
      ];
    }

    return { connected, summary: String(parsed?.summary || "").slice(0, 300), groups };
  }

  // ---- Search history ----

  // Log a search a user ran. Upsert so repeat searches bump the timestamp instead
  // of piling up duplicates. When the caller passes the fetched result we cache it
  // on the row so the saved search can be reopened later with zero API cost.
  async logSearch(user: AuthUser, projectId: string, dto: { kind?: string; term?: string; result?: unknown }) {
    await this.project(user, projectId);
    const kind = dto?.kind === "serp" ? "serp" : "keyword";
    const term = (dto?.term ?? "").trim().slice(0, 200);
    if (!term) return { ok: false };
    const hasResult = dto?.result != null;
    const resultData = hasResult ? { result: dto!.result as any, resultAt: new Date() } : {};
    await this.prisma.searchHistory.upsert({
      where: { userId_projectId_kind_term: { userId: user.id, projectId, kind, term } },
      create: { userId: user.id, projectId, orgId: user.orgId ?? null, kind, term, ...resultData },
      update: { createdAt: new Date(), ...resultData },
    });
    return { ok: true };
  }

  // List — the tab needs the keyword count per search, so pull the stored result
  // but return only its derived count (never the heavy blob) to keep the response light.
  async mySearches(user: AuthUser, projectId: string) {
    await this.project(user, projectId);
    const rows = await this.prisma.searchHistory.findMany({
      where: { userId: user.id, projectId },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, kind: true, term: true, createdAt: true, resultAt: true, result: true },
    });
    return rows.map(({ resultAt, result, ...r }) => {
      const ideas = (result as any)?.ideas;
      return {
        ...r,
        resultAt,
        hasResult: !!resultAt,
        keywordCount: Array.isArray(ideas) ? ideas.length : 0,
      };
    });
  }

  // Full stored snapshot for one saved search — reopened without any API call.
  async getSearch(user: AuthUser, projectId: string, sid: string) {
    await this.project(user, projectId);
    const row = await this.prisma.searchHistory.findFirst({
      where: { id: sid, userId: user.id, projectId },
      select: { id: true, kind: true, term: true, result: true, resultAt: true },
    });
    if (!row) throw new NotFoundException("Saved search not found");
    return row;
  }

  async removeSearch(user: AuthUser, projectId: string, sid: string) {
    await this.project(user, projectId);
    await this.prisma.searchHistory.deleteMany({ where: { id: sid, userId: user.id, projectId } });
    return { ok: true };
  }

  // Org-admin oversight: every user's searches across the org, with name + avatar.
  async orgSearchActivity(user: AuthUser) {
    if (!user.orgId) return [];
    const rows = await this.prisma.searchHistory.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: { id: true, name: true, email: true, avatarKey: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return Promise.all(
      rows.map(async (r) => {
        const u = byId.get(r.userId);
        return {
          id: r.id,
          kind: r.kind,
          term: r.term,
          createdAt: r.createdAt,
          user: {
            name: u?.name ?? u?.email ?? "User",
            email: u?.email ?? "",
            avatarUrl: u?.avatarKey ? await this.storage.signedUrl(u.avatarKey).catch(() => null) : null,
          },
        };
      }),
    );
  }

  // Org-scoped access check (permission gating handled at the controller).
  private async project(user: AuthUser, projectId: string) {
    // Delegate to the canonical access rule so content honours assigned-scope
    // (a "view assigned only" member can't reach an unassigned campaign's blogs/
    // keywords) and org isolation — not just an org-wide id lookup.
    return this.projects.get(user, projectId);
  }

  // ---- Saved keywords ----

  async listKeywords(user: AuthUser, projectId: string) {
    await this.project(user, projectId);
    return this.prisma.savedKeyword.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
  }

  async saveKeyword(user: AuthUser, projectId: string, dto: { keyword?: string; volume?: number; difficulty?: number; cpc?: number }) {
    await this.project(user, projectId);
    const keyword = (dto?.keyword ?? "").trim().slice(0, 200);
    if (!keyword) throw new BadRequestException("A keyword is required.");
    return this.prisma.savedKeyword.upsert({
      where: { projectId_keyword: { projectId, keyword } },
      create: { projectId, keyword, volume: toInt(dto.volume), difficulty: toInt(dto.difficulty), cpc: toNum(dto.cpc), createdById: user.id },
      update: { volume: toInt(dto.volume), difficulty: toInt(dto.difficulty), cpc: toNum(dto.cpc) },
    });
  }

  async removeKeyword(user: AuthUser, projectId: string, kid: string) {
    await this.project(user, projectId);
    await this.prisma.savedKeyword.deleteMany({ where: { id: kid, projectId } });
    return { ok: true };
  }

  // Top internal pages from the latest completed crawl — real URLs the blog can
  // link to (ordered by how many internal links already point at them = importance).
  async internalPages(user: AuthUser, projectId: string, limit = 25) {
    await this.project(user, projectId);
    const crawl = await this.prisma.crawl.findFirst({
      where: { projectId, status: "COMPLETED" },
      orderBy: { finishedAt: "desc" },
      select: { id: true },
    });
    if (!crawl) return [];
    const pages = await this.prisma.crawlPage.findMany({
      where: { crawlId: crawl.id, statusCode: 200, title: { not: null } },
      orderBy: [{ inlinks: "desc" }, { depth: "asc" }],
      take: limit,
      select: { url: true, title: true },
    });
    return pages.map((p) => ({ url: p.url, title: (p.title || "").trim().slice(0, 120) }));
  }

  // ---- Blog generation (streamed) ----

  async *generateBlog(
    user: AuthUser,
    projectId: string,
    dto: { keywords?: string[]; title?: string; tone?: string; wordCount?: number; instructions?: string; images?: boolean; imageCount?: number; keepImages?: string[] },
  ): AsyncGenerator<BlogEvent> {
    const project = await this.project(user, projectId);
    const keywords = (dto?.keywords ?? []).map((k) => String(k).trim()).filter(Boolean).slice(0, 15);
    if (!keywords.length) {
      yield { type: "error", message: "Select at least one keyword to write about." };
      return;
    }
    const tone = (dto?.tone || "professional").slice(0, 40);
    const words = Math.min(3000, Math.max(400, Number(dto?.wordCount) || 900));
    const instructions = (dto?.instructions ?? "").trim().slice(0, 1500);
    // Validate links against every crawled page (up to 200); only list ~30 in the
    // prompt to keep it short. This way a link to any REAL page is kept, not unwrapped.
    const allPages = await this.internalPages(user, projectId, 200).catch(() => []);
    const pages = allPages.slice(0, 30);

    const linkBlock = pages.length
      ? `\n\nINTERNAL LINKING (required) — these are REAL pages on ${project.domain}. You MUST weave in at least 4-6 of them where genuinely relevant. Every link MUST be written as a markdown link: [descriptive anchor text](exact-url), with the URL copied character-for-character from this list. NEVER paste a bare/raw URL as plain text (e.g. writing "visit https://..."), NEVER invent, guess or shorten a URL, and never link to a page not listed here. Each link appears once.\n` +
        pages.map((p) => `- ${p.title || p.url} -> ${p.url}`).join("\n")
      : `\n\nThis site has no crawled pages available, so do NOT add any internal links or invent any URLs.`;

    const system =
      `You are a seasoned human freelance content writer and SEO specialist writing for the website ${project.domain}. ` +
      `Write ONE complete, original, publish-ready blog post that naturally targets the given keywords.\n\n` +
      `WRITE LIKE A REAL PERSON, NOT AN AI:\n` +
      `- Natural, varied rhythm — mix short and long sentences; use contractions (you're, it's, don't) and speak directly to the reader as "you".\n` +
      `- Be concrete and specific: real examples, plain language, an opinion where it fits. Sound like someone who has actually done this work.\n` +
      `- BAN these AI-tell phrases and any like them: "in today's fast-paced/digital world", "in the ever-evolving landscape", "unlock", "delve/dive into", "navigate the world of", "when it comes to", "moreover", "furthermore", "in conclusion", "it's important/worth noting", "realm", "tapestry", "game-changer", "leverage", "robust", "seamless", "elevate", "supercharge".\n` +
      `- No robotic parallel structure, no padding, no restating the heading in the first line of its section. Never say or imply you are an AI.\n\n` +
      `FORMATTING (strict):\n` +
      `- Use ONLY: one H1, "Meta description:" line, H2/H3 headings, normal paragraphs, and simple "- " bullet lists.\n` +
      `- DO NOT use markdown tables, pipe characters (|), or horizontal rules (---). If you need to compare things, write it as prose or a short bullet list, never a table.\n` +
      `- No emojis, no preamble.\n\n` +
      `STRUCTURE (output in EXACTLY this order):\n` +
      `1. A line "Meta title: ..." — the search-result headline / title tag, 50-60 characters, includes the primary keyword.\n` +
      `2. A line "Meta description: ..." — 150-160 characters, compelling, includes the primary keyword.\n` +
      `3. The on-page headline as a single H1 (# ...). It should read naturally for a human and may differ from the meta title.\n` +
      `4. A short, engaging intro that hooks the reader.\n` +
      `5. Several H2 sections (## ...) with H3 sub-points where useful, plus short paragraphs and the occasional bullet list.\n` +
      `6. A brief, human conclusion (do not start it with "In conclusion").\n` +
      `7. A short "FAQ" H2 with 3 question/answer pairs.\n` +
      `The "Meta title:" and "Meta description:" lines must be plain text (no markdown, no # or ** around them).` +
      linkBlock;
    const sections = Math.max(4, Math.round(words / 300));
    const q =
      `Target keywords (primary first): ${keywords.join(", ")}.\n` +
      (dto?.title ? `Preferred title/angle: ${dto.title}.\n` : "") +
      `Tone: ${tone}.\n` +
      `LENGTH: Write AT LEAST ${words} words of article body (aim for ${words}-${words + 250}). This is a firm minimum — cover the topic in real depth across about ${sections} substantial H2 sections, each with a few full paragraphs. Do NOT wrap up early, and do NOT pad with filler or repetition to hit the count; add genuinely useful detail, examples and sub-points instead.\n` +
      (instructions
        ? `\nExtra instructions from the user — follow these closely as long as they don't break the formatting rules above:\n"""${instructions}"""\n`
        : "") +
      `Write the full blog post now. Include at least 4-6 internal links using ONLY the exact URLs from the provided list, and do not use any tables.`;

    // Reasoning models spend hidden tokens before the visible answer, so scale the
    // budget to the requested length (≈1.5 tokens/word) with headroom for reasoning.
    const maxTokens = Math.min(32000, Math.round(words * 2.4) + 4000);
    let acc = "";
    for await (const ev of this.llm.stream(system, q, { maxTokens })) {
      if (ev.type === "token") {
        acc += ev.text;
        yield { type: "token", text: ev.text };
      } else if (ev.type === "final") {
        acc = ev.content || acc;
      }
    }
    acc = stripRefusal(acc);

    // Small models often wrap up short of long targets. To extend, we pass the draft
    // back as the model's OWN prior turn and ask it to keep going (feeding the draft as
    // a user message makes it refuse or restart). We hold the conclusion/FAQ aside so
    // new sections land in the body, then re-attach the trailer at the very end.
    let rounds = 0;
    while (blogWords(acc) < Math.round(words * 0.85) && rounds < 2) {
      rounds++;
      const { body, trailer } = splitTrailer(acc);
      const have = blogWords(body);
      const need = Math.max(250, words - blogWords(acc));
      const firstH2 = (body.match(/\n##\s+(.+)/)?.[1] || "").trim();
      const history: ChatTurn[] = [
        { role: "user", content: q },
        { role: "assistant", content: body },
      ];
      const cq =
        `Keep writing the SAME article — continue seamlessly from where it stops. Add about ${need} more words as ${rounds === 1 ? "two or three" : "one or two"} new "## " sections with full paragraphs, and include 1-2 more internal links using ONLY the exact URLs from the list in your instructions. ` +
        `Do NOT repeat or rewrite anything already written, do NOT restart, do NOT output a title, "Meta title:"/"Meta description:" line, conclusion or FAQ. Output only the new sections to append.`;
      let piece = "";
      for await (const ev of this.llm.run(system, history, cq, [], Math.min(16000, need * 3 + 2500))) {
        if (ev.type === "token") {
          piece += ev.text;
          yield { type: "token", text: ev.text };
        } else if (ev.type === "final") {
          piece = ev.content || piece;
        }
      }
      piece = stripRefusal(piece.trim());
      // Guard against the model ignoring instructions and re-emitting the article.
      if (!piece || (firstH2 && piece.includes(firstH2))) break;
      acc = `${body}\n\n${piece}${trailer ? `\n\n${trailer}` : ""}`.trim();
    }

    const clean = this.sanitizeBlog(acc, allPages, project.domain);
    let full = this.ensureInternalLinks(clean, allPages, project.domain, 4);

    // Brand-aware AI images: a cover + a few in-body section images. Best-effort —
    // if generation is disabled or fails, the blog just ships without them.
    if (Array.isArray(dto?.keepImages) && dto.keepImages.length) {
      // Content-only regenerate: re-use the images the draft already had (no new
      // image API cost) — just place them into the fresh text.
      full = this.placeImages(full, dto.keepImages.filter((u) => typeof u === "string" && u));
    } else if (dto?.images !== false && this.images.isEnabled()) {
      // Total images the blog gets (cover + section images), capped at 3, default 1.
      const total = Math.max(1, Math.min(3, Math.round(Number(dto?.imageCount)) || 1));
      const plan = await this.planBlogImages(project, full, keywords, tone, total).catch(() => null);
      if (plan && plan.order.length) full = yield* this.runImagePlan(project, plan);
    }
    yield { type: "done", full };
  }

  // ---- AI images for blogs -------------------------------------------------

  /** H2 headings worth illustrating (skips wrap-up / FAQ sections). */
  private illustratableHeadings(markdown: string): string[] {
    const out: string[] = [];
    for (const m of markdown.matchAll(/^##\s+(.+)$/gm)) {
      const h = m[1].trim();
      if (/\b(faq|frequently asked|conclusion|final thoughts|wrapping up|in summary|key takeaways?)\b/i.test(h)) continue;
      out.push(h);
    }
    return out;
  }

  /**
   * Brand identity for image prompts: the white-label name and a brand colour so
   * generated visuals match the agency/client's look. Prefers a client's own
   * branding (when the campaign is attached to one) over the org's.
   */
  private async brandInfo(project: { id: string; orgId: string | null }): Promise<{ name: string; color: string }> {
    let name = "";
    let color = "";
    if (project.orgId) {
      const org = await this.prisma.organization.findUnique({ where: { id: project.orgId }, select: { branding: true } }).catch(() => null);
      const b = (org?.branding as Record<string, unknown> | null) ?? {};
      name = String(b.agencyName ?? "").slice(0, 80);
    }
    // A client attached to this campaign may carry its own white-label brand + colour.
    const client = await this.prisma.client
      .findFirst({ where: { projects: { some: { id: project.id } } }, select: { name: true, branding: true } })
      .catch(() => null);
    if (client) {
      const cb = (client.branding as Record<string, unknown> | null) ?? {};
      name = String(cb.agencyName || client.name || name).slice(0, 80);
      const c = String(cb.logoBg ?? "").trim();
      if (/^#?[0-9a-f]{3,8}$/i.test(c)) color = c.startsWith("#") ? c : `#${c}`;
    }
    return { name, color };
  }

  /**
   * Ask the LLM (Groq) to turn the blog + brand context into concrete, on-brand
   * image prompts — one cover, one per chosen section. Falls back to sensible
   * templated prompts when the LLM is unavailable or returns junk.
   */
  private async craftImagePrompts(
    ctx: { domain: string; brand: string; color: string; title: string; keywords: string[]; headings: string[]; tone: string },
  ): Promise<{ cover: string; sections: string[] }> {
    const topic = ctx.keywords.slice(0, 3).join(", ") || ctx.title;
    const brandBit = ctx.brand ? ` for the brand ${ctx.brand}` : "";
    const colorBit = ctx.color ? ` Use a colour palette built around ${ctx.color}.` : "";
    const fallbackCover = `Modern, professional editorial hero image${brandBit} about ${topic}. Clean composition, ${ctx.tone} mood, soft lighting, high quality.${colorBit} No text or words in the image.`;
    const fallback = {
      cover: fallbackCover,
      sections: ctx.headings.map((h) => `Clean, modern editorial illustration representing "${h}" (topic: ${topic})${brandBit}. Professional, high quality.${colorBit} No text or words.`),
    };
    if (!this.llm.configured || ctx.headings.length === 0 && !ctx.title) return fallback;

    const sys = "You write vivid text-to-image prompts for a blog's images. Reply with STRICT JSON only, no prose.";
    const user =
      `Brand: ${ctx.brand || ctx.domain} (site ${ctx.domain}). Blog title: "${ctx.title}". Tone: ${ctx.tone}. ` +
      (ctx.color ? `Brand colour: ${ctx.color} — bias each image's palette toward it. ` : "") +
      `Primary keywords: ${ctx.keywords.slice(0, 6).join(", ")}.\n` +
      `Sections needing an image (in order): ${ctx.headings.map((h, i) => `${i + 1}) ${h}`).join("  ") || "(none)"}.\n` +
      `Write ONE "cover" prompt and one prompt per section. Each: a specific, photoreal-or-clean-illustration scene fitting the brand + topic, professional and on-brand. ` +
      `CRITICAL: never request any letters, words, captions or text in the image. 1-2 sentences each.\n` +
      `Return exactly: {"cover":"...","sections":["...", ...]} — sections in the same order and count as listed above.`;
    try {
      // Cap the wait: if the LLM is slow, fall back to templated prompts rather
      // than making the user stare at "Generating images…" for ages.
      const raw = await Promise.race([
        this.llm.once(sys, user, []),
        new Promise<string>((resolve) => setTimeout(() => resolve(""), 10_000)),
      ]);
      if (!raw) return fallback;
      const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      const cover = String(json.cover || fallbackCover).slice(0, 900);
      const secs: string[] = Array.isArray(json.sections) ? json.sections : [];
      return {
        cover,
        sections: ctx.headings.map((h, i) => String(secs[i] || fallback.sections[i]).slice(0, 900)),
      };
    } catch {
      return fallback;
    }
  }

  /**
   * Plan where images go and what each depicts — WITHOUT generating them. The
   * caller generates one at a time (so it can show "image N of M" and respect
   * provider throttling) then splices by LINE POSITION, so every image that
   * succeeds is actually placed. Anchors: cover after H1, then H2/H3 headings,
   * and evenly-spaced paragraphs as fallback when a short post has too few.
   */
  private async planBlogImages(
    project: { id: string; domain: string; orgId: string | null },
    markdown: string,
    keywords: string[],
    tone: string,
    totalImages = MAX_SECTION_IMAGES + 1,
  ): Promise<{ lines: string[]; title: string; order: { idx: number; heading: string; cover: boolean; prompt: string }[] }> {
    const total = Math.max(1, Math.min(3, totalImages));
    const lines = markdown.split("\n");
    const skippable = (h: string) => /\b(faq|frequently asked|conclusion|final thoughts|wrapping up|in summary|key takeaways?)\b/i.test(h);

    const h1Idx = lines.findIndex((l) => /^#\s+/.test(l));
    const title = (h1Idx >= 0 ? lines[h1Idx].replace(/^#\s+/, "") : keywords[0] || "").trim();

    const slots: { idx: number; heading: string; cover: boolean }[] = [];
    if (h1Idx >= 0) slots.push({ idx: h1Idx, heading: title, cover: true });
    for (let i = 0; i < lines.length && slots.length < total; i++) {
      const m = lines[i].match(/^(#{2,3})\s+(.+)$/);
      if (m && !skippable(m[2])) slots.push({ idx: i, heading: m[2].trim(), cover: false });
    }
    // Too few headings for the requested count? fill with spaced-out paragraphs.
    if (slots.length < total) {
      const used = new Set(slots.map((s) => s.idx));
      const paras = lines
        .map((l, i) => ({ l: l.trim(), i }))
        .filter((x) => !used.has(x.i) && x.l.length > 100 && !/^[#!\-*>|]/.test(x.l))
        .map((x) => x.i);
      const need = total - slots.length;
      for (let k = 1; k <= need && paras.length; k++) {
        slots.push({ idx: paras[Math.floor((k / (need + 1)) * paras.length)], heading: title, cover: false });
      }
    }
    slots.sort((a, b) => a.idx - b.idx);
    if (!slots.length) return { lines, title, order: [] };

    const brand = await this.brandInfo(project);
    const nonCover = slots.filter((s) => !s.cover);
    const prompts = await this.craftImagePrompts({
      domain: project.domain, brand: brand.name, color: brand.color, title, keywords,
      headings: nonCover.map((s) => s.heading), tone,
    });

    const order = slots.map((s) => ({
      idx: s.idx, heading: s.heading, cover: s.cover,
      prompt: s.cover ? prompts.cover : prompts.sections[nonCover.indexOf(s)] || prompts.cover,
    }));
    return { lines, title, order };
  }

  /**
   * Generate each planned image ONE AT A TIME (throttle-friendly, with a live
   * "image N of M" status), splice them into the plan's lines, and return the
   * final markdown. Shared by first-time generation and image-only regeneration.
   */
  private async *runImagePlan(
    project: { id: string },
    plan: { lines: string[]; title: string; order: { idx: number; heading: string; cover: boolean; prompt: string }[] },
  ): AsyncGenerator<BlogEvent, string> {
    const placed: { idx: number; cover: boolean; heading: string; url: string }[] = [];
    for (let i = 0; i < plan.order.length; i++) {
      const s = plan.order[i];
      yield { type: "status", message: plan.order.length > 1 ? `Generating image ${i + 1} of ${plan.order.length}…` : "Generating image…" };
      const img = await this.images.create(project.id, s.prompt, { aspectRatio: "16:9" });
      if (img) placed.push({ idx: s.idx, cover: s.cover, heading: s.heading, url: img.url });
    }
    if (placed.length) {
      placed.sort((a, b) => b.idx - a.idx); // splice bottom-up so indices stay valid
      for (const x of placed) plan.lines.splice(x.idx + 1, 0, "", `![${this.alt(x.cover ? plan.title : x.heading)}](${x.url})`);
    }
    return plan.lines.join("\n");
  }

  /**
   * Regenerate ONLY the images for an existing draft: strip the current images,
   * then plan + generate fresh ones. The text is untouched, so no writing-model
   * cost is incurred — only the image API.
   */
  async *reimageBlog(
    user: AuthUser,
    projectId: string,
    dto: { content?: string; keywords?: string[]; imageCount?: number },
  ): AsyncGenerator<BlogEvent> {
    const project = await this.project(user, projectId);
    // Remove any existing standalone image lines (and the blank line they leave).
    const stripped = String(dto?.content ?? "")
      .replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!stripped) { yield { type: "error", message: "Nothing to add images to." }; return; }
    let full = stripped;
    if (this.images.isEnabled()) {
      const total = Math.max(1, Math.min(3, Math.round(Number(dto?.imageCount)) || 1));
      const keywords = (dto?.keywords ?? []).map((k) => String(k).trim()).filter(Boolean).slice(0, 15);
      const plan = await this.planBlogImages(project, stripped, keywords, "professional", total).catch(() => null);
      if (plan && plan.order.length) full = yield* this.runImagePlan(project, plan);
    }
    yield { type: "done", full };
  }

  /** Place a set of EXISTING image URLs into markdown at cover/heading anchors,
   *  without generating anything (used to keep images on a content-only redo). */
  private placeImages(markdown: string, urls: string[]): string {
    if (!urls.length) return markdown;
    const lines = markdown.split("\n");
    const skippable = (h: string) => /\b(faq|frequently asked|conclusion|final thoughts|wrapping up|in summary|key takeaways?)\b/i.test(h);
    const h1Idx = lines.findIndex((l) => /^#\s+/.test(l));
    const title = (h1Idx >= 0 ? lines[h1Idx].replace(/^#\s+/, "") : "").trim();
    const slots: { idx: number; alt: string }[] = [];
    if (h1Idx >= 0) slots.push({ idx: h1Idx, alt: title });
    for (let i = 0; i < lines.length && slots.length < urls.length; i++) {
      const m = lines[i].match(/^(#{2,3})\s+(.+)$/);
      if (m && !skippable(m[2])) slots.push({ idx: i, alt: m[2].trim() });
    }
    const placed = slots.slice(0, urls.length).map((s, i) => ({ ...s, url: urls[i] }));
    placed.sort((a, b) => b.idx - a.idx);
    for (const x of placed) lines.splice(x.idx + 1, 0, "", `![${this.alt(x.alt)}](${x.url})`);
    return lines.join("\n");
  }

  private alt(s: string): string {
    return (s || "illustration").replace(/[\[\]()]/g, "").slice(0, 100);
  }

  /** Export a draft as a downloadable PDF or Word (.doc) file. */
  async exportBlog(
    user: AuthUser,
    projectId: string,
    dto: { content?: string; title?: string; format?: string },
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    await this.project(user, projectId);
    const content = String(dto?.content ?? "").trim();
    if (!content) throw new BadRequestException("Nothing to export.");
    const rawTitle = (dto?.title || content.match(/^#\s+(.+)$/m)?.[1] || "blog").trim();
    const slug = rawTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "blog";
    const html = blogToHtml(content, rawTitle);
    const format = (dto?.format || "pdf").toLowerCase();
    if (format === "pdf") {
      const pdf = await renderPdf(html);
      if (!pdf) throw new BadRequestException("Couldn't render the PDF right now. Please try again.");
      return { buffer: pdf, filename: `${slug}.pdf`, contentType: "application/pdf" };
    }
    if (format === "doc" || format === "docx" || format === "word") {
      // Word (and Google Docs) open HTML content saved as .doc, preserving
      // headings, images, links and lists — no extra dependency needed.
      return { buffer: Buffer.from(html, "utf-8"), filename: `${slug}.doc`, contentType: "application/msword" };
    }
    throw new BadRequestException("Unsupported export format.");
  }

  /** One-off image for the editor's "Generate image" button. */
  async generateImage(user: AuthUser, projectId: string, dto: { prompt?: string; aspectRatio?: string }): Promise<{ url: string }> {
    const project = await this.project(user, projectId);
    if (!this.images.isEnabled()) throw new BadRequestException("Image generation isn't configured.");
    const hint = (dto?.prompt ?? "").trim().slice(0, 500);
    if (!hint) throw new BadRequestException("Describe the image you want.");
    const brand = await this.brandInfo(project);
    // Let the LLM enrich a short hint into a strong, on-brand prompt (best effort).
    let prompt = hint;
    if (this.llm.configured) {
      const enriched = await this.llm
        .once(
          "You write one vivid text-to-image prompt. Reply with ONLY the prompt, no quotes or preamble. Never request any text/words in the image.",
          `Brand ${brand.name || project.domain} (${project.domain}).${brand.color ? ` Brand colour ${brand.color} — bias the palette toward it.` : ""} Turn this into a single professional, on-brand image prompt: "${hint}".`,
          [],
        )
        .catch(() => "");
      if (enriched && enriched.length > hint.length / 2) prompt = enriched.trim().slice(0, 900);
    }
    const res = await this.images.create(projectId, prompt, { aspectRatio: dto?.aspectRatio || "16:9" });
    if (!res) throw new BadRequestException("Couldn't generate an image right now. Please try again.");
    return res;
  }

  // Internal links are a hard requirement. If the model added fewer than `min`, weave
  // links into existing prose (matching each page's name), and if still short, append a
  // short "Related from <site>" list before the conclusion. Guarantees links every time.
  private ensureInternalLinks(text: string, pages: { url: string; title?: string }[], domain: string, min: number): string {
    if (!pages.length) return text;
    const norm = (u: string) => u.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
    const allowed = new Set(pages.map((p) => norm(p.url)));
    const anchorFor = (p: { url: string; title?: string }) => {
      let s = (p.title || "").split(/\s[|\-–—]\s/)[0].trim();
      if (!s) { try { s = new URL(p.url).pathname.split("/").filter(Boolean).pop()?.replace(/[-_]+/g, " ") || ""; } catch { s = ""; } }
      return s.slice(0, 80);
    };
    // Which pages are already linked?
    const linked = new Set<string>();
    for (const m of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      try { if (new URL(m[1]).hostname.replace(/^www\./i, "").toLowerCase() === norm(domain).split("/")[0] && allowed.has(norm(m[1]))) linked.add(norm(m[1])); } catch { /* ignore */ }
    }
    if (linked.size >= min) return text;

    // Candidate pages (prefer service/solution pages; utility pages last), unlinked only.
    const candidates = pages
      .filter((p) => !linked.has(norm(p.url)))
      .sort((a, b) => (isUtilityPage(a.url) ? 1 : 0) - (isUtilityPage(b.url) ? 1 : 0) || (/\/services?\//i.test(b.url) ? 1 : 0) - (/\/services?\//i.test(a.url) ? 1 : 0));

    const lines = text.split("\n");
    let count = linked.size;
    for (const p of candidates) {
      if (count >= min) break;
      if (isUtilityPage(p.url)) continue;
      const slug = (() => { try { return new URL(p.url).pathname.split("/").filter(Boolean).pop() || ""; } catch { return ""; } })();
      const phrases = [anchorFor(p), slug.replace(/[-_]+/g, " ").trim()].filter((s) => s && s.length >= 4);
      let woven = false;
      for (let i = 0; i < lines.length && !woven; i++) {
        const line = lines[i];
        if (/^\s*(#|meta (title|description):|-\s|\d+\.\s)/i.test(line) || line.includes("](")) continue; // skip headings, meta, lists, already-linked lines
        for (const phrase of phrases) {
          const re = new RegExp(`\\b(${escapeRe(phrase)})\\b`, "i");
          const mm = line.match(re);
          if (mm && mm.index != null) {
            lines[i] = line.slice(0, mm.index) + `[${mm[1]}](${p.url})` + line.slice(mm.index + mm[1].length);
            count++; woven = true; linked.add(norm(p.url));
            break;
          }
        }
      }
    }
    let out = lines.join("\n");

    // Still short → append a compact related-links list before the conclusion/FAQ.
    if (count < min) {
      const extra = candidates.filter((p) => !linked.has(norm(p.url))).slice(0, min - count);
      if (extra.length) {
        const host = norm(domain).split("/")[0];
        const block = `## Related from ${host}\n\n` + extra.map((p) => `- [${anchorFor(p) || p.url}](${p.url})`).join("\n");
        const t = splitTrailer(out);
        out = `${t.body}\n\n${block}${t.trailer ? `\n\n${t.trailer}` : ""}`.trim();
      }
    }
    return out;
  }

  // Final safety pass: guarantee no invented internal links and no table/rule artifacts
  // survive, even if the model ignores the instructions.
  private sanitizeBlog(raw: string, pages: { url: string; title?: string }[], domain: string): string {
    const norm = (u: string) => u.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
    const allowed = new Set(pages.map((p) => norm(p.url)));
    const siteHost = norm(domain).split("/")[0];
    // Clean anchor text from a page title (drop the " | ... - Brand" boilerplate).
    const anchorFor = (n: string, url: string): string => {
      const p = pages.find((x) => norm(x.url) === n);
      let s = (p?.title || "").split(/\s[|\-–—]\s/)[0].trim();
      if (!s) { try { s = new URL(url).pathname.split("/").filter(Boolean).pop()?.replace(/[-_]+/g, " ") || new URL(url).hostname.replace(/^www\./i, ""); } catch { s = url; } }
      return s.slice(0, 80);
    };

    raw = stripRefusal(raw);

    // 0) The model sometimes pastes BARE urls as plain text instead of markdown links.
    //    Turn every bare URL into a proper [anchor](url) so internal links actually render.
    raw = raw.replace(/(?<![("'\]=/])https?:\/\/[^\s<>()[\]]+/g, (rawUrl) => {
      const url = rawUrl.split(/[—–]/)[0].replace(/[.,;:!?)\]'"]+$/, ""); // trim trailing punctuation
      const trailing = rawUrl.slice(url.length);
      const n = norm(url);
      let host = "";
      try { host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return rawUrl; }
      const anchor = allowed.has(n) ? anchorFor(n, url) : host;
      return `[${anchor}](${url})${trailing}`;
    });

    // 1) Unwrap any link to a page that doesn't exist. Same-site links must be in the
    //    crawled list; relative/invalid URLs are treated as invented and unwrapped.
    let text = raw.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label: string, url: string) => {
      let host: string;
      try { host = new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return label; }
      if (host === siteHost) return allowed.has(norm(url)) ? m : label;
      return m; // genuine external link — leave it
    });

    // 2) Convert any stray markdown tables to plain bullet lines (drop separator rows),
    //    and remove horizontal rules — so no "borders" ever render.
    text = text
      .split("\n")
      .map((line) => {
        const t = line.trim();
        if (/^\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/.test(t)) return null; // table separator row
        if (/^\|.*\|?$/.test(t) && t.includes("|")) {
          const cells = t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()).filter(Boolean);
          return cells.length ? `- ${cells.join(" — ")}` : null;
        }
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(t)) return null; // horizontal rule
        return line;
      })
      .filter((l): l is string => l !== null)
      .join("\n");

    // 3) Drop duplicated blocks — guards against a model that restarted mid-continuation
    //    and re-emitted whole paragraphs. Short blocks (headings) can repeat legitimately.
    const seen = new Set<string>();
    text = text
      .split(/\n{2,}/)
      .filter((b) => {
        const key = b.trim().toLowerCase();
        if (key.length < 40) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join("\n\n");

    // 4) Tidy whitespace.
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }

  // ---- Saved blog drafts ----

  async listBlogs(user: AuthUser, projectId: string) {
    await this.project(user, projectId);
    return this.prisma.blogPost.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, keywords: true, createdAt: true },
    });
  }

  async getBlog(user: AuthUser, projectId: string, bid: string) {
    await this.project(user, projectId);
    const b = await this.prisma.blogPost.findFirst({ where: { id: bid, projectId } });
    if (!b) throw new NotFoundException("Blog not found");
    return b;
  }

  async saveBlog(user: AuthUser, projectId: string, dto: { title?: string; content?: string; keywords?: string[] }) {
    await this.project(user, projectId);
    const content = (dto?.content ?? "").trim();
    if (!content) throw new BadRequestException("Nothing to save.");
    const title = (dto?.title ?? "").trim().slice(0, 200) || content.replace(/^#\s*/, "").split("\n")[0].slice(0, 120) || "Untitled draft";
    return this.prisma.blogPost.create({
      data: {
        projectId,
        title,
        content: content.slice(0, 100_000),
        keywords: Array.isArray(dto.keywords) ? dto.keywords.map((k) => String(k)).slice(0, 30) : [],
        createdById: user.id,
      },
      select: { id: true, title: true, keywords: true, createdAt: true },
    });
  }

  async removeBlog(user: AuthUser, projectId: string, bid: string) {
    await this.project(user, projectId);
    await this.prisma.blogPost.deleteMany({ where: { id: bid, projectId } });
    return { ok: true };
  }
}
