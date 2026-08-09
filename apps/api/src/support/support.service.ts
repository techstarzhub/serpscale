import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EventEmitter } from "events";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { StorageService } from "../storage/storage.service";
import { PermissionsService } from "../auth/permissions.service";
import { PERMISSIONS } from "../auth/permissions";
import type { AuthUser } from "../auth/decorators/current-user.decorator";
import { AttachmentDto, CreateTicketDto, PostMessageDto } from "./dto/support.dto";

const APP_URL = process.env.APP_URL || process.env.WEB_URL || "http://localhost:3000";
const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

type Viewer = { id: string; role: string; agent: boolean };

/**
 * Support desk logic: tickets + threaded chat between customers and agents
 * (super admins / users with the platform.support permission). Persists to
 * Postgres and pushes realtime updates through `events` (the gateway relays
 * them to socket rooms), plus fires email notifications to the other party.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  /** Realtime bus. The gateway subscribes in afterInit and broadcasts to rooms.
   *  One-way (service → gateway) so there's no circular dependency. */
  readonly events = new EventEmitter();

  // Set by the gateway: reports which sides are actively viewing a ticket right
  // now, so we can suppress emails for messages the recipient is seeing live.
  private presenceProbe: ((ticketId: string) => Promise<{ agent: boolean; customer: boolean }>) | null = null;
  setPresenceProbe(fn: (ticketId: string) => Promise<{ agent: boolean; customer: boolean }>) { this.presenceProbe = fn; }
  // Debounce: last email time per `${ticketId}:${side}` so an offline recipient
  // isn't emailed for every message in a burst.
  private readonly lastEmailAt = new Map<string, number>();
  private static readonly EMAIL_DEBOUNCE_MS = 3 * 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly perms: PermissionsService,
    private readonly storage: StorageService,
  ) {
    this.events.setMaxListeners(50);
  }

  /** Resolve a stored avatar key to a temporary URL (null when unset). */
  private async avatar(key: string | null | undefined): Promise<string | null> {
    if (!key) return null;
    try { return await this.storage.signedUrl(key); } catch { return null; }
  }

  // ---- roles -------------------------------------------------------------
  /** A support agent = super admin, or anyone granted platform.support. */
  async isAgent(user: Pick<AuthUser, "id" | "role">): Promise<boolean> {
    if (user.role === "SUPER_ADMIN") return true;
    const set = await this.perms.resolve(user).catch(() => new Set<string>());
    return set.has(PERMISSIONS.PLATFORM_SUPPORT);
  }

  async viewer(user: Pick<AuthUser, "id" | "role">): Promise<Viewer> {
    return { id: user.id, role: user.role, agent: await this.isAgent(user) };
  }

  /** Emails of everyone who can answer tickets (for new-ticket alerts). */
  private async agentEmails(): Promise<string[]> {
    const supers = await this.prisma.user
      .findMany({ where: { role: "SUPER_ADMIN", isActive: true }, select: { email: true } })
      .catch(() => [] as { email: string }[]);
    const emails = new Set(supers.map((a) => a.email).filter(Boolean));
    // Anyone with the support permission granted directly.
    const granted = await this.prisma.user
      .findMany({ where: { isActive: true, extraPermissions: { has: PERMISSIONS.PLATFORM_SUPPORT } }, select: { email: true } })
      .catch(() => [] as { email: string }[]);
    granted.forEach((u) => u.email && emails.add(u.email));
    if (!emails.size) emails.add(process.env.SUPPORT_EMAIL || process.env.CONTACT_INBOX || "hello@serpscale.com");
    return [...emails];
  }

  // ---- serialization -----------------------------------------------------
  private msgView(m: any) {
    return {
      id: m.id,
      ticketId: m.ticketId,
      body: m.body,
      attachments: (m.attachments as AttachmentDto[] | null) ?? [],
      fromAgent: m.fromAgent,
      senderId: m.senderId,
      senderName: m.sender?.name ?? (m.fromAgent ? "Support" : "You"),
      deliveredAt: m.deliveredAt,
      readAt: m.readAt,
      createdAt: m.createdAt,
    };
  }

  private ticketView(t: any, viewer: Viewer, creatorAvatar: string | null = null) {
    return {
      id: t.id,
      number: t.number,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      creatorId: t.creatorId,
      creatorName: t.creator?.name ?? null,
      creatorEmail: t.creator?.email ?? null,
      creatorAvatar,
      orgName: t.organization?.name ?? null,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee?.name ?? null,
      lastMessageAt: t.lastMessageAt,
      lastPreview: t.lastPreview,
      unread: viewer.agent ? t.unreadForAgent : t.unreadForCustomer,
      createdAt: t.createdAt,
    };
  }

  // ---- queries -----------------------------------------------------------
  /** List tickets. Agents with scope=inbox see everything; otherwise a user
   *  sees only the tickets they opened. */
  async listTickets(user: AuthUser, scope: "mine" | "inbox" = "mine") {
    const v = await this.viewer(user);
    const asInbox = v.agent && scope === "inbox";
    const rows = await this.prisma.supportTicket.findMany({
      where: asInbox ? {} : { creatorId: user.id },
      orderBy: { lastMessageAt: "desc" },
      take: 200,
      include: { creator: { select: { name: true, email: true, avatarKey: true } }, organization: { select: { name: true } }, assignee: { select: { name: true } } },
    });
    const avatars = new Map<string, string | null>();
    await Promise.all(rows.map(async (t) => { if (!avatars.has(t.creatorId)) avatars.set(t.creatorId, await this.avatar(t.creator?.avatarKey)); }));
    return { tickets: rows.map((t) => this.ticketView(t, v, avatars.get(t.creatorId) ?? null)), agent: v.agent };
  }

  /** Total unread across the viewer's visible tickets (topbar badge). */
  async unreadCount(user: AuthUser): Promise<{ count: number; agent: boolean }> {
    const v = await this.viewer(user);
    const rows = await this.prisma.supportTicket.findMany({
      where: v.agent ? {} : { creatorId: user.id },
      select: { unreadForAgent: true, unreadForCustomer: true },
    });
    const count = rows.reduce((s, t) => s + (v.agent ? t.unreadForAgent : t.unreadForCustomer), 0);
    return { count, agent: v.agent };
  }

  private async loadTicket(id: string) {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: { creator: { select: { name: true, email: true, avatarKey: true } }, organization: { select: { name: true } }, assignee: { select: { name: true } } },
    });
    if (!t) throw new NotFoundException("Ticket not found.");
    return t;
  }

  private assertAccess(t: { creatorId: string }, v: Viewer) {
    if (!v.agent && t.creatorId !== v.id) throw new ForbiddenException("You don't have access to this ticket.");
  }

  /** Lightweight membership check for socket joins. */
  async canAccess(user: AuthUser, ticketId: string): Promise<boolean> {
    const v = await this.viewer(user);
    if (v.agent) return true;
    const t = await this.prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { creatorId: true } });
    return !!t && t.creatorId === user.id;
  }

  /** Full ticket + messages. Opening it marks the other side's messages as
   *  read for the viewer and clears their unread badge. */
  async getTicket(user: AuthUser, id: string) {
    const v = await this.viewer(user);
    const t = await this.loadTicket(id);
    this.assertAccess(t, v);
    const messages = await this.prisma.supportMessage.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: "asc" },
      include: { sender: { select: { name: true } } },
    });
    await this.markRead(user, id, v).catch(() => undefined);
    return { ticket: this.ticketView(t, v, await this.avatar(t.creator?.avatarKey)), messages: messages.map((m) => this.msgView(m)) };
  }

  // ---- mutations ---------------------------------------------------------
  async createTicket(user: AuthUser, dto: CreateTicketDto) {
    // One open conversation at a time — a user must resolve (or have resolved)
    // their current ticket before opening a new one.
    const openOne = await this.prisma.supportTicket.findFirst({
      where: { creatorId: user.id, status: { not: "CLOSED" } },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, number: true },
    });
    if (openOne) {
      throw new BadRequestException(`You already have an open conversation (#${openOne.number}). Please continue there, or resolve it before starting a new one.`);
    }

    const body = dto.message.trim();
    if (!body && !(dto.attachments?.length)) throw new BadRequestException("Message can't be empty.");
    // The title is the user's first message (first line, trimmed to 80 chars).
    // An explicit subject, if provided, still wins.
    const derived = (body.split(/\r?\n/)[0] || body).trim();
    const subject =
      (dto.subject?.replace(/[\r\n]+/g, " ").trim() ||
        (derived ? derived.slice(0, 80) + (derived.length > 80 ? "…" : "") : "") ||
        "📎 Attachment").slice(0, 160);
    const priority = (["LOW", "NORMAL", "HIGH", "URGENT"] as const).includes(dto.priority as any) ? (dto.priority as any) : "NORMAL";

    const ticket = await this.prisma.supportTicket.create({
      data: {
        subject: subject || "Support request",
        priority,
        status: "OPEN",
        creatorId: user.id,
        orgId: user.orgId ?? null,
        lastPreview: body.slice(0, 140) || "📎 Attachment",
        unreadForAgent: 1,
        messages: {
          create: {
            senderId: user.id,
            fromAgent: false,
            body,
            attachments: (dto.attachments as any) ?? undefined,
          },
        },
      },
      include: {
        creator: { select: { name: true, email: true, avatarKey: true } },
        organization: { select: { name: true } },
        assignee: { select: { name: true } },
        messages: { include: { sender: { select: { name: true } } } },
      },
    });

    const v = await this.viewer(user);
    const view = this.ticketView(ticket, v, await this.avatar(ticket.creator?.avatarKey));
    this.events.emit("ticket:new", { ticket: ticket, view });
    this.notifyNewTicket(ticket).catch((e) => this.logger.warn(`new-ticket email failed: ${e}`));
    return { ticket: view, messages: ticket.messages.map((m) => this.msgView(m)) };
  }

  async postMessage(user: AuthUser, ticketId: string, dto: PostMessageDto) {
    const v = await this.viewer(user);
    const t = await this.loadTicket(ticketId);
    this.assertAccess(t, v);
    // A resolved conversation is closed for good — replying isn't allowed; the
    // user must open a fresh ticket.
    if (t.status === "CLOSED") throw new BadRequestException("This conversation is resolved. Please start a new one to continue.");
    const body = (dto.body ?? "").trim();
    if (!body && !(dto.attachments?.length)) throw new BadRequestException("Message can't be empty.");

    // The sender is the "agent side" only when they're staff AND not the person
    // who opened the ticket (an agent can also open their own ticket).
    const fromAgent = v.agent && t.creatorId !== v.id;

    const msg = await this.prisma.supportMessage.create({
      data: { ticketId, senderId: user.id, fromAgent, body, attachments: (dto.attachments as any) ?? undefined },
      include: { sender: { select: { name: true } } },
    });

    // Bump activity, preview, unread for the OTHER side. First agent reply claims it.
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastMessageAt: new Date(),
        lastPreview: (body.slice(0, 140) || "📎 Attachment"),
        ...(fromAgent ? { unreadForCustomer: { increment: 1 } } : { unreadForAgent: { increment: 1 } }),
        ...(fromAgent && !t.assigneeId ? { assigneeId: user.id } : {}),
      },
    });

    const view = this.msgView(msg);
    this.events.emit("message", { ticketId, message: view, fromAgent });
    this.notifyNewMessage(t, msg, fromAgent).catch((e) => this.logger.warn(`support msg email failed: ${e}`));
    return view;
  }

  /** Mark the other side's messages read for this viewer + clear their badge. */
  async markRead(user: AuthUser, ticketId: string, pre?: Viewer) {
    const v = pre ?? (await this.viewer(user));
    const t = await this.prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { creatorId: true } });
    if (!t) return { ok: true };
    if (!v.agent && t.creatorId !== v.id) throw new ForbiddenException("No access.");
    // The viewer reads messages authored by the OTHER side.
    const otherIsAgent = !v.agent; // customer reads agent messages; agent reads customer messages
    const now = new Date();
    await this.prisma.supportMessage.updateMany({
      where: { ticketId, fromAgent: otherIsAgent, readAt: null },
      data: { readAt: now, deliveredAt: now },
    });
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: v.agent ? { unreadForAgent: 0 } : { unreadForCustomer: 0 },
    });
    this.events.emit("read", { ticketId, byAgent: v.agent, at: now });
    return { ok: true };
  }

  /** Mark the other side's messages delivered (called when they come online). */
  async markDelivered(ticketId: string, viewerIsAgent: boolean) {
    const otherIsAgent = !viewerIsAgent;
    const now = new Date();
    const res = await this.prisma.supportMessage.updateMany({
      where: { ticketId, fromAgent: otherIsAgent, deliveredAt: null },
      data: { deliveredAt: now },
    });
    if (res.count) this.events.emit("delivered", { ticketId, byAgent: viewerIsAgent, at: now });
  }

  async setStatus(user: AuthUser, ticketId: string, status: "OPEN" | "PENDING" | "CLOSED") {
    const v = await this.viewer(user);
    const t = await this.loadTicket(ticketId);
    this.assertAccess(t, v);
    // Resolved is terminal — no reopening. To continue, either side starts a NEW
    // conversation. This keeps threads clean and each issue self-contained.
    if (t.status === "CLOSED") throw new BadRequestException("This conversation is resolved. Please start a new one to continue.");
    // Customers may only resolve their own ticket; agents can also mark it pending.
    if (!v.agent && status !== "CLOSED") throw new ForbiddenException("You can only resolve your own conversation.");
    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status, closedAt: status === "CLOSED" ? new Date() : null },
      include: { creator: { select: { name: true, email: true, avatarKey: true } }, organization: { select: { name: true } }, assignee: { select: { name: true } } },
    });
    const view = this.ticketView(updated, v, await this.avatar(updated.creator?.avatarKey));
    this.events.emit("ticket:update", { ticketId, status, view });
    return view;
  }

  // ---- emails ------------------------------------------------------------
  private async notifyNewTicket(ticket: any) {
    const to = await this.agentEmails();
    const name = ticket.creator?.name || ticket.creator?.email || "A customer";
    const preview = ticket.messages?.[0]?.body ?? ticket.lastPreview ?? "";
    const body = `
      <p style="margin:0 0 14px">A new support ticket has been opened.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280;width:90px">From</td><td style="padding:6px 0;font-weight:600">${esc(name)}</td></tr>
        ${ticket.creator?.email ? `<tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0"><a href="mailto:${esc(ticket.creator.email)}">${esc(ticket.creator.email)}</a></td></tr>` : ""}
        ${ticket.organization?.name ? `<tr><td style="padding:6px 0;color:#6b7280">Org</td><td style="padding:6px 0">${esc(ticket.organization.name)}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#6b7280">Subject</td><td style="padding:6px 0;font-weight:600">${esc(ticket.subject)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Priority</td><td style="padding:6px 0">${esc(ticket.priority)}</td></tr>
      </table>
      <div style="margin:16px 0 4px;color:#6b7280;font-size:13px">Message</div>
      <div style="white-space:pre-wrap;background:#f8f9fc;border:1px solid #eef0f4;border-radius:10px;padding:14px;font-size:14px;line-height:1.6">${esc(preview)}</div>`;
    await Promise.all(
      to.map((addr) =>
        this.email.sendBranded(addr, `New support ticket: ${ticket.subject}`, "New support ticket", body, { label: "Open in dashboard", url: `${APP_URL}/dashboard/support?ticket=${ticket.id}` }, null).catch(() => undefined),
      ),
    );
  }

  private async notifyNewMessage(ticket: any, msg: any, fromAgent: boolean) {
    // Notify the OTHER party. Agent→customer emails the ticket creator; customer→agent emails the agents.
    const recipientIsAgent = !fromAgent;

    // 1) If the recipient side is actively viewing the conversation, they see it
    //    live over the socket — no email needed.
    try {
      const pres = this.presenceProbe ? await this.presenceProbe(ticket.id) : null;
      if (pres && (recipientIsAgent ? pres.agent : pres.customer)) return;
    } catch { /* fall through to email */ }

    // 2) Debounce so an offline recipient isn't emailed for every message in a burst.
    const key = `${ticket.id}:${recipientIsAgent ? "agent" : "customer"}`;
    const now = Date.now();
    if (now - (this.lastEmailAt.get(key) ?? 0) < SupportService.EMAIL_DEBOUNCE_MS) return;
    this.lastEmailAt.set(key, now);

    const text = msg.body || "📎 Attachment";
    const title = fromAgent ? "New reply from support" : `New reply on: ${ticket.subject}`;
    const cta = { label: "Open conversation", url: `${APP_URL}/dashboard/support?ticket=${ticket.id}` };
    const body = `
      <p style="margin:0 0 12px">You have a new message on your support ticket <strong>${esc(ticket.subject)}</strong>.</p>
      <div style="white-space:pre-wrap;background:#f8f9fc;border:1px solid #eef0f4;border-radius:10px;padding:14px;font-size:14px;line-height:1.6">${esc(text)}</div>`;
    if (fromAgent) {
      const to = ticket.creator?.email;
      if (to) await this.email.sendBranded(to, title, "New reply from support", body, cta, null).catch(() => undefined);
    } else {
      const to = await this.agentEmails();
      await Promise.all(to.map((addr) => this.email.sendBranded(addr, title, "New customer reply", body, cta, null).catch(() => undefined)));
    }
  }
}
