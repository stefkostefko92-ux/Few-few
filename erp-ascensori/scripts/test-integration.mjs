// Пуска интеграционния слой срещу ИЗОЛИРАНА тестова база и реален сървър.
//   npm run test:int
// Изисква достъпен PostgreSQL (виж TEST_PG_URL). Базата се пресъздава всеки път,
// за да е детерминистично; сървърът се вдига на свободен порт и се спира накрая.

import { spawn, execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.TEST_PORT ?? 3021);
const BASE = `http://127.0.0.1:${PORT}`;
// Административна връзка (за DROP/CREATE DATABASE) и име на тестовата база.
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL ?? "postgresql://erp:erp@127.0.0.1:5433/postgres";
const DB = process.env.TEST_PG_DB ?? "erp_ascensori_test";
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);

const env = {
  ...process.env,
  DATABASE_URL: DB_URL,
  SESSION_SECRET: "integration_test_session_secret_32_chars_min",
  AUDIT_HMAC_KEY: "integration_test_audit_hmac_key_32_chars_min",
  // тестовете правят десетки входа — вдигаме тавана, за да не удрят rate limit-а
  RATE_LIMIT_LOGIN: "10000",
  RATE_LIMIT_REFRESH: "10000",
  NODE_ENV: "production",
};

function psql(sql, url = ADMIN_URL) {
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
}

let server;
async function fermaServer() {
  if (!server || server.killed) return;
  server.kill("SIGTERM");
  await sleep(500);
  if (!server.killed) server.kill("SIGKILL");
}

async function main() {
  console.log(`▸ подготвям тестовата база ${DB}`);
  psql(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  psql(`CREATE DATABASE ${DB}`);

  console.log("▸ схема + демо данни");
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env,
    stdio: "inherit",
  });
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "inherit" });

  console.log("▸ билд");
  execFileSync("npx", ["next", "build"], { env, stdio: "pipe" });

  console.log(`▸ вдигам сървър на ${BASE}`);
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: "pipe" });
  server.stdout.on("data", (b) => process.env.TEST_VERBOSE && process.stdout.write(b));
  server.stderr.on("data", (b) => process.stderr.write(b));

  const scadenza = Date.now() + 60_000;
  for (;;) {
    if (Date.now() > scadenza) throw new Error("сървърът не се вдигна за 60 s");
    try {
      const r = await fetch(`${BASE}/login`);
      if (r.ok) break;
    } catch {
      /* още не слуша */
    }
    await sleep(500);
  }
  console.log("▸ сървърът е готов — пускам тестовете\n");

  const test = spawn(
    "npx",
    ["tsx", "--test", "tests/integration/*.int.test.ts"],
    { env: { ...env, TEST_BASE_URL: BASE }, stdio: "inherit" }
  );
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
  console.error("✗ интеграционният слой се провали:", e.message);
  await fermaServer();
  process.exit(1);
});
