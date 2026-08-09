import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/decorators/current-user.decorator";
import { SupportService } from "./support.service";

const room = (id: string) => `ticket:${id}`;
const userRoom = (id: string) => `user:${id}`;
const AGENTS = "agents";

/**
 * Real-time layer for the support desk. Auth is derived from the httpOnly
 * access_token cookie sent during the socket handshake. The service pushes
 * domain events onto its EventEmitter; this gateway relays them to the right
 * ticket / user / agents rooms (message delivery, read + delivered receipts,
 * typing indicators, and inbox activity for list badges).
 */
@WebSocketGateway({ namespace: "/support", cors: { origin: (_o: any, cb: any) => cb(null, true), credentials: true } })
export class SupportGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(SupportGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly support: SupportService,
  ) {}

  afterInit() {
    // Let the service ask which sides are actively viewing a ticket (to suppress
    // redundant email notifications for messages seen live).
    this.support.setPresenceProbe((ticketId) => this.activeSides(ticketId));

    // Relay service → sockets. One-way subscription (no circular dependency).
    this.support.events.on("message", ({ ticketId, message }: any) => {
      this.server.to(room(ticketId)).emit("message", message);
      void this.emitActivity(ticketId);
    });
    this.support.events.on("read", (e: any) => this.server.to(room(e.ticketId)).emit("read", e));
    this.support.events.on("delivered", (e: any) => this.server.to(room(e.ticketId)).emit("delivered", e));
    this.support.events.on("ticket:new", ({ view }: any) => {
      this.server.to(AGENTS).emit("ticket:new", view);
      if (view?.creatorId) this.server.to(userRoom(view.creatorId)).emit("ticket:activity", { ticketId: view.id });
    });
    this.support.events.on("ticket:update", ({ ticketId, view }: any) => this.server.to(room(ticketId)).emit("ticket:update", view));
  }

  /** Which sides (agent / customer) currently have a socket in the ticket room. */
  private async activeSides(ticketId: string): Promise<{ agent: boolean; customer: boolean }> {
    try {
      const sockets = await this.server.in(room(ticketId)).fetchSockets();
      let agent = false, customer = false;
      for (const s of sockets) {
        const u = (s.data as any)?.user;
        if (u?.agent) agent = true;
        else if (u) customer = true;
      }
      return { agent, customer };
    } catch {
      return { agent: false, customer: false };
    }
  }

  private async emitActivity(ticketId: string) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { creatorId: true } }).catch(() => null);
    if (!t) return;
    this.server.to(userRoom(t.creatorId)).emit("ticket:activity", { ticketId });
    this.server.to(AGENTS).emit("ticket:activity", { ticketId });
  }

  private parseCookie(raw: string | undefined, name: string): string | null {
    if (!raw) return null;
    for (const part of raw.split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
    }
    return null;
  }

  async handleConnection(socket: Socket) {
    try {
      const token =
        this.parseCookie(socket.handshake.headers.cookie, "access_token") ||
        (socket.handshake.auth?.token as string | undefined);
      if (!token) return socket.disconnect(true);
      const payload: any = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, orgId: true, name: true, isActive: true },
      });
      if (!user || !user.isActive) return socket.disconnect(true);
      const agent = await this.support.isAgent(user);
      socket.data.user = { id: user.id, role: user.role, orgId: user.orgId, name: user.name, agent } as AuthUser & { agent: boolean };
      socket.join(userRoom(user.id));
      if (agent) socket.join(AGENTS);
    } catch {
      socket.disconnect(true);
    }
  }

  @SubscribeMessage("join")
  async onJoin(@ConnectedSocket() socket: Socket, @MessageBody() data: { ticketId: string }) {
    const user = socket.data.user as (AuthUser & { agent: boolean }) | undefined;
    if (!user || !data?.ticketId) return { ok: false };
    const ok = await this.support.canAccess(user, data.ticketId);
    if (!ok) return { ok: false };
    socket.join(room(data.ticketId));
    // Being in the room means online → the other side's messages are delivered.
    await this.support.markDelivered(data.ticketId, user.agent).catch(() => undefined);
    return { ok: true };
  }

  @SubscribeMessage("leave")
  onLeave(@ConnectedSocket() socket: Socket, @MessageBody() data: { ticketId: string }) {
    if (data?.ticketId) socket.leave(room(data.ticketId));
    return { ok: true };
  }

  @SubscribeMessage("typing")
  onTyping(@ConnectedSocket() socket: Socket, @MessageBody() data: { ticketId: string; typing: boolean }) {
    const user = socket.data.user as (AuthUser & { agent: boolean }) | undefined;
    if (!user || !data?.ticketId) return;
    socket.to(room(data.ticketId)).emit("typing", { ticketId: data.ticketId, fromAgent: user.agent, typing: !!data.typing });
  }
}
