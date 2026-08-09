"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, X, Send, Sparkles, User, Loader2, ChevronLeft, Globe, Search, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useWidgetPrefs } from "@/lib/widget-prefs";
import { useDraggable } from "@/lib/use-draggable";
import { useProjects, type Project } from "@/components/providers/projects-provider";
import { useCurrentUser, useCan } from "@/components/providers/user-provider";
import { ActionChip, RichText, streamCopilot, type ChatAction, type Message } from "./copilot-core";

// Site favicon with a globe fallback.
function Favicon({ domain }: { domain: string }) {
  const [err, setErr] = useState(false);
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-card">
      {err ? (
        <Globe className="h-4 w-4 text-muted-foreground" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" className="h-4 w-4" onError={() => setErr(true)} />
      )}
    </span>
  );
}

export function CopilotWidget() {
  const { user } = useCurrentUser();
  const { prefs, setVisible } = useWidgetPrefs();
  const { projects } = useProjects();
  const can = useCan();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Project | null>(null);
  const [query, setQuery] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [toolLabel, setToolLabel] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Both the launcher bubble and the open panel can be dragged anywhere and
  // remember where they were parked. Defaults keep the familiar bottom-right spot.
  const launcher = useDraggable("copilot:launcher-pos", () => ({ x: window.innerWidth - 56 - 20, y: window.innerHeight - 56 - 20 }));
  const panel = useDraggable("copilot:panel-pos", () => {
    const w = Math.min(400, window.innerWidth - 40);
    const h = Math.min(600, window.innerHeight - 40);
    return { x: window.innerWidth - w - 20, y: window.innerHeight - h - 20 };
  });

  // Show only when the user actually has Copilot access (and campaigns to chat about).
  // Super admins run the platform, not campaigns.
  const hidden = user?.role === "SUPER_ADMIN" || projects.length === 0 || !can("copilot.view");

  const loadHistory = useCallback(async (projectId: string) => {
    setLoading(true);
    setMessages([]);
    try {
      const res = await api.get<{ messages: Message[] }>(`/projects/${projectId}/copilot/history`);
      setMessages(res.messages);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function openProject(p: Project) {
    setActive(p);
    loadHistory(p.id);
  }
  function backToList() {
    abortRef.current?.abort();
    setActive(null);
    setBusy(false);
    setStreamText("");
    setToolLabel(null);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamText, toolLabel, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Escape closes the panel (or steps back to the project list first).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (active) backToList();
      else setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const SUGGESTIONS = [
    "What should I fix first to grow traffic?",
    "Which keywords are closest to page 1?",
    "How do I compare to competitors?",
  ];

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy || !active) return;
    setInput("");
    setMessages((m) => [...m, { id: `tmp-${m.length}`, role: "user", content: q, actions: [], createdAt: "" }]);
    setBusy(true);
    setStreamText("");
    setToolLabel("Thinking…");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    await streamCopilot(active.id, q, {
      signal: ctrl.signal,
      onTool: (label) => {
        setToolLabel(label);
        setStreamText("");
      },
      onReset: () => setStreamText(""),
      onToken: (full) => {
        setToolLabel(null);
        setStreamText(full);
      },
      onDone: (msg) => {
        setMessages((m) => [...m, msg]);
        setStreamText("");
      },
      onError: (msg) => {
        setMessages((m) => [...m, { id: `err-${m.length}`, role: "assistant", content: msg, actions: [], createdAt: "" }]);
        setStreamText("");
      },
    });
    setBusy(false);
    setStreamText("");
    setToolLabel(null);
    abortRef.current = null;
  }

  // Action chips navigate to the relevant section of the project.
  function onAction(a: ChatAction) {
    if (!active) return;
    if (a.type === "link" && a.url) {
      window.open(a.url, "_blank", "noopener,noreferrer");
      return;
    }
    const tab = a.type === "track" ? "keywords" : a.tab;
    if (tab) {
      router.push(`/dashboard/projects/${active.slug}?tab=${tab}`);
      setOpen(false);
    }
  }

  if (hidden || !prefs.copilot) return null; // hidden via Profile settings / the widget

  const filtered = projects.filter(
    (p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.domain.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      {/* Launcher — draggable; a click still opens it, a drag just moves it. */}
      <button
        ref={(el) => { launcher.targetRef.current = el; }}
        {...launcher.handleProps}
        onClick={() => { if (launcher.justDragged()) return; setOpen((o) => !o); }}
        title="AI SEO Copilot — drag to move"
        aria-label="Open AI SEO Copilot"
        style={launcher.pos ? { left: launcher.pos.x, top: launcher.pos.y, right: "auto", bottom: "auto" } : undefined}
        className={cn(
          "copilot-pulse group fixed bottom-5 right-5 z-50 grid h-14 w-14 cursor-grab touch-none place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform duration-300 hover:scale-105 hover:shadow-xl active:cursor-grabbing",
          open ? "pointer-events-none scale-0 opacity-0" : "scale-100 opacity-100",
        )}
      >
        <Bot className="h-6 w-6 transition-transform duration-300 group-hover:rotate-6" />
        {/* live indicator */}
        <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-card">
          <span className="h-2.5 w-2.5 rounded-full bg-chart-2" />
        </span>
        {/* Hover to hide (re-enable in Profile settings). A span (not a button) so
            it isn't nested; data-no-drag keeps the drag handler from firing. */}
        <span
          role="button"
          tabIndex={0}
          data-no-drag
          onClick={(e) => { e.stopPropagation(); setVisible("copilot", false); }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          title="Hide the Copilot (re-enable in Profile settings)"
          className="absolute -left-1.5 -top-1.5 hidden h-5 w-5 cursor-pointer place-items-center rounded-full border border-border bg-card text-muted-foreground shadow transition-colors hover:text-destructive group-hover:grid"
        >
          <X className="h-3 w-3" />
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={(el) => { panel.targetRef.current = el; }}
          style={panel.pos ? { left: panel.pos.x, top: panel.pos.y, right: "auto", bottom: "auto" } : undefined}
          className="copilot-pop fixed bottom-5 right-5 z-50 flex h-[600px] max-h-[calc(100vh-2.5rem)] w-[400px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          {/* Header — drag handle for moving the whole panel. */}
          <div {...panel.handleProps} className="flex cursor-grab touch-none items-center gap-3 border-b border-border px-4 py-3 active:cursor-grabbing">
            {active ? (
              <button
                data-no-drag
                onClick={backToList}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Back to projects"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{active ? active.name : "AI SEO Copilot"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {active ? active.domain : "Pick a project to chat about"}
              </div>
            </div>
            <button
              data-no-drag
              onClick={() => { setVisible("copilot", false); setOpen(false); }}
              title="Hide the Copilot (re-enable in Profile settings)"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <EyeOff className="h-4 w-4" />
            </button>
            <button
              data-no-drag
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Project list */}
          {!active && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects…"
                    className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {filtered.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">No projects found.</div>
                ) : (
                  filtered.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openProject(p)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                    >
                      <Favicon domain={p.domain} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{p.domain}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Chat */}
          {active && (
            <>
              <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {loading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                )}
                {!loading && messages.length === 0 && (
                  <div className="copilot-msg py-4 text-center">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <Sparkles className="h-6 w-6" />
                    </span>
                    <p className="mx-auto mt-3 max-w-xs text-sm text-muted-foreground">
                      Ask me anything about {active.domain} — rankings, traffic, backlinks, or what to fix first.
                    </p>
                    <div className="mt-4 space-y-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="block w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m) => (
                  <div key={m.id} className={cn("copilot-msg flex gap-2.5", m.role === "user" && "flex-row-reverse")}>
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                        m.role === "assistant" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground",
                      )}
                    >
                      {m.role === "assistant" ? <Sparkles className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                    </span>
                    <div className={cn("max-w-[85%] space-y-2", m.role === "user" && "flex flex-col items-end")}>
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2 text-sm",
                          m.role === "assistant" ? "bg-secondary text-foreground" : "bg-primary text-primary-foreground",
                        )}
                      >
                        {m.role === "assistant" ? <RichText text={m.content} /> : m.content}
                      </div>
                      {m.actions?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {m.actions.map((a, i) => (
                            <ActionChip key={i} action={a} onAction={onAction} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {busy && (
                  <div className="copilot-msg flex gap-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <div className="max-w-[85%] rounded-2xl bg-secondary px-3.5 py-2 text-sm text-foreground">
                      {streamText ? (
                        <RichText text={streamText} />
                      ) : (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="copilot-dot h-1.5 w-1.5 rounded-full bg-primary" />
                            <span className="copilot-dot h-1.5 w-1.5 rounded-full bg-primary" />
                            <span className="copilot-dot h-1.5 w-1.5 rounded-full bg-primary" />
                          </span>
                          {toolLabel ?? "Thinking…"}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-border p-2.5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(input);
                  }}
                  className="flex items-end gap-2"
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(input);
                      }
                    }}
                    rows={1}
                    disabled={busy}
                    placeholder="Ask about this project…"
                    className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
