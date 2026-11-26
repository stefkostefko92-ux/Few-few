// Входната точка: конфигурация от средата, pino лог, база (ако има), панел, слушане, чисто спиране.
import pino from "pino";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { brevoMailer } from "./mailer.js";
import { prismaStore } from "./store/prisma.js";
import { gestoreSessioni } from "./auth/sessione.js";
import { sigillo } from "./auth/seal.js";
import { catalogo } from "./content/catalogo.js";
import { pubblicatore } from "./content/pubblica.js";
import { fixedWindowLimiter } from "./rate-limit.js";
import { pulizia, primoMaster } from "./manutenzione.js";
import type { AdminDeps } from "./admin/deps.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = pino({ level: cfg.LOG_LEVEL, base: { app: "liftcon" }, redact: ["req.headers", "email", "nome", "telefono", "messaggio", "password"] });
  const mailer = brevoMailer({ apiKey: cfg.BREVO_API_KEY, from: { email: cfg.MAIL_FROM, name: cfg.MAIL_FROM_NAME }, to: cfg.MAIL_TO });

  let admin: AdminDeps | undefined;
  let store: ReturnType<typeof prismaStore> | undefined;
  if (cfg.DATABASE_URL && cfg.JWT_SECRET && cfg.SEAL_KEY) {
    store = prismaStore();
    const cat = catalogo(store, cfg.CONTENT_DEFAULTS);
    const pub = pubblicatore({ store, catalogo: cat, siteSrc: cfg.SITE_SRC, siteDir: cfg.SITE_DIR, siteUrl: cfg.ALLOWED_ORIGIN });
    admin = {
      store,
      sessioni: gestoreSessioni({ store, jwtSecret: cfg.JWT_SECRET, produzione: cfg.NODE_ENV === "production" }),
      sigillo: sigillo(cfg.SEAL_KEY),
      catalogo: cat,
      pubblicatore: pub,
      logger,
      origine: cfg.ALLOWED_ORIGIN,
      limiteAccesso: fixedWindowLimiter(10, 15 * 60_000),
      now: () => Date.now(),
      siteDir: cfg.SITE_DIR,
    };
    await primoMaster(store, logger, { email: cfg.ADMIN_EMAIL, nome: cfg.ADMIN_NAME, password: cfg.ADMIN_INITIAL_PASSWORD });
    const giro = () => void pulizia(store!, logger).catch((err: unknown) => logger.error({ event: "pulizia", err: err instanceof Error ? err.message : "?" }));
    giro();
    setInterval(giro, 6 * 60 * 60_000).unref();
  } else logger.warn({ event: "avvio", modalita: "solo modulo → email (senza DATABASE_URL non c'è /admin)" });

  const app = createApp({ logger, allowedOrigin: cfg.ALLOWED_ORIGIN, mailer, baseUrl: cfg.ALLOWED_ORIGIN, ...(store ? { store } : {}), ...(admin ? { admin } : {}) });
  const server = app.listen(cfg.PORT, cfg.HOST, () => logger.info({ event: "avvio", host: cfg.HOST, port: cfg.PORT, admin: Boolean(admin) }));

  // Деплоят не губи промените от панела: при старт сайтът се публикува веднъж с тях (спецификация т. 16).
  if (admin) {
    const esito = await admin.pubblicatore.pubblica(null);
    logger[esito.ok ? "info" : "error"]({ event: "pubblicazione_avvio", ok: esito.ok, versione: esito.versione, errore: esito.errore?.slice(0, 300) });
  }

  const stop = (signal: string) => {
    logger.info({ event: "arresto", signal });
    server.close(() => void (store ? store.close() : Promise.resolve()).finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
