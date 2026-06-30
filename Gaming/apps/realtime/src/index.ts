import { createServer } from "node:http";
import { Server, type DefaultEventsMap } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { z } from "zod";
import { prisma } from "@aso/db";
import {
  SOCKET_EVENTS,
  CHAT_MAX_LEN,
  isGameKey,
  type AccessTokenClaims,
  type ChatMessageMsg,
  type InviteReceivedMsg,
  type LobbyVisibility,
} from "@aso/shared";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { pubClient, redis, subClient } from "./redis.js";
import { verifyHandshake } from "./auth.js";
import { Matchmaker } from "./matchmaking.js";
import { LobbyManager } from "./lobby.js";
import { metricsText, registerRealtimeGauges } from "./prometheus.js";
import type { GameRoom } from "./room.js";
import { sanitizeChat, chatRateOk, socketRateOk } from "./chat.js";

const queueJoinSchema = z.object({ game: z.string(), mode: z.string().optional() });
const gameActionSchema = z.object({ matchId: z.string(), action: z.unknown() });
const resyncSchema = z.object({ matchId: z.string() });
const reclaimSchema = z.object({ matchId: z.string() });
// Accept a little slack over the cap; sanitizeChat truncates to CHAT_MAX_LEN.
const chatSendSchema = z.object({ matchId: z.string(), text: z.string().min(1).max(CHAT_MAX_LEN * 4) });
const inviteSendSchema = z.object({ toUserId: z.string().min(1).max(64), game: z.string() });
const inviteAcceptSchema = z.object({ fromUserId: z.string().min(1).max(64), game: z.string() });
const lobbyCreateSchema = z.object({
  game: z.string(),
  mode: z.string().max(32).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  config: z.unknown().optional(),
});
const lobbyIdSchema = z.object({ lobbyId: z.string().min(1).max(64) });
const lobbyListSchema = z.object({ game: z.string().optional() });
const lobbyInviteSchema = z.object({ lobbyId: z.string().min(1).max(64), toUserId: z.string().min(1).max(64) });
const lobbySeatSchema = z.object({ lobbyId: z.string().min(1).max(64), seat: z.number().int().min(0).max(15) });
const lobbyTeamSchema = z.object({
  lobbyId: z.string().min(1).max(64),
  seat: z.number().int().min(0).max(15),
  team: z.number().int().min(0).max(15),
});
const lobbyConfigSchema = z.object({ lobbyId: z.string().min(1).max(64), config: z.unknown() });

// Last-resort guards: a stray async error must not take down a node holding
// live matches (the reduce/bot paths are fire-and-forget).
process.on("unhandledRejection", (reason) => logger.error({ reason }, "unhandledRejection"));
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException — exiting");
  setTimeout(() => process.exit(1), 100).unref();
});

const userRoom = (userId: string): string => `u:${userId}`;
const presenceKey = (userId: string): string => `presence:online:${userId}`;

/**
 * Inter-node room operations (forwarded via the Socket.IO cluster adapter's
 * server-side messaging). A match's authoritative state lives on one node; a
 * socket connected to a different node forwards the op, and only the owning
 * node — the one with the room in memory — applies it.
 */
interface InterServerEvents {
  "op:action": (d: { matchId: string; userId: string; action: unknown }) => void;
  "op:resync": (d: { matchId: string; userId: string }) => void;
  "op:reclaim": (d: { matchId: string; userId: string }) => void;
  "op:presence": (d: { userId: string; connected: boolean }) => void;
  "op:chat": (d: { matchId: string; userId: string; text: string; ts: number }) => void;
}

/** True when the two users are accepted friends (either direction). */
async function areFriends(a: string, b: string): Promise<boolean> {
  const fr = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
    select: { id: true },
  });
  return fr !== null;
}

