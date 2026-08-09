import { io, type Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface Attachment { key: string; url: string; name: string; contentType: string; size?: number; width?: number; height?: number }
export interface SupportMessage {
  id: string;
  ticketId: string;
  body: string;
  attachments: Attachment[];
  fromAgent: boolean;
  senderId: string;
  senderName: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}
export type TicketStatus = "OPEN" | "PENDING" | "CLOSED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export const BRAND_NAME = "SerpScale";
export const BRAND_TEAM = "SerpScale Support Team";

// Branded, human-friendly ticket identifiers derived from the sequential number.
//   full  → SERPSCALE-SUPPORT-SS0042  (copyable, unambiguous)
//   short → SS-0042                    (compact, for list rows)
export function ticketCode(n: number): string {
  return `SERPSCALE-SUPPORT-SS${String(n).padStart(4, "0")}`;
}
export function ticketShort(n: number): string {
  return `SS-${String(n).padStart(4, "0")}`;
}
export interface Ticket {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  creatorId: string;
  creatorName: string | null;
  creatorEmail: string | null;
  creatorAvatar: string | null;
  orgName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  lastMessageAt: string;
  lastPreview: string | null;
  unread: number;
  createdAt: string;
}

// Turn a server-relative media path into an absolute URL against the API.
export function mediaUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

// ---- Singleton socket to the /support namespace (cookie auth) --------------
let socket: Socket | null = null;
export function getSupportSocket(): Socket {
  if (!socket) {
    socket = io(`${API_URL}/support`, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}

// ---- Subtle, professional chime via the Web Audio API (no asset files) -----
let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}
function tone(freq: number, start: number, dur: number, gain: number) {
  const c = audioCtx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.02);
}
/** kind "in" = incoming (soft two-tone), "out" = outgoing (single soft blip). */
export function playChime(kind: "in" | "out") {
  const c = ctx();
  if (!c) return;
  try {
    if (kind === "out") {
      tone(523.25, 0, 0.12, 0.05); // C5, very soft
    } else {
      tone(659.25, 0, 0.12, 0.07);  // E5
      tone(880.0, 0.09, 0.16, 0.07); // A5
    }
  } catch { /* ignore */ }
}

// ---- Time helpers ---------------------------------------------------------
export function chatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export function chatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
export function fullDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const dys = Math.floor(h / 24);
  if (dys < 7) return `${dys}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
