"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Headphones, Plus, Search, Loader2, Inbox, MessageSquare, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/components/providers/user-provider";
import { Avatar, ChatPanel, NewTicketModal, TicketInfoModal, PRIORITY_META, STATUS_STYLES } from "@/components/support/chat";
import { getSupportSocket, playChime, relTime, BRAND_TEAM, ticketShort, ticketCode, type Ticket, type SupportMessage, type TicketStatus } from "@/lib/support";

export default function SupportPage() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
      <SupportInner />
    </Suspense>
  );
}

function SupportInner() {
  const { user } = useCurrentUser();
  const params = useSearchParams();
  const myId = user?.id ?? "";

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agent, setAgent] = useState(false);
  const [scope, setScope] = useState<"mine" | "inbox">("mine");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [infoTicket, setInfoTicket] = useState<Ticket | null>(null);
  const [q, setQ] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const loadTickets = useCallback(async (sc: "mine" | "inbox") => {
    const r = await api.get<{ tickets: Ticket[]; agent: boolean }>(`/support/tickets?scope=${sc}`).catch(() => null);
    if (r) { setTickets(r.tickets); setAgent(r.agent); }
  }, []);

  useEffect(() => { loadTickets(scope); }, [scope, loadTickets]);

  const openTicket = useCallback(async (id: string) => {
    setActiveId(id); setLoadingThread(true); setOtherTyping(false);
    const r = await api.get<{ ticket: Ticket; messages: SupportMessage[] }>(`/support/tickets/${id}`).catch(() => null);
    if (r) {
      setActiveTicket(r.ticket);
      setMessages(r.messages);
      setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, unread: 0 } : t)));
    }
    setLoadingThread(false);
  }, []);

  useEffect(() => { const t = params.get("ticket"); if (t) openTicket(t); }, [params, openTicket]);

  // Customers may keep only ONE open conversation. If they already have one,
  // "New" takes them there instead of opening the form.
  const myOpen = !agent ? tickets.find((t) => t.status !== "CLOSED") : undefined;
  const startNew = useCallback(() => {
    if (myOpen) { openTicket(myOpen.id); return; }
    setNewOpen(true);
  }, [myOpen, openTicket]);

  useEffect(() => {
    const s = getSupportSocket();
    const onMessage = (m: SupportMessage) => {
      const active = activeIdRef.current;
      if (m.ticketId === active) {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (m.senderId !== myId) { playChime("in"); api.post(`/support/tickets/${m.ticketId}/read`).catch(() => {}); }
      } else if (m.senderId !== myId) { playChime("in"); }
      setTickets((prev) => {
        const idx = prev.findIndex((t) => t.id === m.ticketId);
        if (idx === -1) { loadTickets(scope); return prev; }
        const row = { ...prev[idx], lastPreview: m.body || "📎 Attachment", lastMessageAt: m.createdAt };
        if (m.ticketId !== activeIdRef.current && m.senderId !== myId) row.unread = (row.unread || 0) + 1;
        const next = [...prev]; next.splice(idx, 1); return [row, ...next];
      });
    };
    const onRead = (e: { ticketId: string }) => {
      if (e.ticketId !== activeIdRef.current) return;
      setMessages((prev) => prev.map((m) => (m.senderId === myId && !m.readAt ? { ...m, readAt: new Date().toISOString(), deliveredAt: m.deliveredAt ?? new Date().toISOString() } : m)));
    };
    const onDelivered = (e: { ticketId: string }) => {
      if (e.ticketId !== activeIdRef.current) return;
      setMessages((prev) => prev.map((m) => (m.senderId === myId && !m.deliveredAt ? { ...m, deliveredAt: new Date().toISOString() } : m)));
    };
    const onTyping = (e: { ticketId: string; typing: boolean }) => { if (e.ticketId === activeIdRef.current) setOtherTyping(e.typing); };
    const onActivity = () => loadTickets(scope);
    const onNewTicket = () => { if (agent && scope === "inbox") loadTickets("inbox"); };
    s.on("message", onMessage); s.on("read", onRead); s.on("delivered", onDelivered);
    s.on("typing", onTyping); s.on("ticket:activity", onActivity); s.on("ticket:new", onNewTicket);
    return () => {
      s.off("message", onMessage); s.off("read", onRead); s.off("delivered", onDelivered);
      s.off("typing", onTyping); s.off("ticket:activity", onActivity); s.off("ticket:new", onNewTicket);
    };
  }, [myId, scope, agent, loadTickets]);

  useEffect(() => {
    if (!activeId) return;
    const s = getSupportSocket();
    const join = () => s.emit("join", { ticketId: activeId });
    join();
    s.on("connect", join);
    return () => { s.emit("leave", { ticketId: activeId }); s.off("connect", join); };
  }, [activeId]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return tickets;
    const num = n.replace(/[^0-9]/g, "");
    return tickets.filter((t) =>
      t.subject.toLowerCase().includes(n) ||
      (t.creatorName ?? "").toLowerCase().includes(n) ||
      (t.lastPreview ?? "").toLowerCase().includes(n) ||
      ticketCode(t.number).toLowerCase().includes(n) ||
      (!!num && String(t.number).includes(num)));
  }, [tickets, q]);

  const totalUnread = tickets.reduce((s, t) => s + (t.unread || 0), 0);

  return (
    <div className="flex h-[calc(100vh-var(--topbar-height)-2.5rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <aside className={cn("flex w-full flex-col border-r border-border sm:w-[340px] sm:shrink-0", activeId && "hidden sm:flex")}>
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Headphones className="h-4 w-4" /></span>
            <div>
              <h3 className="font-heading text-sm font-semibold leading-tight">Support</h3>
              <p className="text-[11px] text-muted-foreground">{totalUnread > 0 ? `${totalUnread} unread` : "We're here to help"}</p>
            </div>
          </div>
          {!agent && (myOpen ? (
            <div className="group relative">
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={startNew}>
                <Info className="h-4 w-4 text-chart-3" /> New
              </Button>
              <div className="pointer-events-none absolute right-0 top-10 z-50 w-64 rounded-lg border border-border bg-popover p-2.5 text-[11px] leading-relaxed text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                You already have an open conversation <span className="font-mono font-semibold">{ticketShort(myOpen.number)}</span>. <span className="font-medium text-foreground">Click to chat &amp; resolve it first</span> — you can start a new one only after it&apos;s resolved.
              </div>
            </div>
          ) : (
            <Button size="sm" className="h-8 gap-1.5" onClick={startNew}><Plus className="h-4 w-4" /> New</Button>
          ))}
        </div>

        {agent && (
          <div className="flex gap-1 border-b border-border p-2">
            {(["inbox", "mine"] as const).map((sc) => (
              <button key={sc} onClick={() => setScope(sc)} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors", scope === sc ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary")}>
                {sc === "inbox" ? <Inbox className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                {sc === "inbox" ? "All tickets" : "My tickets"}
              </button>
            ))}
          </div>
        )}

        <div className="relative border-b border-border p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by subject, name or SS-id" className="h-9 pl-8 text-sm" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-sm text-muted-foreground">
              <MessageSquare className="h-8 w-8 opacity-40" />
              {agent ? "No tickets yet." : "No conversations yet."}
              {!agent && <button onClick={startNew} className="font-medium text-primary hover:underline">Start one</button>}
            </div>
          ) : filtered.map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => openTicket(t.id)}
              onKeyDown={(e) => { if (e.key === "Enter") openTicket(t.id); }}
              className={cn("flex w-full cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-3 text-left outline-none transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50", activeId === t.id && "bg-secondary/70")}
            >
              {agent ? <Avatar src={t.creatorAvatar} name={t.creatorName ?? "?"} className="h-10 w-10" /> : <Avatar brand name="SerpScale" className="h-10 w-10" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_META[t.priority].dot)} title={`${PRIORITY_META[t.priority].label} priority`} />
                    <span className="truncate text-sm font-semibold">{t.subject}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-mono opacity-70">{ticketShort(t.number)}</span>
                    {relTime(t.lastMessageAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">{agent ? <span className="font-medium text-foreground/80">{t.creatorName ?? t.creatorEmail ?? "Customer"}</span> : null}{agent ? " · " : ""}{t.lastPreview}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className={cn("rounded-full px-1.5 py-px text-[9px] font-semibold uppercase", STATUS_STYLES[t.status])}>{t.status}</span>
                    {t.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{t.unread}</span>}
                  </span>
                </div>
              </div>
              {agent && (
                <button
                  onClick={(e) => { e.stopPropagation(); setInfoTicket(t); }}
                  title="Customer & ticket details"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-primary"
                >
                  <Info className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>

      <section className={cn("flex min-w-0 flex-1 flex-col", !activeId && "hidden sm:flex")}>
        {activeId && activeTicket ? (
          <ChatPanel
            key={activeId}
            ticket={activeTicket}
            messages={messages}
            loading={loadingThread}
            myId={myId}
            counterpart={agent
              ? { name: activeTicket.creatorName ?? activeTicket.creatorEmail ?? "Customer", src: activeTicket.creatorAvatar }
              : { name: BRAND_TEAM, brand: true }}
            otherTyping={otherTyping}
            onBack={() => { setActiveId(null); setActiveTicket(null); }}
            onSent={(m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))}
            onStatus={(st: TicketStatus) => { setActiveTicket((t) => (t ? { ...t, status: st } : t)); setTickets((ts) => ts.map((x) => (x.id === activeId ? { ...x, status: st } : x))); }}
            onNew={agent ? undefined : startNew}
          />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground sm:flex">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary"><Headphones className="h-8 w-8" /></span>
            <div>
              <p className="font-heading text-base font-semibold text-foreground">{agent ? "Support inbox" : "Your conversations"}</p>
              <p className="mt-1 max-w-xs text-sm">{agent ? "Pick a ticket on the left to view and reply." : "Pick a conversation on the left, or start a new one — we usually reply within a business day."}</p>
            </div>
            {!agent && <Button className="gap-2" onClick={startNew}><Plus className="h-4 w-4" /> New conversation</Button>}
          </div>
        )}
      </section>

      {newOpen && (
        <NewTicketModal
          onClose={() => setNewOpen(false)}
          onCreated={(ticket) => { setNewOpen(false); setTickets((ts) => [ticket, ...ts.filter((t) => t.id !== ticket.id)]); openTicket(ticket.id); }}
        />
      )}

      {infoTicket && <TicketInfoModal ticket={infoTicket} onClose={() => setInfoTicket(null)} />}
    </div>
  );
}
