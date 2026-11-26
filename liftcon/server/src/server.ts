// Входната точка: конфигурация от средата, pino лог, слушане само на HOST:PORT, чисто спиране при SIGTERM.
import pino from "pino";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { brevoMailer } from "./mailer.js";

function main(): void {
  const cfg = loadConfig();
  const logger = pino({ level: cfg.LOG_LEVEL, base: { app: "liftcon" }, redact: ["req.headers", "email", "nome", "telefono", "messaggio"] });
  const app = createApp({
    logger,
    allowedOrigin: cfg.ALLOWED_ORIGIN,
    mailer: brevoMailer({ apiKey: cfg.BREVO_API_KEY, from: { email: cfg.MAIL_FROM, name: cfg.MAIL_FROM_NAME }, to: cfg.MAIL_TO }),
  });
  const server = app.listen(cfg.PORT, cfg.HOST, () => logger.info({ event: "avvio", host: cfg.HOST, port: cfg.PORT }));
  const stop = (signal: string) => {
    logger.info({ event: "arresto", signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
