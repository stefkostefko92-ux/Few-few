// Входната точка: конфигурация от средата, pino лог, база (ако има), панел, слушане, чисто спиране.
import pino from "pino";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { brevoMailer, type Mailer } from "./mailer.js";
import { gestoreEmail } from "./email/configurazione.js";
import { prismaStore } from "./store/prisma.js";
import { gestoreSessioni } from "./auth/sessione.js";
import { sigillo } from "./auth/seal.js";
import { catalogo } from "./content/catalogo.js";
import { pubblicatore } from "./content/pubblica.js";
import { fixedWindowLimiter } from "./rate-limit.js";
import { pulizia } from "./manutenzione.js";
import type { AdminDeps } from "./admin/deps.js";
import { servizioDocumenti } from "./documenti/servizio.js";
import { archivio } from "./documenti/archivio.js";
import { CATALOGO } from "./documenti/condiviso/catalogo/index.js";
import { avviaEliminazioni, registroEliminazioni } from "./eliminazioni.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = pino({ level: cfg.LOG_LEVEL, base: { app: "liftcon" }, redact: ["req.headers", "email", "nome", "telefono", "messaggio", "password"] });
  const envMailer: Mailer =
    cfg.BREVO_API_KEY && cfg.MAIL_FROM && cfg.MAIL_TO
      ? brevoMailer({ apiKey: cfg.BREVO_API_KEY, from: { email: cfg.MAIL_FROM, name: cfg.MAIL_FROM_NAME }, to: cfg.MAIL_TO })
      : {
          send: () => Promise.reject(new Error("Email non configurata")),
        };
  let mailer: Mailer = envMailer;

  let admin: AdminDeps | undefined;
  let store: ReturnType<typeof prismaStore> | undefined;
  if (cfg.DATABASE_URL && cfg.JWT_SECRET && cfg.SEAL_KEY) {
    store = prismaStore();
    const seal = sigillo(cfg.SEAL_KEY);
    const email = gestoreEmail({ store, sigillo: seal, env: { apiKey: cfg.BREVO_API_KEY, mittente: cfg.MAIL_FROM, nomeMittente: cfg.MAIL_FROM_NAME, destinatario: cfg.MAIL_TO } });
    mailer = email.mailer();
    const cat = catalogo(store, cfg.CONTENT_DEFAULTS);
    const pub = pubblicatore({ store, catalogo: cat, siteSrc: cfg.SITE_SRC, siteDir: cfg.SITE_DIR, siteUrl: cfg.ALLOWED_ORIGIN });
    const arch = archivio(cfg.DATA_DIR);
    // Изтритото не се връща с възстановен бекъп: списъкът се прилага пак, преди да приемем заявки (D16а).
    // Папката не се чете/пише или списъкът е изгубен → старт не става (fail closed), деплоят се връща.
    const eliminazioni = registroEliminazioni(cfg.ELIMINAZIONI_DIR);
    const { scartate, ...riapplicate } = await avviaEliminazioni({ store, archivio: arch, registro: eliminazioni });
    logger.info({ event: "eliminazioni_riapplicate", ...riapplicate, scartate });
    if (scartate) logger.error({ event: "eliminazioni_righe_scartate", scartate, file: `${cfg.ELIMINAZIONI_DIR}/eliminazioni.jsonl` });
    if (riapplicate.documenti || riapplicate.richieste || riapplicate.foto) {
      await store.eventi.registra({ utenteId: null, azione: "eliminazioni.riapplicate", oggetto: null, dettagli: riapplicate, ipHmac: null });
    }
    admin = {
      store,
      sessioni: gestoreSessioni({ store, jwtSecret: cfg.JWT_SECRET, produzione: cfg.NODE_ENV === "production" }),
      sigillo: seal,
      email,
      catalogo: cat,
      pubblicatore: pub,
      logger,
      origine: cfg.ALLOWED_ORIGIN,
      limiteAccesso: fixedWindowLimiter(10, 15 * 60_000),
      now: () => Date.now(),
      siteDir: cfg.SITE_DIR,
      documenti: servizioDocumenti({ store, archivio: arch, catalogo: CATALOGO, now: () => Date.now() }),
      eliminazioni,
    };
    if ((await store.utenti.conta()) === 0) logger.warn({ event: "avvio", admin: "nessun utente: lo crea deploy.sh (oppure deploy.sh --admin)" });
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
