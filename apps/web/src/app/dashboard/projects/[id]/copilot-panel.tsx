"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  User,
  Loader2,
  Trash2,
  ChevronDown,
  ArrowUpRight,
  ExternalLink,
  Target,
  LayoutGrid,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/components/providers/user-provider";
import type { Project } from "@/components/providers/projects-provider";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface ChatAction {
  type: "open" | "track" | "link";
  label: string;
  tab?: string;
  code?: string;
  keyword?: string;
  url?: string;
}
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: ChatAction[];
  createdAt: string;
}
interface Thread {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  messages: number;
  lastAt: string | null;
}

// What the parent page can do when an action chip is clicked.
export type CopilotAction = ChatAction;

const SUGGESTIONS = [
  "What should I fix first to grow traffic?",
  "Which keywords are closest to page 1?",
  "How do I compare to my competitors?",
  "Summarize my SEO health in plain English.",
];

// The user forbids emojis — final guard so none render even mid-stream.
function noEmoji(s: string) {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{20D0}-\u{20FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2900}-\u{297F}]/gu, "")
    .replace(/‍/g, "");
}

// --- lightweight markdown (bold, bullets, paragraphs) ----------------------
function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
function RichText({ text }: { text: string }) {
  // Never show the raw actions block (even a partial one arriving mid-stream) or emojis.
  const cleaned = noEmoji(text.replace(/<actions[\s\S]*$/i, "").trimEnd());
  const blocks = cleaned.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.length > 0 && lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="space-y-1">
              {lines.map((l, li) => (
                <li key={li} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="leading-relaxed">
            {lines.map((l, li) => (
              <span key={li}>
                {inline(l)}
                {li < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function ActionChip({ action, onAction }: { action: ChatAction; onAction: (a: ChatAction) => void }) {
  const Icon = action.type === "link" ? ExternalLink : action.type === "track" ? Target : LayoutGrid;
  return (
    <button
      onClick={() => onAction(action)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
    >
      <Icon className="h-3.5 w-3.5" />
      {action.label}
      <ArrowUpRight className="h-3 w-3 opacity-60" />
    </button>
  );
}

export function CopilotPanel({ project, onAction }: { project: Project; onAction: (a: CopilotAction) => void }) {
  const { user } = useCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [toolLabel, setToolLabel] = useState<string | null>(null);

  // Admin oversight
  const [threads, setThreads] = useState<Thread[]>([]);
  const [viewUserId, setViewUserId] = useState<string | null>(null); // null = my own thread
  const [pickerOpen, setPickerOpen] = useState(false);
  const viewingOther = isAdmin && viewUserId !== null && viewUserId !== user?.id;

  // Proactive brief
  const [brief, setBrief] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(
    async (uid: string | null) => {
      setLoading(true);
      try {
        const qs = uid ? `?userId=${encodeURIComponent(uid)}` : "";
        const res = await api.get<{ configured: boolean; messages: Message[] }>(
          `/projects/${project.id}/copilot/history${qs}`,
        );
        setConfigured(res.configured);
        setMessages(res.messages);
      } catch {
        setMessages([]);
      } finally {
        setLoading(false);
      }
    },
    [project.id],
  );

  useEffect(() => {
    loadHistory(null);
  }, [loadHistory]);

  // Admin: fetch the roster of members who have chatted.
  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<{ threads: Thread[] }>(`/projects/${project.id}/copilot/threads`)
      .then((r) => setThreads(r.threads))
      .catch(() => setThreads([]));
  }, [isAdmin, project.id, messages.length]);

  // Load the one-time proactive brief.
  useEffect(() => {
    api
      .get<{ text: string }>(`/projects/${project.id}/copilot/brief`)
      .then((r) => setBrief(r.text || null))
      .catch(() => setBrief(null));
  }, [project.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamText, toolLabel, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function selectThread(uid: string | null) {
    setPickerOpen(false);
    setViewUserId(uid);
    loadHistory(uid);
  }

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy || viewingOther) return;
    setInput("");
    setMessages((m) => [...m, { id: `tmp-${m.length}`, role: "user", content: q, actions: [], createdAt: "" }]);
    setBusy(true);
    setStreamText("");
    setToolLabel("Thinking…");

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`${API_URL}/projects/${project.id}/copilot/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: q }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error("stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let ev: any;
          try {
            ev = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (ev.type === "tool") setToolLabel(ev.label);
          else if (ev.type === "reset") {
            acc = "";
            setStreamText("");
          } else if (ev.type === "token") {
            acc += ev.text;
            setToolLabel(null);
            setStreamText(acc);
          } else if (ev.type === "done" && ev.message) {
            setMessages((m) => [...m, ev.message as Message]);
            setStreamText("");
          } else if (ev.type === "error") {
            setMessages((m) => [
              ...m,
              { id: `err-${m.length}`, role: "assistant", content: ev.message || "Something went wrong.", actions: [], createdAt: "" },
            ]);
            setStreamText("");
          }
        }
      }
    } catch {
      setMessages((m) => [
        ...m,
        { id: `err-${m.length}`, role: "assistant", content: "The AI couldn't respond right now. Please try again.", actions: [], createdAt: "" },
      ]);
    } finally {
      setBusy(false);
      setStreamText("");
      setToolLabel(null);
      abortRef.current = null;
    }
  }

  async function clearChat() {
    if (viewingOther) return;
    try {
      await api.del(`/projects/${project.id}/copilot/history`);
    } catch {
      /* ignore */
    }
    setMessages([]);
  }

  const activeThread = threads.find((t) => t.userId === viewUserId);
  const empty = !loading && messages.length === 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex h-[calc(100vh-15rem)] min-h-[540px] flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="font-heading text-sm font-semibold">
                SEO Copilot{viewingOther && activeThread ? ` · ${activeThread.name}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {viewingOther ? "Viewing a team member's chat (read-only)" : `Grounded in ${project.domain}'s live data`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Admin: member thread picker */}
            {isAdmin && (
              <div className="relative">
                <button
                  onClick={() => setPickerOpen((o) => !o)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary"
                >
                  {viewingOther && activeThread ? activeThread.name : "My chat"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
                {pickerOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                    <button
                      onClick={() => selectThread(null)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary",
                        !viewingOther && "bg-secondary",
                      )}
                    >
                      <UserAvatar src={user?.avatarUrl} className="h-6 w-6" />
                      My chat
                    </button>
                    {threads.filter((t) => t.userId !== user?.id).length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No other members have chatted yet.</div>
                    )}
                    {threads
                      .filter((t) => t.userId !== user?.id)
                      .map((t) => (
                        <button
                          key={t.userId}
                          onClick={() => selectThread(t.userId)}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary",
                            viewUserId === t.userId && "bg-secondary",
                          )}
                        >
                          <UserAvatar src={t.avatarUrl} className="h-6 w-6" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{t.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{t.messages} messages</span>
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            {!viewingOther && messages.length > 0 && (
              <button
                onClick={clearChat}
                title="Clear chat"
                className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
            </div>
          )}

          {empty && !configured && (
            <div className="mx-auto max-w-md py-10 text-center text-sm text-muted-foreground">
              The AI Copilot isn&apos;t configured yet. Add an AI provider key to enable it.
            </div>
          )}

          {empty && configured && (
            <div className="mx-auto max-w-lg py-4 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-7 w-7" />
              </span>
              <h3 className="mt-4 font-heading text-base font-semibold">Your personal SEO strategist</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                I read this project&apos;s live rankings, traffic, backlinks and site health, then tell you exactly what to do — with the real pages and keywords.
              </p>

              {brief && (
                <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4 text-left">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Lightbulb className="h-4 w-4 text-primary" /> Your action brief
                  </div>
                  <div className="text-sm text-foreground">
                    <RichText text={brief} />
                  </div>
                </div>
              )}

              {!viewingOther && (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <span
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                  m.role === "assistant" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground",
                )}
              >
                {m.role === "assistant" ? <Sparkles className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </span>
              <div className={cn("max-w-[82%] space-y-2", m.role === "user" && "flex flex-col items-end")}>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm",
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

          {/* Live streaming assistant bubble */}
          {busy && (
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="max-w-[82%] rounded-2xl bg-secondary px-4 py-2.5 text-sm text-foreground">
                {streamText ? (
                  <RichText text={streamText} />
                ) : (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {toolLabel ?? "Thinking…"}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        {viewingOther ? (
          <div className="border-t border-border px-5 py-3 text-center text-xs text-muted-foreground">
            You are viewing {activeThread?.name}&apos;s conversation. Switch to “My chat” to ask your own questions.
          </div>
        ) : (
          <div className="border-t border-border p-3">
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
                placeholder="Ask about your rankings, traffic, backlinks, or what to fix…"
                className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
