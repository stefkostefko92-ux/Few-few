// Пуска интеграционния слой срещу ИЗОЛИРАНА тестова база и реален сървър.
//   npm run test:int
// Изисква достъпен PostgreSQL (виж TEST_PG_URL). Базата се пресъздава всеки път,
// за да е детерминистично; сървърът се вдига на свободен порт и се спира накрая.

import { spawn, execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.env.TEST_PORT ?? 3021);
const BASE = `http://127.0.0.1:${PORT}`;
// Административна връзка (за DROP/CREATE DATABASE) и име на тестовата база.
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ??
  "postgresql://erp:erp@127.0.0.1:5433/postgres";
const DB = process.env.TEST_PG_DB ?? "erp_ascensori_test";
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);

const env = {
  ...process.env,
  DATABASE_URL: DB_URL,
  SESSION_SECRET: "integration_test_session_secret_32_chars_min",
  AUDIT_HMAC_KEY: "integration_test_audit_hmac_key_32_chars_min",
  // Метриките са зад токен — пакетът трябва да има с какво да ги поиска.
  HEALTH_TOKEN: "integration_test_health_token",
  // QR етикетите отказват да се генерират без публичен адрес — нарочно.
  APP_URL: "http://127.0.0.1:3021",
  // Хранилището на прикачените файлове — в папката на пакета, не в системната:
  // тестът пише реални файлове и ги трие след себе си.
  STORAGE_DIR: process.env.TEST_STORAGE_DIR ?? ".test-allegati",
  // тестовете правят десетки входа — вдигаме тавана, за да не удрят rate limit-а
  RATE_LIMIT_LOGIN: "10000",
  RATE_LIMIT_REFRESH: "10000",
  RATE_LIMIT_SDI: "10000",
  // Канал за подаване към SDI: изключен по подразбиране (и правилно), но
  // тогава маршрутът връща 503 ПРЕДИ всяка друга проверка — и правилата за
  // идемпотентност, състояние и дублиране остават непроверени. Тук се задава
  // адрес на посредник, който НЕ се вика: изпращач още няма, а маршрутът само
  // подготвя файла и маркира състоянието.
  SDI_CANALE: "intermediario",
  SDI_INTERMEDIARIO_URL: "https://intermediario.esempio.it/api",
  NODE_ENV: "production",
};

// Предпазител: DROP DATABASE върви срещу СЪЩИЯ Postgres, на който е dev базата.
// Една сгрешена променлива и `erp_ascensori` изчезва безвъзвратно.
if (!/_test$/.test(DB)) {
  console.error(`✗ TEST_PG_DB трябва да завършва на "_test" (получено: ${DB})`);
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
    process.kill(-server.pid, "SIGTERM"); // цялата процесна група
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
  console.log(`▸ подготвям тестовата база ${DB}`);
  psql(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  psql(`CREATE DATABASE ${DB}`);

  // МИГРАЦИИ, не `db push`: така пакетът проверява и че историята на миграциите
  // изгражда точно живата схема (drift се хваща тук, не при клиента), и че
  // политиките за RLS реално се появяват — `db push` не изпълнява SQL миграции.
  console.log("▸ схема (миграции) + демо данни");
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env,
    stdio: "inherit",
  });
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "inherit" });

  console.log("▸ билд");
  execFileSync("npx", ["next", "build"], { env, stdio: "pipe" });

  console.log(`▸ вдигам сървър на ${BASE}`);
  // detached: npx е обвивка — SIGTERM към нея не стига до внука `next-server`,
  // който остава сирак, заема порта и следващият пуск тества СТАР билд.
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
    [
      "tsx",
      "--test",
      // Един файл наведнъж, когато се разследва провал: `TEST_SOLO=nuovi-moduli`.
      process.env.TEST_SOLO
        ? `tests/integration/${process.env.TEST_SOLO}.int.test.ts`
        : "tests/integration/*.int.test.ts",
    ],
    { env: { ...env, TEST_BASE_URL: BASE }, stdio: "inherit" },
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
