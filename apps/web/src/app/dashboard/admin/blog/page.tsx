"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, Pencil, Trash2, FolderPlus, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/components/providers/user-provider";
import { api } from "@/lib/api";

interface Category { id: string; name: string; slug: string; count?: number }
interface Post {
  id: string;
  title: string;
  slug: string;
  status: "DRAFT" | "PUBLISHED";
  categories: Category[];
  coverUrl: string | null;
  updatedAt: string;
  publishedAt: string | null;
}

export default function BlogAdmin() {
  const { user } = useCurrentUser();
  const [posts, setPosts] = useState<Post[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<Post[]>("/blog").then((p) => setPosts(Array.isArray(p) ? p : [])).catch(() => setPosts([])),
      api.get<Category[]>("/blog/categories").then((c) => setCats(Array.isArray(c) ? c : [])).catch(() => setCats([])),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(p: Post) {
    if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return;
    try {
      await api.del(`/blog/${p.id}`);
      setPosts((prev) => prev.filter((x) => x.id !== p.id));
    } catch { /* ignore */ }
  }

  async function addCat() {
    const name = prompt("New category name");
    if (!name?.trim()) return;
    try {
      const c = await api.post<Category>("/blog/categories", { name: name.trim() });
      setCats((prev) => [...prev, { ...c, count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
    } catch { /* ignore */ }
  }

  async function renameCat(c: Category) {
    const name = prompt("Rename category", c.name);
    if (!name?.trim() || name === c.name) return;
    try {
      await api.patch(`/blog/categories/${c.id}`, { name: name.trim() });
      setCats((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: name.trim() } : x)));
    } catch { /* ignore */ }
  }

  async function delCat(c: Category) {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try {
      await api.del(`/blog/categories/${c.id}`);
      setCats((prev) => prev.filter((x) => x.id !== c.id));
    } catch { /* ignore */ }
  }

  if (user && user.role !== "SUPER_ADMIN") {
    return <div className="p-8 text-sm text-muted-foreground">This area is for the platform owner only.</div>;
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Blog</h1>
          <p className="text-sm text-muted-foreground">Write, edit and publish posts for the marketing site.</p>
        </div>
        <Link href="/dashboard/admin/blog/new">
          <Button className="gap-2"><Plus className="h-4 w-4" /> New post</Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Posts */}
        <div className="rounded-xl border border-border bg-card">
          {loading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-muted-foreground"><Newspaper className="h-6 w-6" /></span>
              <p className="text-sm text-muted-foreground">No posts yet. Write your first one.</p>
              <Link href="/dashboard/admin/blog/new"><Button className="gap-2"><Plus className="h-4 w-4" /> New post</Button></Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {posts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-11 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                    {p.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/dashboard/admin/blog/${p.id}`} className="truncate font-medium hover:text-primary">{p.title || "(untitled)"}</Link>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.status === "PUBLISHED" ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
                        {p.status === "PUBLISHED" ? "Published" : "Draft"}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {p.categories.map((c) => c.name).join(", ") || "Uncategorized"} · updated {new Date(p.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link href={`/dashboard/admin/blog/${p.id}`} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" title="Edit"><Pencil className="h-4 w-4" /></Link>
                    <button onClick={() => remove(p)} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Categories */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-medium">Categories</span>
            <button onClick={addCat} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><FolderPlus className="h-3.5 w-3.5" /> Add</button>
          </div>
          <div className="space-y-1">
            {cats.length === 0 && <p className="text-xs text-muted-foreground">No categories yet.</p>}
            {cats.map((c) => (
              <div key={c.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary">
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.count ?? 0}</span>
                <button onClick={() => renameCat(c)} className="opacity-0 transition-opacity group-hover:opacity-100" title="Rename"><Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" /></button>
                <button onClick={() => delCat(c)} className="opacity-0 transition-opacity group-hover:opacity-100" title="Delete"><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
