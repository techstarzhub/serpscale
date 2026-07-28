// Fetches blog data from the SerpScale API (super-admin CMS). Runs server-side.
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface Category { name: string; slug: string; count: number }
export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  status: "DRAFT" | "PUBLISHED";
  metaTitle: string | null;
  metaDescription: string | null;
  tags: string[];
  categories: { id: string; name: string; slug: string }[];
  author: { id: string; name: string | null; email: string } | null;
  coverUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const REVALIDATE = 60;

export async function getPosts(opts: { category?: string; page?: number; limit?: number } = {}): Promise<{ posts: Post[]; total: number; page: number; pageSize: number }> {
  const q = new URLSearchParams();
  if (opts.category) q.set("category", opts.category);
  if (opts.page) q.set("page", String(opts.page));
  if (opts.limit) q.set("limit", String(opts.limit));
  try {
    const res = await fetch(`${API}/public/blog?${q.toString()}`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return { posts: [], total: 0, page: 1, pageSize: 24 };
    return await res.json();
  } catch {
    return { posts: [], total: 0, page: 1, pageSize: 24 };
  }
}

export async function getPost(slug: string): Promise<Post | null> {
  try {
    const res = await fetch(`${API}/public/blog/${encodeURIComponent(slug)}`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API}/public/blog/categories`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function getSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  try {
    const res = await fetch(`${API}/public/blog/slugs`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
