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
const ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ??
  "postgresql://erp:erp@127.0.0.1:5433/postgres";
const DB = "erp_ascensori_schermate_test";
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);
const FUORI = process.env.SHOT_DIR ?? "schermate";

const env = {
  ...process.env,
  DATABASE_URL: DB_URL,
  SESSION_SECRET: "schermate_session_secret_32_chars_minimum",
  AUDIT_HMAC_KEY: "schermate_audit_hmac_key_32_chars_minimum",
  HEALTH_TOKEN: "schermate_health_token",
  // Прикачените файлове искат хранилище; в снимките е временно и се трие с базата.
  STORAGE_DIR: ".schermate-allegati",
  APP_URL: BASE,
  RATE_LIMIT_LOGIN: "10000",
  NODE_ENV: "production",
  // Задължителният втори фактор е ИЗКЛЮЧЕН само тук: демо акаунтите на
  // MASTER/ADMIN се ползват от десетки тестове паралелно, а една стъпка на
  // TOTP е един вход. Правилото има свой тест (password-policy.test.ts), а
  // потокът за включване — e2e (sicurezza.spec.ts).
  MFA_OBBLIGATORIA: "0",
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
  ["21a-ddt-dettaglio", null, { primo: "/ddt" }],
  ["22-documenti", "/documenti"],
  ["23-redditivita", "/redditivita"],
  ["23a-scadenzario", "/scadenzario"],
  ["23b-calendario", "/calendario"],
  ["23c-conservazione", "/conservazione"],
  ["24-utenti", "/utenti"],
  ["25-audit", "/audit"],
  ["26-impostazioni", "/impostazioni"],
  ["27-integrazioni", "/integrazioni"],
  ["28-privacy", "/privacy"],
  ["29-aziende", "/aziende"],
  ["30-sicurezza", "/sicurezza"],
  ["31-amministrazione", "/amministrazione"],
  ["32-utente-sicurezza", "/utenti", { clicca: "Sicurezza" }],
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
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    stdio: "pipe",
  });
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
  // Диалог: снимката е на ОТВОРЕНИЯ диалог — затворен той не съществува.
  if (opzioni.clicca) {
    await page.getByRole("button", { name: opzioni.clicca }).first().click();
    await page.getByRole("dialog").waitFor();
  }
  // Малко въздух за графиките (Recharts анимира при монтиране).
  await sleep(900);

  // `fullPage` НЕ СТИГА ЗА ТОЗИ ЛЕЙАУТ. Обвивката е `h-screen overflow-hidden`,
  // а съдържанието се търкаля вътре в `<main class="overflow-y-auto">` — тоест
  // САМИЯТ документ е висок точно колкото прозореца и „цялата страница" е
  // просто първият екран. Дългите страници (таблото с всички джаджи, детайлът
  // на импианто) излизаха отрязани, а долу — бяло поле.
  //
  // Затова прозорецът се разтяга до вътрешната височина и чак после се снима.
  const originale = page.viewportSize();
  const alto = await page
    .locator("main")
    .evaluate((m) => Math.ceil(m.scrollHeight) + 32)
    .catch(() => 0);
  if (alto > originale.height) {
    await page.setViewportSize({ width: originale.width, height: alto });
    await sleep(400); // графиките се преоразмеряват
  }
  await page.screenshot({ path: `${FUORI}/${nome}.png`, fullPage: true });
  if (alto > originale.height) await page.setViewportSize(originale);
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
  server = spawn(
    "node",
    ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    {
      env,
      stdio: "pipe",
      detached: true,
    },
  );
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
    executablePath:
      process.env.CHROMIUM_PATH ??
      "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    // `locale` на контекста не стига: форматът на родното поле за дата
    // следва езика на ПРОЦЕСА. Без това снимката показва „mm/dd/yyyy" —
    // нещо, което италианският оператор никога не вижда.
    args: ["--lang=it-IT", "--accept-lang=it-IT"],
    // Безглавият Chromium взима езика на родните контроли („Choose Files",
    // „mm/dd/yyyy") от средата на процеса, не от `--lang` — снимката показваше
    // английски там, където италианският браузър на оператора пише италиански.
    env: { ...process.env, LANG: "it_IT.UTF-8", LANGUAGE: "it" },
  });

  console.log("\n▸ настолен изглед");
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
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
    timezoneId: "Europe/Rome",
  });
  const tel = await mobile.newPage();
  await entra(tel);
  // Потокът на техника от телефон: списък → детайл → срокове → документи.
  // Детайлите са там, където таблиците и формите се чупят първи на тясно.
  for (const [nome, percorso, opzioni] of [
    ["m1-dashboard", "/dashboard"],
    ["m2-ordini", "/ordini"],
    ["m3-impianti", "/impianti"],
    ["m4-impianto-dettaglio", null, { primo: "/impianti" }],
    ["m5-ordine-dettaglio", null, { primo: "/ordini" }],
    ["m6-scadenze", "/scadenze"],
    ["m7-fattura-dettaglio", null, { primo: "/fatture" }],
    ["m8-magazzino", "/magazzino"],
    ["m9-sicurezza", "/sicurezza"],
    ["m10-amministrazione", "/amministrazione"],
    ["m11-utenti", "/utenti"],
    ["m11a-utente-sicurezza", "/utenti", { clicca: "Sicurezza" }],
    ["m12-audit", "/audit"],
    ["m13-integrazioni", "/integrazioni"],
    ["m14-privacy", "/privacy"],
    ["m15-impostazioni", "/impostazioni"],
  ])
    await scatta(tel, nome, percorso, opzioni);
  await mobile.close();

  // ТЪМНАТА ТЕМА Е ОТДЕЛЕН ИНТЕРФЕЙС, не филтър. Контрастът се смята от
  // `contrasto.test.ts`, но само снимката показва неща като бяла рамка от
  // светлата тема или графика, забравила своите тъмни токени.
  console.log("\n▸ тъмна тема");
  const scuro = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    colorScheme: "dark",
  });
  await scuro.addInitScript(() => {
    try {
      localStorage.setItem("ea:tema", "dark");
    } catch {
      /* без хранилище — остава предпочитанието на системата (dark) */
    }
  });
  const buio = await scuro.newPage();
  await scatta(buio, "d01-login", "/login");
  await entra(buio);
  for (const [nome, percorso, opzioni] of [
    ["d02-dashboard", "/dashboard"],
    ["d03-impianti", "/impianti"],
    ["d04-impianto-dettaglio", null, { primo: "/impianti" }],
    ["d05-fattura-dettaglio", null, { primo: "/fatture" }],
    ["d06-ddt-dettaglio", null, { primo: "/ddt" }],
    ["d07-impostazioni", "/impostazioni"],
    ["d08-integrazioni", "/integrazioni"],
    ["d09-amministrazione", "/amministrazione"],
    ["d10-utenti", "/utenti"],
  ])
    await scatta(buio, nome, percorso, opzioni);
  await scuro.close();

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
