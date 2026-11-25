"use strict";
// Настройките от средата. Процесът не тръгва без ключ за сесиите: старите стойности по подразбиране
// („dev-secret“ в кода и тази в docker-compose.yml) бяха публични и са по-къси от 32 знака.
const { z } = require("zod");

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string({ error: "DATABASE_URL липсва" }).min(1, "DATABASE_URL липсва"),
  JWT_SECRET: z
    .string({ error: "JWT_SECRET липсва" })
    .min(32, "JWT_SECRET трябва да е поне 32 знака (openssl rand -hex 32)"),
  // Колко обратни прокси има пред приложението (nginx на хоста + nginx в контейнера = 2): само така req.ip е
  // адресът на клиента, а не на проксито, и ограничението на опитите за вход работи по човек.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

function loadConfig(env = process.env) {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const why = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Невалидна конфигурация — ${why}`);
  }
  const c = parsed.data;
  return {
    env: c.NODE_ENV,
    port: c.PORT,
    jwtSecret: c.JWT_SECRET,
    trustProxy: c.TRUST_PROXY,
    secureCookies: c.NODE_ENV === "production",
    logLevel: c.LOG_LEVEL,
  };
}

module.exports = { loadConfig };
