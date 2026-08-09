"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface Project {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
  orgId: string | null;
  createdById: string | null;
  // Dashboards (project detail tabs) active for this campaign. Empty = all tabs.
  enabledTabs?: string[];
  // Default connected Google account (email) this campaign sources Google data from.
  // null/absent = auto-detect by domain across every connected account.
  googleAccountEmail?: string | null;
  // Per-service overrides of the default account. null/absent = use the default.
  gscAccountEmail?: string | null;
  gaAccountEmail?: string | null;
  gmbAccountEmail?: string | null;
  // ISO timestamp when the campaign was archived, or null when active.
  archivedAt?: string | null;
  // Readable URL slug derived from the name (e.g. "Tech Starz Hub" -> "tech-starz-hub").
  slug: string;
  // Public read-only share key. Set once "Generate view key" is used; null/absent
  // means sharing is off. The public link is /share/<shareKey>.
  shareKey?: string | null;
}

// Turn a project name into a URL-safe slug.
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

// Attach a readable, collision-safe slug to every project. When two projects
// share the same name, all of them get a short id suffix so slugs stay unique
// and stable regardless of list order.
function withSlugs(list: Omit<Project, "slug">[]): Project[] {
  const counts = new Map<string, number>();
  for (const p of list) {
    const base = slugify(p.name);
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  return list.map((p) => {
    const base = slugify(p.name);
    const slug = (counts.get(base) ?? 0) > 1 ? `${base}-${p.id.slice(-6)}` : base;
    return { ...p, slug };
  });
}

// Default Google account + per-service overrides accepted by create/update.
// "" clears a field (auto-detect / use default); absent leaves it unchanged.
type GoogleAccountInput = {
  googleAccountEmail?: string;
  gscAccountEmail?: string;
  gaAccountEmail?: string;
  gmbAccountEmail?: string;
};

interface ProjectsContextValue {
  projects: Project[];
  loading: boolean;
  addProject: (input: { name: string; domain: string; enabledTabs?: string[] } & GoogleAccountInput) => Promise<Project>;
  // Edit an existing campaign (name / domain / dashboards / data sources). Re-slugs the list.
  updateProject: (id: string, input: { name?: string; domain?: string; enabledTabs?: string[] } & GoogleAccountInput) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
  // Generate (once) or revoke the campaign's public read-only view key.
  generateShareKey: (id: string) => Promise<string>;
  revokeShareKey: (id: string) => Promise<void>;
  // Archive (or restore) a campaign — updates the local list optimistically.
  setArchived: (id: string, archived: boolean) => Promise<void>;
  // Resolves by either the readable slug or the raw id (old bookmarked links still work).
  getProject: (idOrSlug: string) => Project | undefined;
  refresh: () => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setProjects(withSlugs(await api.get<Omit<Project, "slug">[]>("/projects")));
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const addProject = useCallback(async (input: { name: string; domain: string; enabledTabs?: string[] } & GoogleAccountInput) => {
    const created = await api.post<Omit<Project, "slug">>("/projects", input);
    let withSlug!: Project;
    setProjects((prev) => {
      const next = withSlugs([created, ...prev]);
      withSlug = next[0];
      return next;
    });
    return withSlug ?? withSlugs([created])[0];
  }, []);

  const updateProject = useCallback(
    async (id: string, input: { name?: string; domain?: string; enabledTabs?: string[] } & GoogleAccountInput) => {
      const updated = await api.patch<Omit<Project, "slug">>(`/projects/${id}`, input);
      let withSlug!: Project;
      setProjects((prev) => {
        // Swap in the server's copy, then re-slug the whole list (the name may
        // have changed, which can affect slug collisions across projects).
        const next = withSlugs(prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
        withSlug = next.find((p) => p.id === id)!;
        return next;
      });
      return withSlug ?? withSlugs([updated])[0];
    },
    [],
  );

  const removeProject = useCallback(async (id: string) => {
    await api.del(`/projects/${id}`);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const generateShareKey = useCallback(async (id: string) => {
    const { shareKey } = await api.post<{ shareKey: string }>(`/projects/${id}/share`);
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, shareKey } : p)));
    return shareKey;
  }, []);

  const revokeShareKey = useCallback(async (id: string) => {
    await api.del(`/projects/${id}/share`);
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, shareKey: null } : p)));
  }, []);

  const setArchived = useCallback(async (id: string, archived: boolean) => {
    // Optimistic: flip the flag now, reconcile with the server's timestamp after.
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, archivedAt: archived ? new Date().toISOString() : null } : p)));
    const updated = await api.patch<{ archivedAt: string | null }>(`/projects/${id}/archive`, { archived });
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, archivedAt: updated.archivedAt } : p)));
  }, []);

  const getProject = useCallback(
    (idOrSlug: string) => projects.find((p) => p.slug === idOrSlug || p.id === idOrSlug),
    [projects],
  );

  return (
    <ProjectsContext.Provider
      value={{ projects, loading, addProject, updateProject, removeProject, generateShareKey, revokeShareKey, setArchived, getProject, refresh }}
    >
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used inside ProjectsProvider");
  return ctx;
}
