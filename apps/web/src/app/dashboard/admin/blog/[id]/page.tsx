"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Upload, Trash2, Eye, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/blog/RichTextEditor";
import { api } from "@/lib/api";

interface Category { id: string; name: string; slug: string; count?: number }
interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  status: "DRAFT" | "PUBLISHED";
  metaTitle: string | null;
  metaDescription: string | null;
  tags: string[];
  categories: Category[];
  coverUrl: string | null;
  publishedAt: string | null;
}

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";

export default function BlogEditor() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const isNew = id === "new";
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [cats, setCats] = useState<Category[]>([]);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [tags, setTags] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const loadCats = useCallback(() => {
    api.get<Category[]>("/blog/categories").then((c) => setCats(Array.isArray(c) ? c : [])).catch(() => {});
  }, []);

  useEffect(() => {
    loadCats();
    if (isNew) return;
    api
      .get<Post>(`/blog/${id}`)
      .then((p) => {
        setTitle(p.title);
        setSlug(p.slug);
        setSlugTouched(true);
        setExcerpt(p.excerpt ?? "");
        setContent(p.content ?? "");
        setMetaTitle(p.metaTitle ?? "");
        setMetaDescription(p.metaDescription ?? "");
        setTags((p.tags ?? []).join(", "));
        setCategoryIds((p.categories ?? []).map((c) => c.id));
        setStatus(p.status);
        setCoverUrl(p.coverUrl);
      })
      .catch(() => setMsg({ t: "err", m: "Could not load this post." }))
      .finally(() => setLoading(false));
  }, [id, isNew, loadCats]);

  const payload = () => ({
    title,
    slug: slugTouched ? slug : slugify(title),
    excerpt,
    content,
    metaTitle,
    metaDescription,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    categoryIds,
    status,
  });

  async function save(newStatus?: "DRAFT" | "PUBLISHED") {
    if (!title.trim()) { setMsg({ t: "err", m: "Please add a title." }); return; }
    setSaving(true);
    setMsg(null);
    const body = { ...payload(), status: newStatus ?? status };
    try {
      if (isNew) {
        const created = await api.post<Post>("/blog", body);
        router.replace(`/dashboard/admin/blog/${created.id}`);
      } else {
        const updated = await api.patch<Post>(`/blog/${id}`, body);
        if (newStatus) setStatus(newStatus);
        setSlug(updated.slug);
        setMsg({ t: "ok", m: "Saved." });
      }
    } catch (e) {
      setMsg({ t: "err", m: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  async function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || isNew) return;
    setUploading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", f);
      const r = await api.upload<{ coverUrl: string }>(`/blog/${id}/cover`, form);
      setCoverUrl(r.coverUrl);
    } catch (err) {
      setMsg({ t: "err", m: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function removeCover() {
    if (isNew) return;
    try {
      await api.del(`/blog/${id}/cover`);
      setCoverUrl(null);
    } catch { /* ignore */ }
  }

  async function toggleCat(cid: string) {
    setCategoryIds((s) => (s.includes(cid) ? s.filter((x) => x !== cid) : [...s, cid]));
  }

  async function addCategory() {
    const name = window.prompt("New category name");
    if (!name?.trim()) return;
    try {
      const c = await api.post<Category>("/blog/categories", { name: name.trim() });
      setCats((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryIds((s) => [...s, c.id]);
    } catch { /* ignore */ }
  }

  if (loading) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/dashboard/admin/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All posts
        </Link>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === "PUBLISHED" ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
            {status === "PUBLISHED" ? "Published" : "Draft"}
          </span>
          {!isNew && slug && status === "PUBLISHED" && (
            <a href={`${process.env.NEXT_PUBLIC_MARKETING_URL || "http://localhost:3020"}/blog/${slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary">
              <Eye className="h-4 w-4" /> View
            </a>
          )}
          <Button variant="outline" onClick={() => save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
          {status === "DRAFT" ? (
            <Button onClick={() => save("PUBLISHED")} disabled={saving}>Publish</Button>
          ) : (
            <Button variant="outline" onClick={() => save("DRAFT")} disabled={saving}>Unpublish</Button>
          )}
        </div>
      </div>

      {msg && <p className={`mb-4 text-sm ${msg.t === "ok" ? "text-success" : "text-destructive"}`}>{msg.m}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main column */}
        <div className="space-y-4">
          <input
            className="w-full border-0 bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground"
            placeholder="Post title"
            value={title}
            onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>/blog/</span>
            <input className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} placeholder="url-slug" />
          </div>
          <RichTextEditor value={content} onChange={setContent} />
          <div>
            <Label>Excerpt</Label>
            <textarea className={field} rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Short summary shown on the blog listing…" />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Featured image */}
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 text-sm font-medium">Featured image</div>
            {isNew ? (
              <p className="text-xs text-muted-foreground">Save the draft first, then add a featured image.</p>
            ) : (
              <>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickCover} />
                {coverUrl ? (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={coverUrl} alt="Cover" className="aspect-video w-full rounded-lg border border-border object-cover" />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>Replace</Button>
                      <Button variant="ghost" size="sm" onClick={removeCover}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} className="grid aspect-video w-full place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="flex flex-col items-center gap-1 text-xs"><Upload className="h-5 w-5" /> Upload image</span>}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Categories */}
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Categories</span>
              <button onClick={addCategory} className="text-xs font-medium text-primary hover:underline">+ New</button>
            </div>
            <div className="max-h-44 space-y-1 overflow-auto">
              {cats.length === 0 && <p className="text-xs text-muted-foreground">No categories yet.</p>}
              {cats.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-secondary">
                  <input type="checkbox" checked={categoryIds.includes(c.id)} onChange={() => toggleCat(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 text-sm font-medium">Tags</div>
            <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="seo, rank tracking, guide" />
            <p className="mt-1 text-xs text-muted-foreground">Comma-separated.</p>
          </div>

          {/* SEO */}
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 text-sm font-medium">SEO</div>
            <Label className="text-xs">Meta title</Label>
            <input className={field} value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder={title || "Defaults to post title"} />
            <Label className="mt-2 text-xs">Meta description</Label>
            <textarea className={field} rows={3} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="~155 characters for search snippets" />
            <p className="mt-1 text-xs text-muted-foreground">{metaDescription.length}/160</p>
          </div>
        </div>
      </div>
    </div>
  );
}
