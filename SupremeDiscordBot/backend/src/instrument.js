// backend/src/instrument.js
// Sentry.init MUST run before any instrumented library (express, pg, @prisma/client…)
// is imported, otherwise @sentry/node's OpenTelemetry auto-instrumentation cannot
// patch them and distributed tracing (tracesSampleRate) never attaches.
// This module is imported FIRST in index.js — in ESM the first import's module
// graph is fully evaluated before the next import runs, which gives us that
// ordering without changing the start command. Error capture works either way;
// this is what makes tracing/spans work too.
import "dotenv/config";
import * as Sentry from "@sentry/node";

const stripQuery = (u) => (typeof u === "string" ? u.split("?")[0] : u);
/** Маха query и IP от събитие/транзакция (адреси, http.* атрибути, хлебни трохи). */
export function scrubEvent(event) {
  if (!event) return event;
  if (event.request) {
    event.request.url = stripQuery(event.request.url);
    delete event.request.query_string;
    if (event.request.env) delete event.request.env.REMOTE_ADDR;
  }
  if (event.transaction) event.transaction = stripQuery(event.transaction);
  const scrubData = (d) => {
    if (!d || typeof d !== "object") return;
    for (const k of Object.keys(d)) {
      if (/client_ip|client\.address|net\.peer\.ip|user_agent\.original/i.test(k)) delete d[k];
      else if (/(^|\.)(url|target|route|query)$|http\.url|url\.full|url\.query/i.test(k) && typeof d[k] === "string") d[k] = stripQuery(d[k]).replace(/\?.*$/, "");
    }
  };
  scrubData(event.contexts?.trace?.data);
  for (const s of event.spans || []) { scrubData(s.data); if (s.description) s.description = stripQuery(s.description); }
  for (const b of event.breadcrumbs || []) { if (b.data?.url) b.data.url = stripQuery(b.data.url); }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  return event;
}

// Optional: set SENTRY_DSN to enable production error tracking + tracing.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1, // 10% of requests traced for performance monitoring
    sendDefaultPii: false,
    // ROPA дейност 9 обещава: тайни и съдържание на съобщения НЕ стигат до
    // Sentry (САЩ). Без този филтър обещанието не се налагаше от нищо (одит на
    // Правния Разбирач 25.09.2026): тялото на заявката, бисквитките и
    // заглавките с идентификация се махат преди изпращане.
    // Транзакциите (трасирането) НЕ минават през beforeSend: адресът носеше
    // архивния токен (`?t=` — пълен достъп до транскрипта), а атрибутите —
    // IP адреса на клиента (Кодаджията, 10.10.2026). Тук се режат query частта и IP.
    beforeSendTransaction(event) {
      return scrubEvent(event);
    },
    beforeSend(event) {
      scrubEvent(event);
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        const h = event.request.headers || {};
        for (const k of Object.keys(h)) if (/^(authorization|cookie|x-bot-secret|x-api-key|x-signature.*)$/i.test(k)) delete h[k];
      }
      if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
      return event;
    },
  });
  console.log("✅ Sentry error monitoring active");
}
