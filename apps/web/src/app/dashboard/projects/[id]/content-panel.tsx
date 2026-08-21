"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Star, X, FileText, Copy, Download, Check, PenLine, Trash2, Search, TrendingUp, RefreshCw, Image as ImageIcon, Link2, Plus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { streamAuditFix } from "@/components/copilot/copilot-core";
import { BlogEditor } from "./blog-editor";
import type { Project } from "@/components/providers/projects-provider";

interface SavedKeyword { id: string; keyword: string; volume: number | null; difficulty: number | null }
interface BlogRow { id: string; title: string; keywords: string[]; createdAt: string }
interface SavedSearch { id: string; term: string; keywordCount: number; hasResult: boolean }
interface KwMeta { keyword: string; volume: number | null }
interface InternalPage { url: string; title: string }

const TONES = ["professional", "friendly", "authoritative", "conversational", "persuasive"];
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";
// Compact search-volume label, e.g. 12,100 -> "12.1k".
const fmtVol = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v));

export function ContentPanel({ project }: { project: Project }) {
  const [keywords, setKeywords] = useState<SavedKeyword[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Saved searches usable as keyword bundles — selecting one pulls in every keyword
  // it found, so a blog can be generated from a whole search at once.
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [selectedSearches, setSelectedSearches] = useState<Set<string>>(new Set());
  const [searchKw, setSearchKw] = useState<Map<string, KwMeta[]>>(new Map());
  const [loadingSearch, setLoadingSearch] = useState<string | null>(null);
  const [internalPages, setInternalPages] = useState<InternalPage[]>([]);
  const [title, setTitle] = useState("");
  const [tone, setTone] = useState("professional");
  const [words, setWords] = useState(1500);
  const [instructions, setInstructions] = useState("");
  // External reference links the writer wants cited in the post.
  const [refLinks, setRefLinks] = useState<string[]>([]);
  const [refInput, setRefInput] = useState("");
  const [loadingKw, setLoadingKw] = useState(true);

  const [blog, setBlog] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [withImages, setWithImages] = useState(true);
  const [imageCount, setImageCount] = useState(1);
  const [regenOpen, setRegenOpen] = useState(false);
  const [reimaging, setReimaging] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [exporting, setExporting] = useState<"" | "pdf" | "doc">("");
  const [imgStatus, setImgStatus] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [blogs, setBlogs] = useState<BlogRow[]>([]);
  const [blogError, setBlogError] = useState<string | null>(null);
  const [blogUsage, setBlogUsage] = useState<{ used: number; limit: number | null } | null>(null);

  const loadKeywords = useCallback(() => {
    setLoadingKw(true);
    api
      .get<SavedKeyword[]>(`/projects/${project.id}/keywords/saved`)
      .then((r) => setKeywords(Array.isArray(r) ? r : []))
      .catch(() => setKeywords([]))
      .finally(() => setLoadingKw(false));
  }, [project.id]);
  const loadBlogs = useCallback(() => {
    api.get<BlogRow[]>(`/projects/${project.id}/blogs`).then((r) => setBlogs(Array.isArray(r) ? r : [])).catch(() => {});
  }, [project.id]);
  const loadSearches = useCallback(() => {
    api
      .get<SavedSearch[]>(`/projects/${project.id}/search-history`)
      .then((r) => setSearches((Array.isArray(r) ? r : []).filter((s) => s.keywordCount > 0)))
      .catch(() => setSearches([]));
  }, [project.id]);
  const loadPages = useCallback(() => {
    api.get<InternalPage[]>(`/projects/${project.id}/internal-pages`).then((r) => setInternalPages(Array.isArray(r) ? r : [])).catch(() => {});
  }, [project.id]);

  useEffect(() => { loadKeywords(); loadBlogs(); loadSearches(); loadPages(); }, [loadKeywords, loadBlogs, loadSearches, loadPages]);

  useEffect(() => {
    api.get<{ blogs: { used: number; limit: number | null } }>("/billing/usage")
      .then((u) => setBlogUsage(u?.blogs ?? null))
      .catch(() => {});
  }, []);

  function toggle(kw: string) {
    setSelected((s) => { const n = new Set(s); n.has(kw) ? n.delete(kw) : n.add(kw); return n; });
  }

  // Toggle a whole saved search on/off. Its keywords (the seed + every idea it found)
  // are fetched once, cached, then merged into the generation set.
  async function toggleSearch(s: SavedSearch) {
    if (selectedSearches.has(s.id)) {
      setSelectedSearches((set) => { const n = new Set(set); n.delete(s.id); return n; });
      return;
    }
    let kws = searchKw.get(s.id);
    if (!kws) {
      setLoadingSearch(s.id);
      try {
        const row = await api.get<{ term: string; result: { ideas?: { keyword: string; volume?: number | null }[] } | null }>(`/projects/${project.id}/search-history/${s.id}`);
        const ideas: KwMeta[] = (row.result?.ideas ?? []).filter((i) => i.keyword).map((i) => ({ keyword: i.keyword, volume: i.volume ?? null }));
        kws = [{ keyword: row.term, volume: null }, ...ideas].filter((k, i, a) => a.findIndex((x) => x.keyword === k.keyword) === i);
        setSearchKw((m) => new Map(m).set(s.id, kws!));
      } catch {
        kws = [];
      } finally {
        setLoadingSearch(null);
      }
    }
    setSelectedSearches((set) => new Set(set).add(s.id));
  }

  // Every keyword that will actually be sent to the generator: individually-picked
  // keywords plus all keywords from the selected saved searches (deduped).
  function allKeywords(): string[] {
    const set = new Set<string>(selected);
    for (const id of selectedSearches) (searchKw.get(id) || []).forEach((k) => set.add(k.keyword));
    return [...set];
  }

  // keyword (lowercased) -> monthly volume, for highlighting used keywords in the draft.
  function kwVolumes(): Map<string, number | null> {
    const m = new Map<string, number | null>();
    keywords.forEach((k) => { if (selected.has(k.keyword)) m.set(k.keyword.toLowerCase(), k.volume); });
    for (const id of selectedSearches) (searchKw.get(id) || []).forEach((k) => { if (!m.has(k.keyword.toLowerCase())) m.set(k.keyword.toLowerCase(), k.volume); });
    return m;
  }
  async function removeKeyword(k: SavedKeyword) {
    await api.del(`/projects/${project.id}/keywords/saved/${k.id}`).catch(() => {});
    setSelected((s) => { const n = new Set(s); n.delete(k.keyword); return n; });
    loadKeywords();
  }

  // Add a reference URL (auto-prefixes https:// and validates).
  function addRefLink(raw?: string) {
    const v = (raw ?? refInput).trim();
    if (!v) return;
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try { new URL(url); } catch { return; }
    setRefLinks((prev) => (prev.includes(url) ? prev : [...prev, url].slice(0, 12)));
    setRefInput("");
  }

  async function generate(useImages: boolean = withImages) {
    const kws = allKeywords();
    if (!kws.length) return;
    setGenerating(true); setBlog(""); setSaved(false); setImgStatus("");
    await streamAuditFix(
      `/projects/${project.id}/blog/generate`,
      { keywords: kws, title: title.trim() || undefined, tone, wordCount: words, instructions: instructions.trim() || undefined, referenceLinks: refLinks, images: useImages, imageCount },
      {
        onToken: (t) => setBlog(t),
        onStatus: (m) => setImgStatus(m),
        onDone: (t) => { setBlog(t); setGenerating(false); setImgStatus(""); },
        onError: (msg) => { setGenerating(false); setImgStatus(""); setBlogError(msg || "Couldn't generate the blog right now. Please try again."); },
      },
    );
  }

  // URLs of images already embedded in the current draft.
  function currentImageUrls(): string[] {
    return [...blog.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
  }

  // Content-only regenerate: rewrite the text but KEEP the existing images
  // (re-placed by the server — no new image API cost).
  async function regenerateContent() {
    const kws = allKeywords();
    if (!kws.length) return;
    const keepImages = currentImageUrls();
    setGenerating(true); setBlog(""); setSaved(false); setImgStatus("");
    await streamAuditFix(
      `/projects/${project.id}/blog/generate`,
      { keywords: kws, title: title.trim() || undefined, tone, wordCount: words, instructions: instructions.trim() || undefined, referenceLinks: refLinks, images: false, keepImages },
      {
        onToken: (t) => setBlog(t),
        onStatus: (m) => setImgStatus(m),
        onDone: (t) => { setBlog(t); setGenerating(false); setImgStatus(""); },
        onError: (msg) => { setGenerating(false); setImgStatus(""); setBlogError(msg || "Couldn't regenerate right now. Please try again."); },
      },
    );
  }

  // Regenerate ONLY the images for the current draft — keeps the text, so no
  // writing-model cost, just the image API. `reimaging` drives the in-place
  // "regenerating" animation over the existing images while it runs.
  async function reimage() {
    if (!blog) return;
    setReimaging(true); setGenerating(true); setSaved(false); setImgStatus("Generating image…");
    await streamAuditFix(
      `/projects/${project.id}/blog/reimage`,
      { content: blog, keywords: allKeywords(), imageCount },
      {
        onToken: () => {}, // no text tokens — only status + the final draft
        onStatus: (m) => setImgStatus(m),
        onDone: (t) => { if (t) setBlog(t); setGenerating(false); setReimaging(false); setImgStatus(""); },
        onError: () => { setGenerating(false); setReimaging(false); setImgStatus(""); },
      },
    );
  }

  async function saveBlog() {
    if (!blog) return;
    const titleLine = blog.replace(/^#\s*/, "").split("\n")[0].slice(0, 120);
    await api.post(`/projects/${project.id}/blogs`, { title: titleLine, content: blog, keywords: allKeywords() }).catch(() => {});
    setSaved(true);
    loadBlogs();
  }
  function copyBlog() {
    navigator.clipboard.writeText(blog).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }
  function fileName(ext: string) {
    const base = (title.trim() || blog.match(/^#\s+(.+)$/m)?.[1] || "blog-post").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "blog-post";
    return `${base}.${ext}`;
  }
  function triggerDownload(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }
  function downloadMarkdown() {
    triggerDownload(new Blob([blog], { type: "text/markdown" }), fileName("md"));
  }
  // PDF / Word are rendered server-side (Playwright for PDF, HTML-as-.doc for Word).
  async function exportAs(format: "pdf" | "doc") {
    if (!blog || exporting) return;
    setExporting(format); setDownloadOpen(false);
    try {
      const blob = await api.postDownload(`/projects/${project.id}/blog/export`, { content: blog, title: title.trim() || undefined, format });
      triggerDownload(blob, fileName(format));
    } catch {
      alert("Couldn't export the file right now. Please try again.");
    } finally {
      setExporting("");
    }
  }
  async function openBlog(id: string) {
    const b = await api.get<{ title: string; content: string; keywords: string[] }>(`/projects/${project.id}/blogs/${id}`).catch(() => null);
    if (b) { setBlog(b.content); setTitle(b.title); setSaved(true); }
  }
  async function deleteBlog(id: string) {
    await api.del(`/projects/${project.id}/blogs/${id}`).catch(() => {});
    loadBlogs();
  }

  const totalSelected = allKeywords().length;
  const volMap = kwVolumes();
  // Live word count of the draft (meta lines + markdown syntax stripped).
  const wordCount = blog
    .replace(/^\s*meta (title|description):.*$/gim, "")
    .replace(/[#*_>`|-]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .split(/\s+/)
    .filter(Boolean).length;
  const readMin = Math.max(1, Math.round(wordCount / 200));

  return (
    <div className="space-y-3">
      {/* Regenerate choice — avoids re-spending on image API when only text is wanted. */}
      {regenOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setRegenOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><RefreshCw className="h-4 w-4" /></span>
              <div>
                <h3 className="text-sm font-semibold leading-none">Regenerate</h3>
                <p className="mt-1 text-xs text-muted-foreground">Images use paid AI credits — pick what to redo.</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                disabled={totalSelected === 0}
                onClick={() => { setRegenOpen(false); regenerateContent(); }}
                className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-foreground"><FileText className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Content only</span>
                  <span className="block text-[11px] text-muted-foreground">Rewrites text · keeps your images</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => { setRegenOpen(false); reimage(); }}
                className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-foreground"><ImageIcon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Images only</span>
                  <span className="block text-[11px] text-muted-foreground">Keeps the text · makes {imageCount} new image{imageCount > 1 ? "s" : ""}</span>
                </span>
              </button>
              <button
                type="button"
                disabled={totalSelected === 0}
                onClick={() => { setRegenOpen(false); generate(true); }}
                className="flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><RefreshCw className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Everything</span>
                  <span className="block text-[11px] text-muted-foreground">New text + {imageCount} new image{imageCount > 1 ? "s" : ""}</span>
                </span>
              </button>
            </div>
            <button type="button" onClick={() => setRegenOpen(false)} className="mt-3 w-full rounded-lg py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Top bar: every article setting + the Generate action live here, so the
          sidebar below is purely for picking keywords. */}
      <Card>
        <CardContent className="space-y-2.5 p-3">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="min-w-0 flex-1 lg:min-w-[180px]">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Title / angle (optional)</label>
              <Input className="h-9" placeholder="e.g. 10 tips for…" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="w-full sm:w-36">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Tone</label>
              <select className={cn(field, "h-9 capitalize")} value={tone} onChange={(e) => setTone(e.target.value)}>
                {TONES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div className="w-full sm:w-24">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Length</label>
              <select className={cn(field, "h-9")} value={words} onChange={(e) => setWords(Number(e.target.value))}>
                {[600, 900, 1200, 1500, 2000].map((w) => <option key={w} value={w}>{w}w</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">AI images</label>
              <button
                type="button"
                onClick={() => setWithImages((v) => !v)}
                title={withImages ? "AI images on" : "AI images off"}
                className={cn("flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors", withImages ? "border-primary/40 bg-primary/5" : "border-border hover:bg-secondary")}
              >
                <ImageIcon className={cn("h-4 w-4", withImages ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("relative h-5 w-9 rounded-full transition-colors", withImages ? "bg-primary" : "bg-border")}>
                  <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-all", withImages ? "left-[1.125rem]" : "left-0.5")} />
                </span>
              </button>
            </div>
            {withImages && (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Count</label>
                <div className="flex h-9 items-center rounded-lg border border-border bg-card p-0.5">
                  {[1, 2, 3].map((n) => (
                    <button key={n} type="button" onClick={() => setImageCount(n)} className={cn("h-7 w-7 rounded-md text-xs font-semibold tabular-nums transition-colors", imageCount === n ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{n}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col items-end gap-1">
              {blogUsage?.limit != null && (
                <span className={cn(
                  "text-[11px] font-medium",
                  blogUsage.used >= blogUsage.limit ? "text-destructive" : blogUsage.used >= blogUsage.limit * 0.9 ? "text-chart-3" : "text-muted-foreground",
                )}>
                  {blogUsage.used} / {blogUsage.limit} drafts this month
                </span>
              )}
              <Button
                className="h-9 gap-2 px-5 font-semibold shadow-sm"
                onClick={() => { setBlogError(null); blog ? setRegenOpen(true) : generate(); }}
                disabled={generating || (!blog && totalSelected === 0) || (blogUsage?.limit != null && blogUsage.used >= blogUsage.limit)}
                title={blogUsage?.limit != null && blogUsage.used >= blogUsage.limit ? "Monthly blog limit reached — upgrade to generate more" : undefined}
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : blog ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {generating ? (imgStatus || "Writing…") : blog ? "Regenerate" : totalSelected ? `Generate · ${totalSelected} kw` : "Generate"}
              </Button>
            </div>
          </div>

          {blogError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{blogError}</span>
              {/plan|limit|upgrade/i.test(blogError) && (
                <Link href="/dashboard/settings/billing" className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80">Upgrade</Link>
              )}
              <button onClick={() => setBlogError(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
            </div>
          )}

          {/* Optional freeform instructions — full-width under the controls. */}
          <div className="relative">
            <Sparkles className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Extra AI instructions (optional) — e.g. add a comparison, mention our free trial, short paragraphs…"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={1500}
            />
          </div>

          {/* Reference links — external URLs the AI should cite in the post. */}
          <div className="space-y-2">
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-8 pr-16"
                placeholder="Reference link (optional) — paste a URL to cite, then Enter"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRefLink(); } }}
              />
              <button
                type="button"
                onClick={() => addRefLink()}
                disabled={!refInput.trim()}
                className="absolute right-1.5 top-1/2 flex h-6 -translate-y-1/2 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            {refLinks.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {refLinks.map((u) => (
                  <span key={u} className="flex max-w-full items-center gap-1 rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-xs">
                    <Link2 className="h-3 w-3 shrink-0 text-primary" />
                    <span className="max-w-[220px] truncate">{u.replace(/^https?:\/\//, "")}</span>
                    <button onClick={() => setRefLinks((prev) => prev.filter((x) => x !== u))} className="shrink-0 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <span className="self-center text-[11px] text-muted-foreground">The blog will cite these &amp; add a References section.</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sidebar (keywords + drafts) + the editor */}
      <div className="grid gap-3 lg:grid-cols-[300px_1fr] lg:items-start">
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        {/* Box 1 — saved keywords (scrolls internally when long) */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary shadow-sm"><Star className="h-4 w-4" /></span>
                <div>
                  <h4 className="text-sm font-semibold leading-none">Saved keywords</h4>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {selected.size > 0 ? <span className="font-medium text-primary">{selected.size} selected</span> : "Tap to pick topics"}
                  </p>
                </div>
              </div>
              {selected.size > 0 && (
                <button
                  onClick={() => setSelected(new Set())}
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="max-h-[300px] overflow-y-auto p-2">
              {loadingKw ? (
                <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : keywords.length === 0 ? (
                <p className="m-1 rounded-xl border border-dashed border-border p-5 text-center text-xs leading-relaxed text-muted-foreground">
                  No saved keywords yet.<br />Research in the <span className="font-medium text-foreground">Keywords</span> tab and tap ★ to save them here.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {keywords.map((k) => {
                    const on = selected.has(k.keyword);
                    return (
                      <div
                        key={k.id}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                          on ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-secondary/60",
                        )}
                      >
                        <button onClick={() => toggle(k.keyword)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                          <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">{k.keyword}</span>
                        </button>
                        {k.volume != null && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground" title="Monthly searches">
                            <Search className="h-2.5 w-2.5" />{fmtVol(k.volume)}
                          </span>
                        )}
                        <button onClick={() => removeKeyword(k)} title="Remove keyword" className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Box 2 — whole searches (scrolls internally when long) */}
        {searches.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary shadow-sm"><Search className="h-4 w-4" /></span>
                  <div>
                    <h4 className="text-sm font-semibold leading-none">Whole searches</h4>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {selectedSearches.size > 0 ? <span className="font-medium text-primary">{selectedSearches.size} added</span> : "Adds every keyword found"}
                    </p>
                  </div>
                </div>
                {selectedSearches.size > 0 && (
                  <button
                    onClick={() => setSelectedSearches(new Set())}
                    className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-[240px] overflow-y-auto p-2">
                <div className="space-y-0.5">
                  {searches.map((s) => {
                    const on = selectedSearches.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleSearch(s)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                          on ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-secondary/60",
                        )}
                      >
                        <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                          {loadingSearch === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{s.term}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground" title="Keywords found in this search">
                          <TrendingUp className="h-2.5 w-2.5" />{s.keywordCount} kw
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {blogs.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2.5 border-b border-border bg-secondary/40 px-4 py-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary shadow-sm"><FileText className="h-4 w-4" /></span>
                <div>
                  <h4 className="text-sm font-semibold leading-none">Saved drafts</h4>
                  <p className="mt-1 text-[11px] text-muted-foreground">{blogs.length} saved</p>
                </div>
              </div>
              <div className="space-y-0.5 p-2">
                {blogs.map((b) => (
                  <div key={b.id} className="group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/60">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground"><FileText className="h-3.5 w-3.5" /></span>
                    <button onClick={() => openBlog(b.id)} className="min-w-0 flex-1 truncate text-left text-sm font-medium transition-colors hover:text-primary">{b.title}</button>
                    <button onClick={() => deleteBlog(b.id)} title="Delete" className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right: generated blog */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><PenLine className="h-4 w-4" /></span>
            <div>
              <h4 className="text-sm font-semibold">Blog draft</h4>
              <p className="text-xs text-muted-foreground">
                {wordCount > 0 ? <>{wordCount.toLocaleString()} words · ~{readMin} min read</> : "AI-written, targeting your selected keywords"}
              </p>
            </div>
          </div>
          {blog && !generating && (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setRegenOpen(true)} title="Regenerate content, images, or both"><RefreshCw className="h-4 w-4" /> Regenerate</Button>
              <Button variant="outline" size="sm" onClick={copyBlog}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}</Button>
              <div className="relative">
                <Button variant="outline" size="sm" onClick={() => setDownloadOpen((o) => !o)} disabled={!!exporting}>
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {exporting ? (exporting === "pdf" ? "PDF…" : "Word…") : "Download"}
                </Button>
                {downloadOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDownloadOpen(false)} />
                    <div className="absolute right-0 z-50 mt-1.5 min-w-[11rem] overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-xl">
                      {([
                        { key: "pdf", label: "PDF document", sub: ".pdf", run: () => exportAs("pdf") },
                        { key: "doc", label: "Word document", sub: ".doc", run: () => exportAs("doc") },
                        { key: "md", label: "Markdown", sub: ".md", run: () => { setDownloadOpen(false); downloadMarkdown(); } },
                      ] as const).map((o) => (
                        <button key={o.key} type="button" onClick={o.run} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-secondary">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 font-medium">{o.label}</span>
                          <span className="text-[11px] text-muted-foreground">{o.sub}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <Button size="sm" onClick={saveBlog} disabled={saved}>{saved ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />} {saved ? "Saved" : "Save"}</Button>
            </div>
          )}
        </div>
        {!blog && !generating ? (
          <div className="flex flex-col items-center gap-4 p-6 py-16 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10"><PenLine className="h-8 w-8" /></span>
            <div className="space-y-1.5">
              <h3 className="font-heading text-lg font-semibold">Write a publish-ready blog</h3>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">Pick your target keywords on the left, set the tone and length, and hit Generate — a full, structured draft appears here in seconds.</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {[
                { icon: <Star className="h-3 w-3" />, label: "Keyword-optimised" },
                { icon: <TrendingUp className="h-3 w-3" />, label: "Internal links" },
                { icon: <ImageIcon className="h-3 w-3" />, label: "AI images" },
              ].map((f) => (
                <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {f.icon}{f.label}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <>
            {imgStatus && (
              <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-4 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <ImageIcon className="h-4 w-4 animate-pulse" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {imgStatus}
                    <span className="flex gap-0.5">
                      <span className="h-1 w-1 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-primary" />
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/70" />
                  </div>
                </div>
              </div>
            )}
            <BlogEditor value={blog} onChange={setBlog} vols={volMap} internalPages={internalPages} generating={generating} domain={project.domain} projectId={project.id} imagesBusy={reimaging} />
            {volMap.size > 0 && (
              <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
                <mark className="rounded bg-primary/15 px-1 font-medium text-primary">keyword</mark>
                Highlighted = a keyword you targeted. Hover it to see its monthly search volume.
              </div>
            )}
          </>
        )}
      </Card>
      </div>
    </div>
  );
}
