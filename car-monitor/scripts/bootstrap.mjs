#!/usr/bin/env node
// Пробно създаване на Cloudflare ресурсите (D1) за нова среда.
// Аналог на `pnpm bootstrap` в СИГМА. Изисква логнат wrangler.
import { execSync } from "node:child_process";

function tryRun(cmd) {
  try {
    console.log(`$ ${cmd}`);
    execSync(cmd, { stdio: "inherit" });
  } catch {
    console.warn(`Пропуснато (възможно вече съществува): ${cmd}`);
  }
}

tryRun("wrangler d1 create car-monitor");
console.log(
  "\nКопирай database_id-то в apps/web/wrangler.toml и apps/etl/wrangler.toml, после:\n" +
    "  pnpm --filter @car-monitor/web run db:setup",
);
