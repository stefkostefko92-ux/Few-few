import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { TokenService } from "../auth/tokens.js";
import type { ChatMessage } from "../domain/clanTypes.js";
import type { Player } from "../domain/types.js";

const HISTORY_LIMIT = 50;

interface ClientMeta {
  playerId: string;
  name: string;
  clanId: string;
}

/**
 * Real-time clan chat over WebSocket (GDD §7.2). Clients connect to `/ws` with
 * an access token (`?token=`), are placed in their clan's room, and exchange
 * chat messages broadcast to clan-mates. Recent history is kept in-memory per
 * clan for the prototype (production persists to Postgres/Redis).
 */
export class ChatHub {
  private readonly rooms = new Map<string, Set<WebSocket>>();
  private readonly history = new Map<string, ChatMessage[]>();
  private readonly meta = new WeakMap<WebSocket, ClientMeta>();

  constructor(
    private readonly tokens: TokenService,
    private readonly getPlayer: (id: string) => Promise<Player>,
  ) {}

  attach(server: Server): WebSocketServer {
    const wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (ws, req) => {
      void this.onConnection(ws, req.url ?? "");
    });
    return wss;
  }

  private async onConnection(ws: WebSocket, url: string): Promise<void> {
    try {
      const token = new URL(url, "http://localhost").searchParams.get("token");
      if (!token) return void ws.close(1008, "missing token");
      const claims = await this.tokens.verifyAccess(token);
      const player = await this.getPlayer(claims.playerId);
      if (!player.clanId) return void ws.close(1008, "not in a clan");

      const meta: ClientMeta = { playerId: player.id, name: player.name, clanId: player.clanId };
      this.meta.set(ws, meta);
      this.join(meta.clanId, ws);

      ws.send(JSON.stringify({ type: "history", messages: this.history.get(meta.clanId) ?? [] }));
      ws.on("message", (data) => this.onMessage(ws, meta, data.toString()));
      ws.on("close", () => this.leave(meta.clanId, ws));
    } catch {
      ws.close(1008, "unauthorized");
    }
  }

  private onMessage(ws: WebSocket, meta: ClientMeta, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const msg = parsed as { type?: string; text?: unknown };
    if (msg.type !== "chat" || typeof msg.text !== "string") return;
    const text = msg.text.trim().slice(0, 500);
    if (!text) return;

    const chat: ChatMessage = { from: meta.playerId, name: meta.name, text, at: Date.now() };
    this.record(meta.clanId, chat);
    this.broadcast(meta.clanId, { type: "chat", ...chat });
    void ws; // sender also receives the broadcast (single source of truth)
  }

  private join(clanId: string, ws: WebSocket): void {
    let room = this.rooms.get(clanId);
    if (!room) this.rooms.set(clanId, (room = new Set()));
    room.add(ws);
  }

  private leave(clanId: string, ws: WebSocket): void {
    const room = this.rooms.get(clanId);
    if (!room) return;
    room.delete(ws);
    if (room.size === 0) this.rooms.delete(clanId);
  }

  private record(clanId: string, chat: ChatMessage): void {
    let log = this.history.get(clanId);
    if (!log) this.history.set(clanId, (log = []));
    log.push(chat);
    if (log.length > HISTORY_LIMIT) log.splice(0, log.length - HISTORY_LIMIT);
  }

  private broadcast(clanId: string, payload: object): void {
    const room = this.rooms.get(clanId);
    if (!room) return;
    const data = JSON.stringify(payload);
    for (const client of room) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }
}