async function main(): Promise<void> {
  const httpServer = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "realtime" }));
      return;
    }
    if (req.url === "/metrics") {
      const metricsToken = process.env.METRICS_TOKEN;
      if (metricsToken && req.headers.authorization !== `Bearer ${metricsToken}`) {
        res.writeHead(401);
        res.end();
        return;
      }
      metricsText()
        .then(({ body, type }) => {
          res.writeHead(200, { "content-type": type });
          res.end(body);
        })
        .catch((err: unknown) => {
          logger.error({ err }, "metrics render failed");
          res.writeHead(500);
          res.end();
        });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  // Cast through the constructor's first-arg union to sidestep the http.Server
  // generics skew between @types/node and socket.io's bundled http types.
  const io = new Server<DefaultEventsMap, DefaultEventsMap, InterServerEvents>(
    httpServer as unknown as ConstructorParameters<typeof Server>[0],
    {
      cors: { origin: env.corsOrigins, credentials: true },
      // Game actions are tiny; cap the per-message buffer to blunt memory-flood
      // vectors, and detect dead sockets promptly (disconnect-grace relies on it).
      maxHttpBufferSize: 16_384,
      pingInterval: 25_000,
      pingTimeout: 20_000,
    },
  );
  io.adapter(createAdapter(pubClient, subClient));

  // Authenticate the httpOnly access cookie at the handshake (§8.3), and reject
  // banned / erased / revoked users so a still-valid access token can't be used
  // to keep playing/chatting after a ban (mirrors the API's requireAuth).
  io.use((socket, next) => {
    const claims = verifyHandshake(socket.handshake.headers.cookie);
    if (!claims) {
      next(new Error("unauthorized"));
      return;
    }
    void (async () => {
      try {
        const [revoked, user] = await Promise.all([
          redis.exists(`revoked:${claims.sub}`).catch(() => 0),
          prisma.user.findUnique({
            where: { id: claims.sub },
            select: { banned: true, deletedAt: true },
          }),
        ]);
        if (revoked === 1 || !user || user.banned || user.deletedAt) {
          next(new Error("forbidden"));
          return;
        }
      } catch {
        // Both the revocation lookup and the DB ban check failed. Fail CLOSED in
        // production so a banned user can't connect during an infra hiccup; dev
        // stays fail-open (JWT was already valid).
        if (env.NODE_ENV === "production") {
          next(new Error("unavailable"));
          return;
        }
      }
      (socket.data as { claims: AccessTokenClaims }).claims = claims;
      next();
    })();
  });

  const matchmaker = new Matchmaker(io);
  matchmaker.start();

  const displayNameOf = async (uid: string): Promise<string> => {
    const u = await prisma.user.findUnique({ where: { id: uid }, select: { displayName: true } });
    return u?.displayName ?? "Играч";
  };
  const lobbies = new LobbyManager(io, matchmaker, displayNameOf);

  // Live gauges for Prometheus (sampled on each /metrics scrape).
  registerRealtimeGauges({
    rooms: () => matchmaker.activeRoomCount(),
    sockets: () => (io.engine as { clientsCount?: number }).clientsCount ?? 0,
    lobbies: () => lobbies.openCount(),
  });

  /** Broadcast a chat line to every human seat in a room (reaches clients on
   *  any node via the adapter). */
  const broadcastChat = (room: GameRoom, seatNo: number, displayName: string, text: string, ts: number) => {
    const msg: ChatMessageMsg = { matchId: room.matchId, seat: seatNo, displayName, text, ts };
    for (const s of room.seats) {
      if (s.userId) io.to(userRoom(s.userId)).emit(SOCKET_EVENTS.CHAT_MESSAGE, msg);
    }
  };

  // Apply forwarded ops only if THIS node owns the room/match; otherwise no-op.
  io.on("op:action", (d) => matchmaker.getRoom(d.matchId)?.handleAction(d.userId, d.action));
  io.on("op:resync", (d) => matchmaker.getRoom(d.matchId)?.resync(d.userId));
  io.on("op:reclaim", (d) => matchmaker.getRoom(d.matchId)?.reclaim(d.userId));
  io.on("op:presence", (d) =>
    matchmaker.activeRoomForUser(d.userId)?.setConnected(d.userId, d.connected),
  );
  io.on("op:chat", (d) => {
    const room = matchmaker.getRoom(d.matchId);
    const seat = room?.seats.find((s) => s.userId === d.userId);
    if (room && seat) broadcastChat(room, seat.seat, seat.displayName, d.text, d.ts);
  });

  /** Resume/forfeit a user's match presence whether the room is local or on a
   *  peer node. */
  const dispatchPresence = (uid: string, connected: boolean) => {
    const room = matchmaker.activeRoomForUser(uid);
    if (room) room.setConnected(uid, connected);
    else io.serverSideEmit("op:presence", { userId: uid, connected });
  };

  io.on("connection", (socket) => {
    const { claims } = socket.data as { claims: AccessTokenClaims };
    const userId = claims.sub;
    void socket.join(userRoom(userId));

    // Mark online for friends' presence; refresh a generous safety TTL.
    void redis.set(presenceKey(userId), "1", "EX", 86400).catch(() => undefined);

    // Resume an in-progress match if this is a reconnect (new socket), even if
    // the match is owned by another node.
    dispatchPresence(userId, true);

    socket.on(SOCKET_EVENTS.QUEUE_JOIN, (payload: unknown) => {
      if (!socketRateOk(socket, "queue", 12, 10_000)) return;
      const parsed = queueJoinSchema.safeParse(payload);
      if (!parsed.success || !isGameKey(parsed.data.game)) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: "bad_request", message: "Invalid queue join" });
        return;
      }
      // Queueing anew while still seated in a live match means the player has
      // moved on — resign that seat so the old table ends cleanly instead of
      // auto-playing forever (its states would also keep streaming to this user).
      matchmaker.activeRoomForUser(userId)?.resign(userId);
      void matchmaker
        .joinQueue(userId, parsed.data.game, parsed.data.mode)
        .then((ok) => {
          if (ok) socket.emit(SOCKET_EVENTS.QUEUE_WAITING, { game: parsed.data.game });
          else socket.emit(SOCKET_EVENTS.ERROR, { code: "no_engine", message: "Game unavailable" });
        })
        .catch((err) => logger.error({ err }, "joinQueue failed"));
    });

    socket.on(SOCKET_EVENTS.QUEUE_LEAVE, () => {
      void matchmaker.leaveAllQueues(userId);
    });

    socket.on(SOCKET_EVENTS.GAME_ACTION, (payload: unknown) => {
      // Per-socket flood guard (each action runs legalActions + serialization).
      if (!socketRateOk(socket, "action", 40, 10_000)) return;
      const parsed = gameActionSchema.safeParse(payload);
      if (!parsed.success) return;
      const room = matchmaker.getRoom(parsed.data.matchId);
      if (room) room.handleAction(userId, parsed.data.action);
      else io.serverSideEmit("op:action", { matchId: parsed.data.matchId, userId, action: parsed.data.action });
    });

    socket.on(SOCKET_EVENTS.GAME_RESYNC, (payload: unknown) => {
      const parsed = resyncSchema.safeParse(payload);
      if (!parsed.success) return;
      const room = matchmaker.getRoom(parsed.data.matchId);
      if (room) room.resync(userId);
      else io.serverSideEmit("op:resync", { matchId: parsed.data.matchId, userId });
    });

    socket.on(SOCKET_EVENTS.GAME_RECLAIM, (payload: unknown) => {
      const parsed = reclaimSchema.safeParse(payload);
      if (!parsed.success) return;
      const room = matchmaker.getRoom(parsed.data.matchId);
      if (room) room.reclaim(userId);
      else io.serverSideEmit("op:reclaim", { matchId: parsed.data.matchId, userId });
    });

    // ── Lobby (pre-game room) ────────────────────────────────────────────────
    socket.on(SOCKET_EVENTS.LOBBY_CREATE, (payload: unknown) => {
      if (!socketRateOk(socket, "lobbyCreate", 8, 30_000)) return;
      if (claims.role === "GUEST") return; // guests can't host
      const parsed = lobbyCreateSchema.safeParse(payload);
      if (!parsed.success || !isGameKey(parsed.data.game)) return;
      const visibility: LobbyVisibility = parsed.data.visibility ?? "public";
      void lobbies
        .create(userId, parsed.data.game, parsed.data.mode ?? "custom", visibility, parsed.data.config ?? null)
        .catch((err) => logger.error({ err }, "lobby create failed"));
    });

    socket.on(SOCKET_EVENTS.LOBBY_JOIN, (payload: unknown) => {
      if (!socketRateOk(socket, "lobbyJoin", 20, 10_000)) return;
      const parsed = lobbyIdSchema.safeParse(payload);
      if (!parsed.success) return;
      void lobbies.join(userId, parsed.data.lobbyId).then((l) => {
        if (!l) socket.emit(SOCKET_EVENTS.ERROR, { code: "lobby_full", message: "Стаята е недостъпна" });
      });
    });

    socket.on(SOCKET_EVENTS.LOBBY_LEAVE, () => lobbies.leave(userId));

    socket.on(SOCKET_EVENTS.LOBBY_LIST, (payload: unknown) => {
      const parsed = lobbyListSchema.safeParse(payload);
      const game = parsed.success && parsed.data.game && isGameKey(parsed.data.game) ? parsed.data.game : undefined;
      void lobbies.listPublic(game).then((list) => {
        socket.emit(SOCKET_EVENTS.LOBBY_LIST_RESULT, { lobbies: list });
      });
    });

    socket.on(SOCKET_EVENTS.LOBBY_INVITE, (payload: unknown) => {
      if (!socketRateOk(socket, "lobbyInvite", 15, 30_000)) return;
      const parsed = lobbyInviteSchema.safeParse(payload);
      if (!parsed.success) return;
      const lobby = lobbies.get(parsed.data.lobbyId);
      if (!lobby || !lobby.has(userId)) return;
      void areFriends(userId, parsed.data.toUserId).then(async (ok) => {
        if (!ok) return;
        const me = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
        lobbies.invite(parsed.data.lobbyId, parsed.data.toUserId, me?.displayName ?? "Играч", lobby.game);
      });
    });

    socket.on(SOCKET_EVENTS.LOBBY_KICK, (payload: unknown) => {
      const parsed = lobbySeatSchema.safeParse(payload);
      if (parsed.success) lobbies.kick(userId, parsed.data.lobbyId, parsed.data.seat);
    });

    socket.on(SOCKET_EVENTS.LOBBY_ADD_BOT, (payload: unknown) => {
      const parsed = lobbyIdSchema.safeParse(payload);
      if (parsed.success) lobbies.addBot(userId, parsed.data.lobbyId);
    });

    socket.on(SOCKET_EVENTS.LOBBY_REMOVE_BOT, (payload: unknown) => {
      const parsed = lobbySeatSchema.safeParse(payload);
      if (parsed.success) lobbies.removeBot(userId, parsed.data.lobbyId, parsed.data.seat);
    });

    socket.on(SOCKET_EVENTS.LOBBY_SET_TEAM, (payload: unknown) => {
      const parsed = lobbyTeamSchema.safeParse(payload);
      if (parsed.success) lobbies.setTeam(userId, parsed.data.lobbyId, parsed.data.seat, parsed.data.team);
    });

    socket.on(SOCKET_EVENTS.LOBBY_SET_CONFIG, (payload: unknown) => {
      const parsed = lobbyConfigSchema.safeParse(payload);
      if (parsed.success) lobbies.setConfig(userId, parsed.data.lobbyId, parsed.data.config);
    });

    socket.on(SOCKET_EVENTS.LOBBY_START, (payload: unknown) => {
      const parsed = lobbyIdSchema.safeParse(payload);
      if (parsed.success) void lobbies.start(userId, parsed.data.lobbyId);
    });

    socket.on(SOCKET_EVENTS.CHAT_SEND, (payload: unknown) => {
      const parsed = chatSendSchema.safeParse(payload);
      if (!parsed.success) return;
      // Guests can't chat (S14). Rate-limit + sanitize on this node (the one
      // holding the socket); the owning node verifies seat membership.
      if (claims.role === "GUEST") return;
      if (!chatRateOk(socket)) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: "chat_rate", message: "Твърде бързо. Изчакай малко." });
        return;
      }
      const text = sanitizeChat(parsed.data.text);
      if (!text) return;

      const room = matchmaker.getRoom(parsed.data.matchId);
      if (room) {
        const seat = room.seats.find((s) => s.userId === userId);
        if (seat) broadcastChat(room, seat.seat, seat.displayName, text, Date.now());
      } else {
        io.serverSideEmit("op:chat", { matchId: parsed.data.matchId, userId, text, ts: Date.now() });
      }
    });

    // Invite a friend to play; they get an INVITE_RECEIVED if online.
    socket.on(SOCKET_EVENTS.INVITE_SEND, (payload: unknown) => {
      if (!socketRateOk(socket, "invite", 10, 30_000)) return;
      const parsed = inviteSendSchema.safeParse(payload);
      if (!parsed.success || !isGameKey(parsed.data.game)) return;
      const { toUserId, game } = parsed.data;
      void areFriends(userId, toUserId).then(async (ok) => {
        if (!ok) return;
        const sockets = await io.in(userRoom(toUserId)).fetchSockets();
        if (sockets.length === 0) return; // offline
        const me = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
        const msg: InviteReceivedMsg = { fromUserId: userId, fromName: me?.displayName ?? "Играч", game };
        io.to(userRoom(toUserId)).emit(SOCKET_EVENTS.INVITE_RECEIVED, msg);
      });
    });

    // Accept an invite: seat both friends into a private match now.
    socket.on(SOCKET_EVENTS.INVITE_ACCEPT, (payload: unknown) => {
      if (!socketRateOk(socket, "inviteAccept", 20, 30_000)) return;
      const parsed = inviteAcceptSchema.safeParse(payload);
      if (!parsed.success || !isGameKey(parsed.data.game)) return;
      const { fromUserId, game } = parsed.data;
      void areFriends(userId, fromUserId).then((ok) => {
        if (!ok) return;
        void matchmaker.createPrivateMatch([fromUserId, userId], game).catch((err) =>
          logger.error({ err }, "createPrivateMatch failed"),
        );
      });
    });

    socket.on("disconnect", () => {
      void matchmaker.leaveAllQueues(userId);
      // Only flag offline if no other socket for this user remains anywhere in
      // the cluster (multi-tab / multi-node). fetchSockets is adapter-wide.
      void io
        .in(userRoom(userId))
        .fetchSockets()
        .then((sockets) => {
          if (sockets.some((s) => s.id !== socket.id)) return; // another live socket
          dispatchPresence(userId, false);
          lobbies.leave(userId); // drop out of any pre-game lobby
          void redis.del(presenceKey(userId)).catch(() => undefined);
        })
        .catch(() => dispatchPresence(userId, false));
    });
  });

  httpServer.listen(env.REALTIME_PORT, () => {
    logger.info(`🂱 АСО realtime listening on :${env.REALTIME_PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down realtime");
    matchmaker.stop();
    // Finalize live matches (write results + notify players) before closing, so
    // a rolling deploy doesn't silently drop in-progress tables.
    void matchmaker.drain().finally(() => {
      io.close(() => {
        void Promise.allSettled([
          prisma.$disconnect(),
          redis.quit(),
          pubClient.quit(),
          subClient.quit(),
        ]).then(() => process.exit(0));
      });
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "fatal realtime startup error");
  process.exit(1);
});
