// Пуска E2E пакета срещу ИЗОЛИРАНА база и реален билд.
//   npm run test:e2e
//
// Отделен от `test:int` по две причини: браузърът е бавен и не бива да се плаща
// на всяко пускане, а базата тук се пълни от сийда и се пипа от потоците — не
// бива да се смесва с интеграционната.

import { spawn, execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.E2E_PORT ?? 3022);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ??
  "postgresql://erp:erp@127.0.0.1:5433/postgres";
const DB = process.env.E2E_PG_DB ?? "erp_ascensori_e2e_test";
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);

const env = {
  ...process.env,
  DATABASE_URL: DB_URL,
  SESSION_SECRET: "e2e_test_session_secret_32_chars_minimum",
  AUDIT_HMAC_KEY: "e2e_test_audit_hmac_key_32_chars_minimum",
  HEALTH_TOKEN: "e2e_test_health_token",
  APP_URL: BASE,
  RATE_LIMIT_LOGIN: "10000",
  RATE_LIMIT_REFRESH: "10000",
  NODE_ENV: "production",
  E2E_PORT: String(PORT),
};

// Същият предпазител като при интеграционния пакет: една сгрешена променлива и
// работната база изчезва безвъзвратно.
if (!/_test$/.test(DB)) {
  console.error(`✗ E2E_PG_DB трябва да завършва на "_test" (получено: ${DB})`);
  process.exit(1);
}

function psql(sql, url = ADMIN_URL) {
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    stdio: "pipe",
  });
}

let server;
async function fermaServer() {
  if (!server || server.exitCode !== null) return;
  const fine = new Promise((res) => server.once("close", res));
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
  await Promise.race([fine, sleep(5000)]);
  if (server.exitCode === null) {
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
    await Promise.race([fine, sleep(2000)]);
  }
}

async function main() {
  console.log(`▸ подготвям базата ${DB}`);
  psql(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  psql(`CREATE DATABASE ${DB}`);

  console.log("▸ схема (миграции) + демо данни");
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env,
    stdio: "inherit",
  });
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "inherit" });

  console.log("▸ билд");
  execFileSync("npx", ["next", "build"], { env, stdio: "pipe" });

  console.log(`▸ вдигам сървър на ${BASE}`);
  server = spawn(
    "node",
    ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    {
      env,
      stdio: "pipe",
      detached: true,
    },
  );
  server.stdout.on(
    "data",
    (b) => process.env.TEST_VERBOSE && process.stdout.write(b),
  );
  server.stderr.on("data", (b) => process.stderr.write(b));

  const scadenza = Date.now() + 60_000;
  for (;;) {
    if (Date.now() > scadenza) throw new Error("сървърът не се вдигна за 60 s");
    try {
      if ((await fetch(`${BASE}/login`)).ok) break;
    } catch {
      /* още не слуша */
    }
    await sleep(500);
  }
  console.log("▸ сървърът е готов — пускам браузъра\n");

  const argomenti = ["playwright", "test", ...process.argv.slice(2)];
  const test = spawn("npx", argomenti, {
    env: { ...env, E2E_BASE_URL: BASE },
    stdio: "inherit",
  });
  const codice = await new Promise((res) => test.on("close", res));

  await fermaServer();
  psql(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  process.exit(codice ?? 1);
}

for (const segnale of ["SIGINT", "SIGTERM"]) {
  process.on(segnale, async () => {
    await fermaServer();
    process.exit(130);
  });
}

main().catch(async (e) => {
  console.error("✗ E2E пакетът се провали:", e.message);
  await fermaServer();
  process.exit(1);
});
