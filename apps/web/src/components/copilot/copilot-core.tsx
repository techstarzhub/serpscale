"use client";

import { ArrowUpRight, ExternalLink, LayoutGrid, Target } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface ChatAction {
  type: "open" | "track" | "link";
  label: string;
  tab?: string;
  code?: string;
  keyword?: string;
  url?: string;
}
export type CopilotAction = ChatAction;

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: ChatAction[];
  createdAt: string;
}

// The user forbids emojis — final guard so none render even mid-stream.
export function noEmoji(s: string) {
  return s
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{20D0}-\u{20FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2900}-\u{297F}]/gu,
      "",
    )
    .replace(/‍/g, "");
}

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

// Lightweight markdown (bold, bullets, paragraphs). Strips the actions block
// and emojis so neither ever reaches the UI, even mid-stream.
export function RichText({ text }: { text: string }) {
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

export function ActionChip({ action, onAction }: { action: ChatAction; onAction: (a: ChatAction) => void }) {
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

export interface StreamHandlers {
  onTool: (label: string) => void;
  onReset: () => void;
  onToken: (fullText: string) => void;
  onDone: (message: Message) => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

// Generic SSE reader for the audit AI-fix endpoints. POSTs `body` to `path` and
// calls onToken(fullText) as tokens arrive, then onDone(cleanFullText). Falls back
// to onError on failure. Shared by AuditFix, AuditPlan, Top-issues and Lighthouse rows.
export async function streamAuditFix(
  path: string,
  body: unknown,
  h: { onToken: (full: string) => void; onDone: (full: string) => void; onError: () => void; signal?: AbortSignal },
) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
      signal: h.signal,
    });
    if (!res.ok || !res.body) throw new Error("stream failed");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acc = "";
    let full = "";
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
        let ev: { type: string; text?: string; full?: string };
        try {
          ev = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (ev.type === "token") {
          acc += ev.text ?? "";
          h.onToken(acc);
        } else if (ev.type === "done") {
          full = ev.full ?? acc;
        } else if (ev.type === "error") {
          h.onError();
          return;
        }
      }
    }
    h.onDone(full || acc);
  } catch {
    h.onError();
  }
}

// POST a question and parse the Server-Sent-Events stream from the copilot.
export async function streamCopilot(projectId: string, question: string, h: StreamHandlers) {
  try {
    const res = await fetch(`${API_URL}/projects/${projectId}/copilot/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ question }),
      signal: h.signal,
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
        if (ev.type === "tool") h.onTool(ev.label);
        else if (ev.type === "reset") {
          acc = "";
          h.onToken("");
        } else if (ev.type === "token") {
          acc += ev.text;
          h.onToken(acc);
        } else if (ev.type === "done" && ev.message) h.onDone(ev.message as Message);
        else if (ev.type === "error") h.onError(ev.message || "Something went wrong.");
      }
    }
  } catch {
    h.onError("The AI couldn't respond right now. Please try again.");
  }
}
