// backend/src/index.js
import "dotenv/config";
// Sentry.init runs inside instrument.js, imported FIRST so OpenTelemetry
// auto-instrumentation patches express/pg/prisma before they are imported below.
import "./instrument.js";
import * as Sentry from "@sentry/node";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import { redisStore } from "./lib/rateLimitStore.js";

// ─── Startup validation ───────────────────────────────────────────────────────
const REQUIRED_ENV = ["DATABASE_URL", "SESSION_SECRET", "ENCRYPTION_KEY", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI", "MAIN_OWNER_ID", "API_SECRET", "FRONTEND_URL"];

// FRONTEND_URL с вътрешния порт (напр. :8080, който е 127.0.0.1-only зад
// reverse proxy-то) прави ВСИЧКИ редиректи и линкове мъртви за външен клиент:
// OAuth callback-ът праща браузъра на :8080 → нищо не зарежда, а относителните
// линкове (футър и т.н.) наследяват порта. Не е фатално за старта (dev ползва
// localhost:5173), но в продукция е винаги грешка → крещим силно в лога.
if (process.env.NODE_ENV === "production" && /:\d+\/?$/.test(process.env.FRONTEND_URL || "")) {
  console.error(
    `⚠️  FRONTEND_URL (${process.env.FRONTEND_URL}) съдържа порт — в продукция това чупи ` +
    "OAuth редиректите и линковете (порт 8080 е достъпен само от 127.0.0.1). " +
    "Задай FRONTEND_URL=https://supremebot.carbonstealth.eu (без порт) и рестартирай."
  );
}

// NODE_ENV не е в REQUIRED_ENV (dev легитимно върви без него), но cookie.secure,
// HSTS и morgan форматът зависят от NODE_ENV === "production". Забравен NODE_ENV
// при жив публичен https деплой тихо изключва Secure-cookie и HSTS — сесийната
// cookie тръгва по чист HTTP. Ако видим признаци на продукция (публичен https
// FRONTEND_URL без порт, не localhost), а NODE_ENV не е production → крещим.
{
  const fe = process.env.FRONTEND_URL || "";
  const looksProd = /^https:\/\//.test(fe) && !/localhost|127\.0\.0\.1/.test(fe) && !/:\d+\/?$/.test(fe);
  if (looksProd && process.env.NODE_ENV !== "production") {
    console.error(
      `⚠️  NODE_ENV=${process.env.NODE_ENV || "(unset)"} при публичен FRONTEND_URL (${fe}). ` +
      "Secure-cookie и HSTS се задействат САМО при NODE_ENV=production — иначе " +
      "сесийната cookie пътува без Secure флаг. Задай NODE_ENV=production и рестартирай."
    );
  }
}
// Optional — AI replies work without this but require it for the platform-level key
if (!process.env.GEMINI_API_KEY) console.warn("⚠️  GEMINI_API_KEY not set — AI auto-replies will be disabled unless servers provide their own key");
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

// Живият Stripe с непълна карта на цените е по-опасен от изключен Stripe:
// checkout за конфигурираните тарифи работи, но webhook-ът не разпознава цената
// и пада на резервния клон „premium“ — клиент плаща Agency 10 и получава
// Premium. Парите влизат, правата са грешни, нищо не гърми. Крещим при старт.
// (VPS-аджията, одит 07.08.2026)
if (process.env.STRIPE_SECRET_KEY) {
  const { missingStripePrices } = await import("./lib/premium.js");
  const gaps = missingStripePrices();
  if (gaps.length) {
    console.error(
      `❌ Stripe е активен, но ${gaps.length} цени липсват: ${gaps.join(", ")}. ` +
      "Плащане по такава тарифа ще даде ГРЕШЕН план. Пусни scripts/stripe-setup.sh " +
      "и попълни стойностите от изхода му."
    );
  }
}

import authRouter from "./routes/auth.js";
import serversRouter from "./routes/servers.js";
import panelsRouter from "./routes/panels.js";
import formsRouter from "./routes/forms.js";
import ticketsRouter from "./routes/tickets.js";
import applicationsRouter from "./routes/applications.js";
import adminRouter from "./routes/admin.js";
import stripeRouter from "./routes/stripe.js";
import agencyRouter from "./routes/agency.js";
import discordEntitlementsRouter from "./routes/discordEntitlements.js";
import topggRouter from "./routes/topgg.js";
import botRouter from "./routes/bot.js";
import exportRouter from "./routes/export.js";
import verificationRouter from "./routes/verification.js";
import botV18Router from "./routes/bot_v18.js";
import webhooksRouter from "./routes/webhooks.js";
import automationRouter from "./routes/automation.js";
import trialRouter from "./routes/trial.js";
import analyticsRouter from "./routes/analytics.js";
import statusRouter from "./routes/status.js";
import publicApiRouter, { apiKeyManagementRouter } from "./routes/publicApi.js";
import archiveRouter from "./routes/archive.js";
import v1Router from "./routes/v1.js";
import gdprRouter from "./routes/gdpr.js";
import kbRouter from "./routes/kb.js";
import cannedRouter from "./routes/canned.js";
import reactionRolesRouter from "./routes/reactionroles.js";
import "./services/scheduler.js"; // Start background jobs
import { prisma } from "./lib/prisma.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the reverse-proxy chain — production has TWO hops in front of Express
// (host nginx/Caddy → frontend-container nginx → backend). Trusting only 1 hop
// would make every client share the docker-gateway IP, so the 20/15min auth
// limiter would rate-limit ALL logins globally. "loopback" + "uniquelocal"
// trusts local/private-range proxies regardless of exact hop count.
app.set("trust proxy", ["loopback", "uniquelocal"]);

// ─── Middleware ────────────────────────────────────────────────────────────────

// Helmet with production-grade security headers.
// CSP is relaxed for the API (it doesn't serve HTML, only JSON).
// HSTS is enforced in production only.
app.use(
  helmet({
    contentSecurityPolicy: false, // API doesn't serve HTML; frontend nginx sets its own CSP
    crossOriginEmbedderPolicy: false,
    hsts: process.env.NODE_ENV === "production" ? {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true, // HSTS preload list eligibility per standard 4
    } : false,
  })
);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Stripe webhooks need raw body — mount BEFORE express.json()
app.use(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req, _res, next) => {
    req.rawBody = req.body;
    next();
  }
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: "express_sessions",
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 60, // prune expired sessions every hour (seconds)
    }),
    name: "sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax", // "lax" works correctly with OAuth redirects; "strict" breaks them
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);


