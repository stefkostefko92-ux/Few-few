import { createServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { z } from "zod";
import { prisma } from "@aso/db";
import {
  SOCKET_EVENTS,
  CHAT_MAX_LEN,
  isGameKey,
  type AccessTokenClaims,
  type ChatMessageMsg,
} from "@aso/shared";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { pubClient, redis, subClient } from "./redis.js";
import { verifyHandshake } from "./auth.js";
import { Matchmaker } from "./matchmaking.js";
import { sanitizeChat, chatRateOk } from "./chat.js";

const queueJoinSchema = z.object({ game: z.string(), mode: z.string().optional() });
const gameActionSchema = z.object({ matchId: z.string(), action: z.unknown() });
const resyncSchema = z.object({ matchId: z.string() });
// Accept a little slack over the cap; sanitizeChat truncates to CHAT_MAX_LEN.
const chatSendSchema = z.object({ matchId: z.string(), text: z.string().min(1).max(CHAT_MAX_LEN * 4) });

const userRoom = (userId: string): string => `u:${userId}`;

async function main(): Promise<void> {
  const httpServer = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "realtime" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  // Cast through the constructor's first-arg union to sidestep the http.Server
  // generics skew between @types/node and socket.io's bundled http types.
  const io = new Server(httpServer as unknown as ConstructorParameters<typeof Server>[0], {
    cors: { origin: env.corsOrigins, credentials: true },
  });
  io.adapter(createAdapter(pubClient, subClient));

  // Authenticate the httpOnly access cookie at the handshake (§8.3).
  io.use((socket, next) => {
    const claims = verifyHandshake(socket.handshake.headers.cookie);
    if (!claims) {
      next(new Error("unauthorized"));
      return;
    }
    (socket.data as { claims: AccessTokenClaims }).claims = claims;
    next();
  });

  const matchmaker = new Matchmaker(io);
  matchmaker.start();

  io.on("connection", (socket) => {
    const { claims } = socket.data as { claims: AccessTokenClaims };
    const userId = claims.sub;
    void socket.join(userRoom(userId));

    void prisma.user
      .findUnique({ where: { id: userId } })
      .then((u) => {
        if (u) matchmaker.setDisplayName(userId, u.displayName);
      })
      .catch(() => undefined);

    socket.on(SOCKET_EVENTS.QUEUE_JOIN, (payload: unknown) => {
      const parsed = queueJoinSchema.safeParse(payload);
      if (!parsed.success || !isGameKey(parsed.data.game)) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: "bad_request", message: "Invalid queue join" });
        return;
      }
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
      const parsed = gameActionSchema.safeParse(payload);
      if (!parsed.success) return;
      matchmaker.getRoom(parsed.data.matchId)?.handleAction(userId, parsed.data.action);
    });

    socket.on(SOCKET_EVENTS.GAME_RESYNC, (payload: unknown) => {
      const parsed = resyncSchema.safeParse(payload);
      if (!parsed.success) return;
      matchmaker.getRoom(parsed.data.matchId)?.resync(userId);
    });

    socket.on(SOCKET_EVENTS.CHAT_SEND, (payload: unknown) => {
      const parsed = chatSendSchema.safeParse(payload);
      if (!parsed.success) return;
      // Guests can't chat (S14); only participants of the named match can post.
      if (claims.role === "GUEST") return;

      const room = matchmaker.getRoom(parsed.data.matchId);
      const seat = room?.seats.find((s) => s.userId === userId);
      if (!room || !seat) return;

      if (!chatRateOk(socket)) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: "chat_rate", message: "Твърде бързо. Изчакай малко." });
        return;
      }

      const text = sanitizeChat(parsed.data.text);
      if (!text) return;

      const msg: ChatMessageMsg = {
        matchId: room.matchId,
        seat: seat.seat,
        displayName: seat.displayName,
        text,
        ts: Date.now(),
      };
      for (const s of room.seats) {
        if (s.userId) io.to(userRoom(s.userId)).emit(SOCKET_EVENTS.CHAT_MESSAGE, msg);
      }
    });

    socket.on("disconnect", () => {
      void matchmaker.leaveAllQueues(userId);
    });
  });

  httpServer.listen(env.REALTIME_PORT, () => {
    logger.info(`🂱 АСО realtime listening on :${env.REALTIME_PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down realtime");
    matchmaker.stop();
    io.close(() => {
      void Promise.allSettled([
        prisma.$disconnect(),
        redis.quit(),
        pubClient.quit(),
        subClient.quit(),
      ]).then(() => process.exit(0));
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
