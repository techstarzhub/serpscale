"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Star, X, FileText, Copy, Download, Check, PenLine, Trash2, Search, TrendingUp, RefreshCw } from "lucide-react";
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
  const [words, setWords] = useState(900);
  const [instructions, setInstructions] = useState("");
  const [loadingKw, setLoadingKw] = useState(true);

  const [blog, setBlog] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [blogs, setBlogs] = useState<BlogRow[]>([]);

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

  async function generate() {
    const kws = allKeywords();
    if (!kws.length) return;
    setGenerating(true); setBlog(""); setSaved(false);
    await streamAuditFix(
      `/projects/${project.id}/blog/generate`,
      { keywords: kws, title: title.trim() || undefined, tone, wordCount: words, instructions: instructions.trim() || undefined },
      {
        onToken: (t) => setBlog(t),
        onDone: (t) => { setBlog(t); setGenerating(false); },
        onError: () => { setBlog("Couldn't generate the blog right now. Please try again."); setGenerating(false); },
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
  function downloadBlog() {
    const blobUrl = URL.createObjectURL(new Blob([blog], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${(title.trim() || "blog-post").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(blobUrl);
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
    <div className="grid gap-3 lg:grid-cols-[320px_1fr] lg:items-start">
      {/* Left: saved keywords + options — sticky so it stays in view while scrolling the draft */}
      <div className="space-y-3 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Star className="h-4 w-4" /></span>
              <div>
                <h4 className="text-sm font-semibold">Saved keywords</h4>
                <p className="text-xs text-muted-foreground">Pick which to write about</p>
              </div>
            </div>
            {loadingKw ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : keywords.length === 0 ? (
              <p className="py-3 text-xs text-muted-foreground">No saved keywords yet. Go to the Keywords tab, research ideas, and hit the star to save them here.</p>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {keywords.map((k) => (
                  <div key={k.id} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors", selected.has(k.keyword) ? "border-primary/50 bg-primary/5" : "border-border")}>
                    <button onClick={() => toggle(k.keyword)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", selected.has(k.keyword) ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                        {selected.has(k.keyword) && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{k.keyword}</span>
                      {k.volume != null && <span className="shrink-0 text-[10px] text-muted-foreground">{k.volume.toLocaleString()}</span>}
                    </button>
                    <button onClick={() => removeKeyword(k)} title="Remove" className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {searches.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Search className="h-4 w-4" /></span>
                <div>
                  <h4 className="text-sm font-semibold">Saved searches</h4>
                  <p className="text-xs text-muted-foreground">Add a whole search — every keyword it found</p>
                </div>
              </div>
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {searches.map((s) => {
                  const on = selectedSearches.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSearch(s)}
                      className={cn("flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors", on ? "border-primary/50 bg-primary/5" : "border-border hover:bg-secondary/40")}
                    >
                      <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                        {loadingSearch === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{s.term}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        <TrendingUp className="h-3 w-3" />{s.keywordCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Title / angle (optional)</label>
              <Input className="h-9" placeholder="e.g. 10 tips for…" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Tone</label>
                <select className={cn(field, "h-9 capitalize")} value={tone} onChange={(e) => setTone(e.target.value)}>
                  {TONES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Length (words)</label>
                <select className={cn(field, "h-9")} value={words} onChange={(e) => setWords(Number(e.target.value))}>
                  {[600, 900, 1200, 1500, 2000].map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> AI instructions (optional)
              </label>
              <textarea
                className={cn(field, "min-h-[76px] resize-y")}
                placeholder="Anything specific? e.g. include a comparison, mention our free trial, target beginners, add a call-to-action at the end, keep paragraphs short…"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={1500}
              />
              <div className="mt-0.5 text-right text-[10px] text-muted-foreground">{instructions.length}/1500</div>
            </div>
            <Button className="w-full" onClick={generate} disabled={generating || totalSelected === 0}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Writing…" : `Generate blog${totalSelected ? ` (${totalSelected} kw)` : ""}`}
            </Button>
          </CardContent>
        </Card>

        {blogs.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h4 className="mb-2 text-sm font-semibold">Saved drafts</h4>
              <div className="space-y-1">
                {blogs.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                    <button onClick={() => openBlog(b.id)} className="min-w-0 flex-1 truncate text-left text-sm hover:text-primary">{b.title}</button>
                    <button onClick={() => deleteBlog(b.id)} title="Delete" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
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
              <Button variant="outline" size="sm" onClick={generate} disabled={totalSelected === 0} title={totalSelected === 0 ? "Select at least one keyword" : "Generate a fresh version"}><RefreshCw className="h-4 w-4" /> Regenerate</Button>
              <Button variant="outline" size="sm" onClick={copyBlog}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}</Button>
              <Button variant="outline" size="sm" onClick={downloadBlog}><Download className="h-4 w-4" /> .md</Button>
              <Button size="sm" onClick={saveBlog} disabled={saved}>{saved ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />} {saved ? "Saved" : "Save"}</Button>
            </div>
          )}
        </div>
        {!blog && !generating ? (
          <div className="flex flex-col items-center gap-3 p-4 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><PenLine className="h-7 w-7" /></span>
            <h3 className="font-heading text-lg font-semibold">Generate SEO blog content</h3>
            <p className="max-w-md text-sm text-muted-foreground">Pick individual saved keywords or add a whole saved search on the left, tweak the tone/length, and hit Generate. You&apos;ll get a full, structured, publish-ready draft — with your target keywords highlighted (hover for volume) and internal links to your own pages — that you can edit, copy, download or save.</p>
          </div>
        ) : (
          <>
            <BlogEditor value={blog} onChange={setBlog} vols={volMap} internalPages={internalPages} generating={generating} domain={project.domain} />
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
  );
}
