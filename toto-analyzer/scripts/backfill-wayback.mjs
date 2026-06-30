#!/usr/bin/env node
/*
 * Запълване на история от Wayback Machine (web.archive.org).
 *
 * toto.bg е зад Radware bot-защита, която не позволява теглене на архивните
 * страници. Затова за исторически данни ползваме снимките на началната
 * страница, които Wayback е запазвал през годините — всяка снимка съдържа
 * последния тираж към онзи момент. С много снимки се възстановява дълга история.
 *
 * Това е best-effort: добивът зависи от покритието на Wayback и от това дали
 * старият HTML съвпада с текущия парсер. Стартирай в среда с достъп до
 * web.archive.org (напр. GitHub Actions или локална машина):
 *
 *   node scripts/backfill-wayback.mjs [--from=2015] [--max=400]
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { parseResultsPage, GAMES } from "./parse-toto.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=?(.*)$/);
    return m ? [m[1], m[2] || true] : [a, true];
  })
);
const FROM = args.from || "2015";
const TO = args.to || String(new Date().getFullYear());
const MAX = parseInt(args.max || "500", 10);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curlGet(url) {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      ["-sS", "-m", "40", "--compressed", "-A", UA, "-L", url],
      { maxBuffer: 50 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout || ""))
    );
  });
}

// Снимки на изброени URL-и от CDX API.
async function listSnapshots() {
  const targets = [
    "toto.bg/results",
    "www.toto.bg/results",
    "toto.bg",
    "www.toto.bg",
  ];
  const seen = new Map(); // timestamp -> original
  for (const t of targets) {
    const cdx =
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(t)}` +
      `&output=json&from=${FROM}&to=${TO}&filter=statuscode:200` +
      `&filter=mimetype:text/html&collapse=digest`;
    try {
      const raw = await curlGet(cdx);
      const rows = JSON.parse(raw);
      // Първият ред са имената на колоните.
      for (const row of rows.slice(1)) {
        const ts = row[1];
        const original = row[2];
        if (ts && !seen.has(ts)) seen.set(ts, original);
      }
      console.log(`CDX ${t}: общо снимки досега ${seen.size}`);
    } catch (e) {
      console.warn(`CDX за ${t} се провали: ${e.message}`);
    }
    await sleep(500);
  }
  return [...seen.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function loadGame(id) {
  const p = join(dataDir, id + ".json");
  if (!existsSync(p)) return [];
  try {
    const arr = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveGame(id, draws) {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  draws.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  writeFileSync(join(dataDir, id + ".json"), JSON.stringify(draws, null, 2) + "\n");
}

function mergeDraw(list, draw) {
  // Дедуп по дата, с резерва номер на тираж — за да не губим снимки, чийто
  // tiraj-regex не е уловил дата, но има валиден номер.
  if (!draw.date && draw.draw == null) return false;
  const exists = list.some(
    (d) =>
      (draw.date && d.date === draw.date) ||
      (draw.draw != null && d.draw === draw.draw)
  );
  if (exists) return false;
  list.push({ date: draw.date || null, numbers: draw.numbers, draw: draw.draw });
  return true;
}

async function main() {
  console.log(`Запълване от Wayback (${FROM}–${TO}, до ${MAX} снимки)...`);
  let snaps;
  try {
    snaps = await listSnapshots();
  } catch (e) {
    console.error("Не успях да достъпя web.archive.org:", e.message);
    console.error("Пусни скрипта от среда с достъп до интернет/Wayback.");
    process.exit(1);
  }
  if (!snaps.length) {
    console.log("Wayback няма налични снимки за тези URL-и.");
    process.exit(0);
  }

  // Зареждаме текущите данни по игри.
  const lists = {};
  for (const id of Object.keys(GAMES)) lists[id] = loadGame(id);

  let processed = 0,
    added = 0;
  for (const [ts, original] of snaps) {
    if (processed >= MAX) break;
    processed++;
    // id_ връща суровия архивиран HTML без лентата на Wayback.
    const url = `https://web.archive.org/web/${ts}id_/${original}`;
    try {
      const html = await curlGet(url);
      const draws = parseResultsPage(html);
      for (const d of draws) {
        if (lists[d.gameId] && mergeDraw(lists[d.gameId], d)) {
          added++;
          console.log(`+ ${GAMES[d.gameId].label} ${d.date}: ${d.numbers.join(", ")} (снимка ${ts})`);
        }
      }
    } catch (e) {
      // пропускаме повредени снимки
    }
    if (processed % 20 === 0) console.log(`...обработени ${processed}/${snaps.length}`);
    await sleep(400);
  }

  for (const id of Object.keys(GAMES)) saveGame(id, lists[id]);
  console.log(`Готово. Обработени снимки: ${processed}. Нови тиражи: ${added}.`);
  for (const id of Object.keys(GAMES)) {
    console.log(`  ${GAMES[id].label}: ${lists[id].length} тиража`);
  }
}

main().catch((e) => {
  console.error("Грешка:", e);
  process.exit(1);
});
