// backend/src/routes/status.js
// Public, unauthenticated status endpoint + simple uptime checks.
// Checks: postgres, redis, bot-api reachability.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import axios from "axios";

const router = Router();

// Cache for 30s — status checks are cheap but we don't want to hammer services
let cache = { data: null, expiresAt: 0 };

/**
 * Сглобява състоянието на всички компоненти (или връща кеша, ако е свеж).
 *
 * ЗАЩО е функция (самопроверка, 07.08.2026): `/probe` беше добавен, за да даде
 * състоянието като HTTP КОД за външна проба. Но при СТУДЕН кеш той падаше на
 * собствена, по-слаба проверка — само `SELECT 1` — и връщаше 200, макар Redis
 * или ботът да са паднали. Проба, която лъже, е по-лоша от липсваща: това е
 * точно fail-open поведението, което гоним навсякъде другаде. Сега двата
 * маршрута смятат едно и също нещо.
 */
async function computeStatus() {
  if (cache.data && cache.expiresAt > Date.now()) return cache.data;

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
          // AUTH ПРЕДИ PING, ако адресът носи парола.
          //
          // ДЕФЕКТЪТ (реален деплой, 07.08.2026): проверката пращаше гол PING.
          // Откакто Redis върви с `--requirepass` (v40), сървърът отговаря
          // `-NOAUTH Authentication required` и проверката обявяваше ЗДРАВ Redis
          // за паднал. Самото приложение се свързва вярно — паролата е в
          // `REDIS_URL` — тоест това беше чиста фалшива тревога, и то от вида,
          // който после вдига аларма всяка минута, докато някой спре да ѝ вярва.
          //
          // RESP inline команди: `AUTH [user] pass`. Redis 6+ приема и двете
          // форми; без потребител се праща само паролата.
          const pass = url.password ? decodeURIComponent(url.password) : "";
          const user = url.username ? decodeURIComponent(url.username) : "";
          const wantsAuth = !!pass;
          if (wantsAuth) {
            sock.write(user ? `AUTH ${user} ${pass}\r\n` : `AUTH ${pass}\r\n`);
          }
          sock.write("PING\r\n");

          // При AUTH отговорите са ДВА (+OK, после +PONG) и могат да дойдат в
          // един пакет или в два — затова трупаме, вместо да четем веднъж.
          let buf = "";
          const onData = (chunk) => {
            buf += chunk.toString();
            if (buf.includes("+PONG")) { sock.end(); return resolve(); }
            // Грешка от Redis започва с `-` (напр. `-ERR invalid password`).
            if (buf.startsWith("-") || buf.includes("\r\n-")) {
              sock.end();
              return reject(new Error("unexpected response: " + buf.trim()));
            }
          };
          sock.on("data", onData);
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
  return results;
}

router.get("/", async (_req, res) => {
  res.json(await computeStatus());
});

// ─── GET /api/status/probe ───────────────────────────────────────────────────
// Същата преценка като `/api/status`, изразена като HTTP КОД, не като поле.
//
// ЗАЩО отделен маршрут (Наблюдателят, одит 07.08.2026): `/api/status` връща 200
// винаги — състоянието живее само в тялото. Външна проба по подразбиране гледа
// кода, значи „degraded" изглежда точно като „operational" и никой не разбира,
// докато клиент не се обади. Кодът на `/api/status` обаче НЕ бива да се сменя:
// страницата за състоянието го чете през axios, а 503 там я праща в грешка
// вместо да покаже точно каква е повредата — тоест поправката би счупила
// единствения екран, чиято работа е да показва повреди.
//
// Тялото е празно нарочно: това е сигнал за машина, не за човек. За подробности
// пробата да сочи `/api/status`.
//
// Различен от `/api/health`: той е LIVENESS на този контейнер (жива ли е базата
// ми — по него docker решава дали да ме рестартира). Пробата е за СИСТЕМАТА:
// база + Redis + Discord gateway на бота. Паднал бот не бива да рестартира
// backend-а, но трябва да вдигне аларма.
router.get("/probe", async (_req, res) => {
  try {
    const { status } = await computeStatus();
    res.status(status === "operational" ? 200 : 503).end();
  } catch {
    // Самото сглобяване се провали → не знаем нищо → fail-closed.
    res.status(503).end();
  }
});

export default router;
