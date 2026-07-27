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
  // Readable URL slug derived from the name (e.g. "Tech Starz Hub" -> "tech-starz-hub").
  slug: string;
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

interface ProjectsContextValue {
  projects: Project[];
  loading: boolean;
  addProject: (input: { name: string; domain: string }) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
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

  const addProject = useCallback(async (input: { name: string; domain: string }) => {
    const created = await api.post<Omit<Project, "slug">>("/projects", input);
    let withSlug!: Project;
    setProjects((prev) => {
      const next = withSlugs([created, ...prev]);
      withSlug = next[0];
      return next;
    });
    return withSlug ?? withSlugs([created])[0];
  }, []);

  const removeProject = useCallback(async (id: string) => {
    await api.del(`/projects/${id}`);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const getProject = useCallback(
    (idOrSlug: string) => projects.find((p) => p.slug === idOrSlug || p.id === idOrSlug),
    [projects],
  );

  return (
    <ProjectsContext.Provider
      value={{ projects, loading, addProject, removeProject, getProject, refresh }}
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