// ─── Rate Limiting ─────────────────────────────────────────────────────────────
// Global limiter: 200 req/min per IP for all API routes
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  store: redisStore("rl:global"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down" },
  // Never limit health checks; never throttle the Stripe webhook — it is
  // signature-verified + idempotent, and 429s would make Stripe retry (a burst
  // of events from few egress IPs could otherwise trip the per-IP limit).
  // ВНИМАНИЕ: лимитерът е монтиран с app.use("/api", …), затова `req.path` е
  // ОТНОСИТЕЛЕН на mount точката ("/stripe/webhook"), не пълният път. Условието
  // по-долу дълго време сравняваше с "/api/stripe/webhook" и НИКОГА не съвпадаше
  // — тоест инвариантът „webhook-ът е извън лимитера“ беше записан, но не
  // изпълнен. Ползваме originalUrl (без query частта), който е абсолютен.
  // Проверено с изпълнен express експеримент (Продавача, 07.08.2026).
  skip: (req) => {
    const path = (req.originalUrl || "").split("?")[0];
    return path === "/api/health" || path === "/api/stripe/webhook";
  },
});

// Stricter limiter for auth endpoints to prevent brute force / OAuth abuse
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  store: redisStore("rl:auth"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts — please try again in 15 minutes" },
});

// Strict limiter for bot-internal endpoints (should only be called by 1 bot process)
const botLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600, // 10/s — generous for message logging
  store: redisStore("rl:bot"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Bot endpoint rate limit exceeded" },
});

// Публичният архив на транскрипти. Той е ИЗВЪН /api, значи глобалният лимитер
// изобщо не го покриваше — единственият напълно неавтентикиран маршрут, който
// чете от базата и при липсващ транскрипт го ГЕНЕРИРА наново (скъпо: всички
// съобщения на тикета + сглобяване на HTML). Токенът пази съдържанието, но не
// пази ресурса: познат линк, пуснат в цикъл, е безплатен товар върху базата.
const archiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  store: redisStore("rl:archive"),
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests — please slow down",
});

