import { pino } from "pino";
import { env } from "./env.js";

/**
 * Structured logging (pino). Never log PII / secrets / cards (S14).
 * Pretty transport only in dev; JSON in prod.
 */
export const logger = pino({
  level: env.isProd ? "info" : "debug",
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.passwordHash"],
    remove: true,
  },
  transport: env.isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
      },
});
