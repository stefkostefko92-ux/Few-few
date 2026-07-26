#!/usr/bin/env node
// Снимки на всяка страница от РЕАЛНО вдигнат сървър с демо данни.
//
//   npm run schermate
//
// Не е тест — инструмент за преглед и за материали към клиент. Затова базата е
// отделна и се трие накрая: не пипаме нито работната, нито тестовата.

import { spawn, execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdirSync, rmSync } from "node:fs";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.SHOT_PORT ?? 3023);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL ?? "postgresql://erp:erp@127.0.0.1:5433/postgres";
const DB = "erp_ascensori_schermate_test";
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);
const FUORI = process.env.SHOT_DIR ?? "schermate";

const env = {
  ...process.env,
  DATABASE_URL: DB_URL,
  SESSION_SECRET: "schermate_session_secret_32_chars_minimum",
  AUDIT_HMAC_KEY: "schermate_audit_hmac_key_32_chars_minimum",
  HEALTH_TOKEN: "schermate_health_token",
  APP_URL: BASE,
  RATE_LIMIT_LOGIN: "10000",
  NODE_ENV: "production",
};

/** Страниците, подредени както човек ги обхожда. */
const PAGINE = [
  ["01-login", "/login", { senzaSessione: true }],
  ["02-dashboard", "/dashboard"],
  ["03-impianti", "/impianti"],
  ["04-impianto-dettaglio", null, { primo: "/impianti" }],
  ["05-scadenze", "/scadenze"],
  ["06-etichette-qr", "/impianti/etichette"],
  ["07-condomini", "/condomini"],
  ["08-amministratori", "/amministratori"],
  ["09-dipendenti", "/dipendenti"],
  ["10-automezzi", "/automezzi"],
  ["11-cottimisti", "/cottimisti"],
  ["12-squadre", "/squadre"],
  ["13-magazzino", "/magazzino"],
  ["14-movimenti", "/movimenti"],
  ["15-contratti", "/contratti"],
  ["16-preventivi", "/preventivi"],
  ["17-ordini", "/ordini"],
  ["18-ordine-dettaglio", null, { primo: "/ordini" }],
  ["19-fatture", "/fatture"],
  ["20-fattura-dettaglio", null, { primo: "/fatture" }],
  ["21-ddt", "/ddt"],
  ["22-documenti", "/documenti"],
  ["23-redditivita", "/redditivita"],
  ["24-utenti", "/utenti"],
  ["25-audit", "/audit"],
  ["26-impostazioni", "/impostazioni"],
  ["27-integrazioni", "/integrazioni"],
  ["28-privacy", "/privacy"],
  ["29-aziende", "/aziende"],
];

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
  }
}

function psql(sql, url = ADMIN_URL) {
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
}

/** Влиза през формата — същият път като на човек. */
async function entra(page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill("master@erp-ascensori.local");
  await page.getByLabel("Password").fill("Ascensori!2026");
  await page.getByRole("button", { name: "Accedi" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function scatta(page, nome, percorso, opzioni = {}) {
  if (opzioni.primo) {
    // Детайлна страница: отваряме първия ред от списъка.
    await page.goto(BASE + opzioni.primo, { waitUntil: "networkidle" });
    const link = page.locator("tbody a").first();
    if ((await link.count()) === 0) {
      console.log(`  ⚠ ${nome}: няма редове в ${opzioni.primo}, пропускам`);
      return;
    }
    await link.click();
    await page.waitForLoadState("networkidle");
  } else {
    await page.goto(BASE + percorso, { waitUntil: "networkidle" });
  }
  // Малко въздух за графиките (Recharts анимира при монтиране).
  await sleep(900);
  await page.screenshot({ path: `${FUORI}/${nome}.png`, fullPage: true });
  console.log(`  ✔ ${nome}`);
}

async function main() {
  console.log(`▸ база ${DB}`);
  psql(`DROP DATABASE IF EXISTS ${DB}`);
  psql(`CREATE DATABASE ${DB}`);

  console.log("▸ схема + демо данни");
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "pipe" });
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "inherit" });

  console.log("▸ билд");
  execFileSync("npx", ["next", "build"], { env, stdio: "pipe" });

  console.log(`▸ сървър на ${BASE}`);
  server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    env,
    stdio: "pipe",
    detached: true,
  });
  server.stderr.on("data", (b) => process.stderr.write(b));

  const scadenza = Date.now() + 60_000;
  for (;;) {
    if (Date.now() > scadenza) throw new Error("сървърът не се вдигна");
    try {
      if ((await fetch(`${BASE}/login`)).ok) break;
    } catch {
      /* още не слуша */
    }
    await sleep(500);
  }

  rmSync(FUORI, { recursive: true, force: true });
  mkdirSync(FUORI, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });

  console.log("\n▸ настолен изглед");
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "it-IT",
  });
  const page = await desktop.newPage();

  // Входът се снима БЕЗ сесия — иначе се пренасочва.
  await scatta(page, "01-login", "/login");
  await entra(page);
  for (const [nome, percorso, opzioni] of PAGINE) {
    if (opzioni?.senzaSessione) continue;
    await scatta(page, nome, percorso, opzioni);
  }
  await desktop.close();

  console.log("\n▸ телефон (изгледът на техника)");
  const mobile = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "it-IT",
  });
  const tel = await mobile.newPage();
  await entra(tel);
  for (const [nome, percorso] of [
    ["m1-dashboard", "/dashboard"],
    ["m2-ordini", "/ordini"],
    ["m3-impianti", "/impianti"],
  ])
    await scatta(tel, nome, percorso);
  await mobile.close();

  await browser.close();
  await fermaServer();
  psql(`DROP DATABASE IF EXISTS ${DB}`);
  console.log(`\n✔ снимките са в ${FUORI}/`);
}

for (const s of ["SIGINT", "SIGTERM"])
  process.on(s, async () => {
    await fermaServer();
    process.exit(130);
  });

main().catch(async (e) => {
  console.error("✗", e.message);
  await fermaServer();
  process.exit(1);
});
