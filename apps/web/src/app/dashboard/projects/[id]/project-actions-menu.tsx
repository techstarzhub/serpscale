"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  FileText,
  Pencil,
  KeyRound,
  Copy,
  Link2Off,
  Trash2,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useProjects, type Project } from "@/components/providers/projects-provider";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function ProjectActionsMenu({
  project,
  canReport,
  canEdit,
  canDelete,
}: {
  project: Project;
  canReport?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  // Kept for call-site compatibility; Edit now opens the full edit page.
  onEdit?: () => void;
}) {
  const router = useRouter();
  const { removeProject, generateShareKey, revokeShareKey } = useProjects();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const shareKey = project.shareKey ?? null;

  function publicUrl(key: string) {
    return `${window.location.origin}/share/${key}`;
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard?.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  // First use generates the key once; afterwards it just copies the link.
  async function handleViewKey() {
    if (shareKey) {
      await copyText(publicUrl(shareKey));
      toast.success("View link copied", { description: "Anyone with this link can view the campaign (read-only)." });
      setOpen(false);
      return;
    }
    setSharing(true);
    try {
      const key = await generateShareKey(project.id);
      await copyText(publicUrl(key));
      toast.success("View key generated & link copied", { description: "Share it — anyone with the link gets a read-only view." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate the view key.");
    } finally {
      setSharing(false);
      setOpen(false);
    }
  }

  async function disableLink() {
    setOpen(false);
    try {
      await revokeShareKey(project.id);
      toast.success("Share link disabled", { description: "The old link no longer works." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disable the link.");
    }
  }

  // Close the dropdown on outside-click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function doDelete() {
    setDeleting(true);
    try {
      await removeProject(project.id);
      toast.success("Campaign deleted");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete this campaign.");
      setDeleting(false);
    }
  }

  const items: { key: string; label: string; icon: typeof FileText; onClick: () => void; show: boolean; danger?: boolean }[] = [
    {
      key: "report",
      label: "Download report",
      icon: FileText,
      show: !!canReport,
      onClick: () => {
        window.open(`${API}/projects/${project.id}/report.pdf`, "_blank", "noopener,noreferrer");
        setOpen(false);
      },
    },
    {
      key: "edit",
      label: "Edit campaign",
      icon: Pencil,
      show: !!canEdit,
      onClick: () => {
        setOpen(false);
        router.push(`/dashboard/projects/${project.slug}/edit`);
      },
    },
    {
      key: "share",
      label: shared
        ? "View link copied!"
        : sharing
          ? "Generating…"
          : shareKey
            ? "Copy view key"
            : "Generate view key",
      icon: shared ? Check : sharing ? Loader2 : shareKey ? Copy : KeyRound,
      show: true,
      onClick: handleViewKey,
    },
    {
      key: "unshare",
      label: "Disable view link",
      icon: Link2Off,
      show: !!shareKey,
      danger: true,
      onClick: disableLink,
    },
    {
      key: "delete",
      label: "Delete campaign",
      icon: Trash2,
      show: !!canDelete,
      danger: true,
      onClick: () => {
        setConfirmDelete(true);
        setOpen(false);
      },
    },
  ];

  return (
    <>
      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Campaign options"
          aria-label="Campaign options"
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:text-foreground hover:shadow-glow",
            open && "text-foreground ring-2 ring-primary/30",
          )}
        >
          <Settings className={cn("h-[18px] w-[18px] transition-transform duration-300", open && "rotate-90")} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl animate-in fade-in-0 zoom-in-95"
          >
            {items
              .filter((it) => it.show)
              .map((it) => {
                const Icon = it.icon;
                return (
                  <button
                    key={it.key}
                    role="menuitem"
                    onClick={it.onClick}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      it.danger
                        ? "text-destructive hover:bg-destructive/10"
                        : "text-foreground hover:bg-secondary",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {it.label}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-background/70 p-4 backdrop-blur-sm animate-in fade-in-0"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting) setConfirmDelete(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-heading text-lg font-semibold">Delete this campaign?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{project.name}</span> and all of its data will be
                  permanently removed. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={doDelete} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