app.use("/api", globalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/bot", botLimiter);
app.use("/archive", archiveLimiter);

// ─── Health check MUST come before any auth-protected routers ──────────────
app.get("/api/health", async (_req, res) => {
  // Статично `{status:"ok"}` значеше, че контейнерът се обявява за здрав при
  // МЪРТВА база — Docker никога не го рестартира, а всяка заявка се проваля.
  // Liveness трябва да отразява реалната зависимост, не факта, че Express слуша.
  // (Наблюдателят, 07.08.2026)
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "up", uptime: process.uptime() });
  } catch (err) {
    console.error("[health] базата е недостъпна:", err?.message);
    res.status(503).json({ status: "degraded", database: "down", uptime: process.uptime() });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/api/auth", authRouter);
app.use("/api/status", statusRouter);         // v2.1 Public status page (no auth) — MUST come before /api catch-alls
app.use("/api/servers", serversRouter);
app.use("/api/panels", panelsRouter);
app.use("/api/forms", formsRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/stripe", stripeRouter);
app.use("/api/agency", agencyRouter);         // v3.0 Agency (multi-server) billing + seat management
app.use("/api/discord", discordEntitlementsRouter); // v3.0 Native Discord monetization (entitlement events from the bot)
app.use("/api/topgg", topggRouter);           // top.gg vote webhook (secret-gated) + публичен брояч
app.use("/api/bot", botRouter); // Internal bot <-> API communication
app.use("/api/export", exportRouter);
app.use("/api/verification", verificationRouter);
app.use("/api/bot", botV18Router);           // v1.8 polls/giveaways/sticky/schedule bot endpoints
app.use("/api/automation", automationRouter); // v1.8 dashboard CRUD for polls/giveaways/sticky/scheduled + commands catalog
app.use("/api/trial", trialRouter);           // v2.0 Premium trial system
app.use("/api/analytics", analyticsRouter);   // v2.1 Heatmap, leaderboard, funnel
app.use("/api/apikeys", apiKeyManagementRouter); // v2.1 API key CRUD (dashboard-authed)
app.use("/api/kb", kbRouter);                 // v3.1 Knowledge base CRUD (dashboard-authed)
app.use("/api/reactionroles", reactionRolesRouter); // v3.2 Reaction roles CRUD + spawn (dashboard-authed)
app.use("/public/v1", publicApiRouter);       // v2.1 Public REST API (bearer token)
app.use("/archive", archiveRouter);           // v2.1 Public ticket transcript viewer
// apikeys.js (файлът-примамка) е ИЗТРИТ на 09.08.2026: немонтиран, но с втори
// дрейфнал списък scope-ове, от който v1.js внасяше requireApiKey — направи
// /api/v1/server вечно 403 и подлъга и одитори. Едното определение живее в
// lib/apiKeyAuth.js.
app.use("/api/canned", cannedRouter);        // v29 табло за готовите отговори (одит 09.08.2026)
app.use("/api/v1", v1Router);                 // v2.1 Public API (bearer-authed)
app.use("/api/gdpr", gdprRouter);             // GDPR Articles 15, 17, 20 + DSA abuse reports

// ── webhooksRouter е ПОСЛЕДЕН, и това е СЪЩЕСТВЕНО ──────────────────────────
// Той се монтира на ГОЛ "/api" (маршрутите му са с форма /api/:serverId/webhooks,
// /api/events, /api/:serverId/panels/:panelId/duplicate), а вътре има
// router.use(requireAuth, loadUser). В Express 4 това middleware се изпълнява за
// ВСЯКА заявка под /api, която стигне дотук — БЕЗ значение дали някой негов
// маршрут съвпада.
//
// Досега стоеше по средата на списъка, затова всичко монтирано СЛЕД него минаваше
// първо през сесийната автентикация. За session-authed рутери това беше само
// двойна работа, но /api/v1 е BEARER-authed (API ключ, не сесия) → requireAuth
// го отрязваше с 401, преди v1Router изобщо да бъде достигнат.
// Тоест ЦЯЛОТО публично REST API — платена Premium функция — беше мъртво.
// (Кодаджията, 07.08.2026; доказано с изпълнен Express репро)
//
// Ако добавяш нов рутер под /api, добави го НАД този ред.
app.use("/api", webhooksRouter);

// ─── Error handler ────────────────────────────────────────────────────────────

// Sentry must capture errors before the response is sent
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use((err, req, res, _next) => {
  // `err.message` НЕ отива при клиента. Prisma слага в съобщението пълния път
  // до файла, ОКОЛНИТЕ РЕДОВЕ ИЗХОДЕН КОД и самата заявка — тоест невалидна
  // дата в query параметър връщаше на всеки любопитен наш сорс и вътрешната ни
  // схема. `errorFormat` по подразбиране носи сниппета и в production.
  // (Разбивача, 07.08.2026 — доказано с PoC)
  //
  // Клиентът получава общо съобщение + идентификатор, с който да намерим точния
  // случай в логовете. 4xx-ите, които сами си слагат `status` и `expose`,
  // остават четими — те са предвидени съобщения, не изтекли вътрешности.
  const status = err.status || 500;
  const id = Math.random().toString(36).slice(2, 10);
  console.error(`[err ${id}] ${req.method} ${req.originalUrl}`, err);
  if (status < 500 && err.expose !== false && err.message) {
    return res.status(status).json({ error: err.message, errorId: id });
  }
  res.status(status).json({ error: "Internal Server Error", errorId: id });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Backend API running on http://localhost:${PORT}`);
  // ГДПР ретенцията и дунингът се планират от services/scheduler.js (job()
  // обвивка: lock + Sentry + пулс + CRON_TZ) — одит 09.08.2026.
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on("SIGTERM", () => {
  console.log("SIGTERM received — shutting down gracefully");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
