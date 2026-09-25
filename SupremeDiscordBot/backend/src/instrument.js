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
    beforeSend(event) {
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
