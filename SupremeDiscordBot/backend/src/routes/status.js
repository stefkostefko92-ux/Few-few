// backend/src/routes/status.js
// Public, unauthenticated status endpoint + simple uptime checks.
// Checks: postgres, redis, bot-api reachability.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import axios from "axios";

const router = Router();

// Cache for 30s — status checks are cheap but we don't want to hammer services
let cache = { data: null, expiresAt: 0 };

router.get("/", async (_req, res) => {
  if (cache.data && cache.expiresAt > Date.now()) {
    return res.json(cache.data);
  }

  const results = {
    status: "operational",
    timestamp: new Date().toISOString(),
    services: {
      // Самият API отговаря на тази заявка — значи работи. Досега този ключ
      // липсваше и dashboard-ът показваше „API — Unknown“ до три зелени реда,
      // което изглежда като авария, а е просто непопълнено поле.
      api: { status: "operational", uptime: Math.round(process.uptime()) },
    },
    uptime: process.uptime(),
  };

  // Postgres
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    results.services.database = {
      status: "operational",
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    // Не връщай сурово err.message навън (може да съдържа host/port на инфраструктурата).
    console.error("[status] database check failed:", err.message);
    results.services.database = { status: "down" };
    results.status = "degraded";
  }

  // Bot API
  try {
    const start = Date.now();
    // `validateStatus: () => true` караше axios да НЕ хвърля при 503, а после
    // безусловно обявявахме бота за „operational". Ботът връща 503 точно когато
    // gateway-ът е паднал — тоест публичната страница за състояние показваше
    // зелено, докато нищо не работи. (Наблюдателят, 07.08.2026)
    const r = await axios.get(`${process.env.BOT_API_URL || "http://bot:3001"}/health`, {
      timeout: 3000,
      validateStatus: () => true,
    });
    const healthy = r.status >= 200 && r.status < 300 && r.data?.gateway !== "disconnected";
    results.services.bot = {
      status: healthy ? "operational" : "degraded",
      latencyMs: Date.now() - start,
      ...(healthy ? {} : { detail: r.data?.gateway || `HTTP ${r.status}` }),
    };
    if (!healthy) results.status = "degraded";
  } catch (err) {
    results.services.bot = { status: "down", error: "unreachable" };
    results.status = "degraded";
  }

  // Redis — TCP-level ping without dependency on redis client library
  if (process.env.REDIS_URL) {
    try {
      const net = await import("net");
      const url = new URL(process.env.REDIS_URL);
      const start = Date.now();
      await new Promise((resolve, reject) => {
        const sock = net.createConnection({
          host: url.hostname,
          port: Number(url.port) || 6379,
          timeout: 2000,
        });
        sock.once("connect", () => {
          // Send PING, expect +PONG back
          sock.write("PING\r\n");
          sock.once("data", (buf) => {
            sock.end();
            if (buf.toString().startsWith("+PONG")) resolve();
            else reject(new Error("unexpected response: " + buf.toString()));
          });
        });
        sock.once("error", reject);
        sock.once("timeout", () => { sock.destroy(); reject(new Error("timeout")); });
      });
      results.services.cache = {
        status: "operational",
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      // Не връщай сурово err.message навън (host/port на Redis).
      console.error("[status] cache check failed:", err.message);
      results.services.cache = { status: "down" };
      results.status = "degraded";
    }
  } else {
    results.services.cache = { status: "unknown", note: "REDIS_URL not configured" };
  }

  // Get recent metrics for "servers monitored" display
  try {
    const totalServers = await prisma.server.count();
    const activeToday = await prisma.ticket.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      distinct: ["serverId"],
      select: { serverId: true },
    });
    results.stats = {
      totalServers,
      activeServers24h: activeToday.length,
    };
  } catch { /* silent */ }

  cache = { data: results, expiresAt: Date.now() + 30 * 1000 };
  res.json(results);
});

export default router;
