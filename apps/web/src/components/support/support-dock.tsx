"use client";

// LinkedIn-style docked support chat. Sits at the bottom-right across the
// dashboard so an active conversation can continue while the user navigates.
// Hidden on the full Support page (which owns the conversation there) and on
// small screens (they use the full page). Reuses the shared ChatPanel.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Headphones, Plus, ChevronDown, MessageSquare, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useWidgetPrefs } from "@/lib/widget-prefs";
import { useDraggable } from "@/lib/use-draggable";
import { useCurrentUser } from "@/components/providers/user-provider";
import { Avatar, ChatPanel, NewTicketModal, PRIORITY_META, STATUS_STYLES } from "@/components/support/chat";
import { getSupportSocket, playChime, relTime, BRAND_TEAM, ticketShort, type Ticket, type SupportMessage, type TicketStatus } from "@/lib/support";

export function SupportDock() {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const { prefs, setVisible } = useWidgetPrefs();
  // Draggable launcher (parks above the Copilot FAB by default; remembers where moved).
  const launcher = useDraggable("support:launcher-pos", () => ({ x: window.innerWidth - 56 - 20, y: window.innerHeight - 56 - 92 }));
  const myId = user?.id ?? "";

  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agent, setAgent] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const openRef = useRef(false); openRef.current = open;

  const onSupportPage = pathname?.startsWith("/dashboard/support");

  const load = useCallback(async () => {
    const r = await api.get<{ tickets: Ticket[]; agent: boolean }>("/support/tickets?scope=inbox").catch(() => null);
    if (r) { setTickets(r.tickets); setAgent(r.agent); }
  }, []);
  useEffect(() => { if (!onSupportPage) load(); }, [onSupportPage, load]);

  const openTicket = useCallback(async (id: string) => {
    setActiveId(id); setLoading(true); setOtherTyping(false); setOpen(true);
    const r = await api.get<{ ticket: Ticket; messages: SupportMessage[] }>(`/support/tickets/${id}`).catch(() => null);
    if (r) { setActiveTicket(r.ticket); setMessages(r.messages); setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, unread: 0 } : t))); }
    setLoading(false);
  }, []);

  // Customers may keep only ONE open conversation — send them to it instead of the form.
  const myOpen = !agent ? tickets.find((t) => t.status !== "CLOSED") : undefined;
  const startNew = useCallback(() => { if (myOpen) { setOpen(true); openTicket(myOpen.id); return; } setNewOpen(true); }, [myOpen, openTicket]);

  // Realtime — only while the dock is mounted (i.e. off the support page).
  useEffect(() => {
    if (onSupportPage) return;
    const s = getSupportSocket();
    const onMessage = (m: SupportMessage) => {
      if (m.ticketId === activeIdRef.current) {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (m.senderId !== myId) { playChime("in"); api.post(`/support/tickets/${m.ticketId}/read`).catch(() => {}); }
      } else if (m.senderId !== myId) { playChime("in"); }
      setTickets((prev) => {
        const idx = prev.findIndex((t) => t.id === m.ticketId);
        if (idx === -1) { load(); return prev; }
        const row = { ...prev[idx], lastPreview: m.body || "📎 Attachment", lastMessageAt: m.createdAt };
        if (m.ticketId !== activeIdRef.current && m.senderId !== myId) row.unread = (row.unread || 0) + 1;
        const next = [...prev]; next.splice(idx, 1); return [row, ...next];
      });
    };
    const onRead = (e: { ticketId: string }) => { if (e.ticketId === activeIdRef.current) setMessages((prev) => prev.map((m) => (m.senderId === myId && !m.readAt ? { ...m, readAt: new Date().toISOString(), deliveredAt: m.deliveredAt ?? new Date().toISOString() } : m))); };
    const onDelivered = (e: { ticketId: string }) => { if (e.ticketId === activeIdRef.current) setMessages((prev) => prev.map((m) => (m.senderId === myId && !m.deliveredAt ? { ...m, deliveredAt: new Date().toISOString() } : m))); };
    const onTyping = (e: { ticketId: string; typing: boolean }) => { if (e.ticketId === activeIdRef.current) setOtherTyping(e.typing); };
    const onActivity = () => load();
    s.on("message", onMessage); s.on("read", onRead); s.on("delivered", onDelivered); s.on("typing", onTyping); s.on("ticket:activity", onActivity); s.on("ticket:new", onActivity);
    return () => { s.off("message", onMessage); s.off("read", onRead); s.off("delivered", onDelivered); s.off("typing", onTyping); s.off("ticket:activity", onActivity); s.off("ticket:new", onActivity); };
  }, [onSupportPage, myId, load]);

  // Join/leave the active ticket room.
  useEffect(() => {
    if (!activeId || onSupportPage) return;
    const s = getSupportSocket();
    const join = () => s.emit("join", { ticketId: activeId });
    join(); s.on("connect", join);
    return () => { s.emit("leave", { ticketId: activeId }); s.off("connect", join); };
  }, [activeId, onSupportPage]);

  const unread = useMemo(() => tickets.reduce((s, t) => s + (t.unread || 0), 0), [tickets]);

  if (onSupportPage) return null; // the full page owns the conversation there
  if (!prefs.support) return null; // hidden from Profile settings / the widget itself

  return (
    <>
      {/* Collapsed: a floating launcher that matches the AI Copilot FAB exactly
          (same squircle shape / size / motion), stacked just above it. Hover to
          reveal a hide control; unread replies show a count badge. */}
      {!open && (
        <button
          ref={(el) => { launcher.targetRef.current = el; }}
          {...launcher.handleProps}
          onClick={() => { if (launcher.justDragged()) return; setOpen(true); }}
          style={launcher.pos ? { left: launcher.pos.x, top: launcher.pos.y, right: "auto", bottom: "auto" } : undefined}
          aria-label={unread > 0 ? `Support — ${unread} unread` : "Support"}
          title={unread > 0 ? `${unread} unread repl${unread === 1 ? "y" : "ies"} — drag to move` : "Support — drag to move"}
          className="group fixed bottom-[5.75rem] right-5 z-40 hidden h-14 w-14 cursor-grab touch-none place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform duration-300 hover:scale-105 hover:shadow-xl active:cursor-grabbing md:grid"
        >
          <Headphones className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-card bg-destructive px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
          )}
          {/* Hover to hide (span, not a nested button; data-no-drag skips the drag). */}
          <span
            role="button"
            tabIndex={0}
            data-no-drag
            onClick={(e) => { e.stopPropagation(); setVisible("support", false); }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            title="Hide the support widget (re-enable in Profile settings)"
            className="absolute -left-1.5 -top-1.5 hidden h-5 w-5 cursor-pointer place-items-center rounded-full border border-border bg-card text-muted-foreground shadow transition-colors hover:text-destructive group-hover:grid"
          >
            <X className="h-3 w-3" />
          </span>
        </button>
      )}

      {/* Open: a docked panel that pops up from the launcher — same look as the
          Copilot panel (squircle, size, shadow). Anchored just above the Copilot
          FAB so both stay reachable. */}
      {open && (
        <div className="fixed bottom-[5.75rem] right-5 z-40 hidden h-[560px] max-h-[calc(100vh-8rem)] w-[400px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:flex">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><Headphones className="h-4 w-4" /></span>
            <span className="flex-1 text-sm font-semibold">Support</span>
            {unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
            <button onClick={() => setOpen(false)} title="Minimize" className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"><ChevronDown className="h-4 w-4" /></button>
          </div>

          {activeId && activeTicket ? (
              <ChatPanel
                key={activeId}
                ticket={activeTicket}
                messages={messages}
                loading={loading}
                myId={myId}
                counterpart={agent
                  ? { name: activeTicket.creatorName ?? activeTicket.creatorEmail ?? "Customer", src: activeTicket.creatorAvatar }
                  : { name: BRAND_TEAM, brand: true }}
                otherTyping={otherTyping}
                compact
                onBack={() => { setActiveId(null); setActiveTicket(null); }}
                onSent={(m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))}
                onStatus={(st: TicketStatus) => { setActiveTicket((t) => (t ? { ...t, status: st } : t)); setTickets((ts) => ts.map((x) => (x.id === activeId ? { ...x, status: st } : x))); }}
                onNew={agent ? undefined : startNew}
              />
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground">{agent ? "All conversations" : "Your conversations"}</span>
                  {!agent && (
                    <button
                      onClick={startNew}
                      title={myOpen ? `You already have an open conversation ${ticketShort(myOpen.number)}. Click to chat & resolve it first — you can start a new one only after it's resolved.` : "New conversation"}
                      className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      {myOpen ? <Info className="h-3.5 w-3.5 text-chart-3" /> : <Plus className="h-3.5 w-3.5" />} New
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {tickets.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
                      <MessageSquare className="h-7 w-7 opacity-40" />
                      {agent ? "No tickets yet." : "No conversations yet."}
                      {!agent && <button onClick={startNew} className="font-medium text-primary hover:underline">Start one</button>}
                    </div>
                  ) : tickets.map((t) => (
                    <button key={t.id} onClick={() => openTicket(t.id)} className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-secondary/50">
                      {agent ? <Avatar src={t.creatorAvatar} name={t.creatorName ?? "?"} className="h-9 w-9" /> : <Avatar brand name="SerpScale" className="h-9 w-9" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_META[t.priority].dot)} />
                            <span className="truncate text-sm font-semibold">{t.subject}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="font-mono opacity-70">{ticketShort(t.number)}</span>
                            {relTime(t.lastMessageAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">{agent ? <span className="font-medium text-foreground/80">{t.creatorName ?? t.creatorEmail ?? "Customer"}</span> : null}{agent ? " · " : ""}{t.lastPreview}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            <span className={cn("rounded-full px-1 py-px text-[9px] font-semibold uppercase", STATUS_STYLES[t.status])}>{t.status}</span>
                            {t.unread > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">{t.unread}</span>}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
        </div>
      )}

      {newOpen && (
        <NewTicketModal
          onClose={() => setNewOpen(false)}
          onCreated={(ticket) => { setNewOpen(false); setTickets((ts) => [ticket, ...ts.filter((t) => t.id !== ticket.id)]); openTicket(ticket.id); }}
        />
      )}
    </>
  );
}
