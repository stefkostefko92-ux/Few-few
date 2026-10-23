"use strict";
// Склад — бекенд. Конфигурацията се проверява преди всичко: без валиден JWT_SECRET процесът не тръгва.
const { PrismaClient } = require("@prisma/client");
const pino = require("pino");
const { loadConfig } = require("./config");
const { createApp } = require("./app");

let config;
try {
  config = loadConfig();
} catch (err) {
  pino().fatal(err.message);
  process.exit(1);
}

const log = pino({ level: config.logLevel, base: { app: "sklad" } });
const prisma = new PrismaClient();
const server = createApp({ prisma, config, log }).listen(config.port, () => log.info({ port: config.port }, "listening"));

function stop() {
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
