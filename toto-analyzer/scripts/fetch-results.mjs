#!/usr/bin/env node
/*
 * Автоматично извличане на последните тото тегления от toto.bg.
 *
 * Страницата /results показва последния тираж за изтеглените този ден игри.
 * Скриптът я тегли, парсва и добавя новите тиражи към data/<игра>.json
 * (с дедупликация). Замислен е да се пуска по график (GitHub Action), така
 * че архивът да се попълва сам — без ръчно нанасяне.
 *
 * Употреба:  node scripts/fetch-results.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { parseResultsPage, GAMES } from "./parse-toto.mjs";

// toto.bg е зад Radware bot-защита, която блокира /results. Но /sitemap.xml
// сервира същото съдържание (последния тираж) БЕЗ challenge — затова го ползваме
// като основен източник, а /results остава като резерва.
const SOURCE_URLS = [
  "https://www.toto.bg/sitemap.xml",
  "https://www.toto.bg/results",
];
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Засича Radware loader страницата (когато сме блокирани).
function looksBlocked(html) {
  return (
    /__uzdbm_/.test(html) ||
    /Radware/i.test(html) ||
    /Request unsuccessful/i.test(html)
  );
}

// Тегли URL чрез curl. Toto.bg е зад Radware bot-защита, която филтрира по
// TLS отпечатък — браузърноподобният curl минава, докато Node `fetch` се
// блокира. curl е наличен и на GitHub Actions runner-ите.
function curlGet(url) {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "-sS", "-m", "25", "--compressed",
        "-A", UA,
        "-H", "Accept-Language: bg,en;q=0.9",
        "-H", "Accept: text/html,application/xhtml+xml",
        url,
      ],
      { maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout || ""))
    );
  });
}

async function fetchResults() {
  let lastErr = null;
  for (const url of SOURCE_URLS) {
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const html = await curlGet(url);
        if (!looksBlocked(html)) {
          const draws = parseResultsPage(html);
          if (draws.length) return draws;
        }
        console.warn(`${url} опит ${attempt}: блокирано/празно...`);
      } catch (e) {
        lastErr = e;
        console.warn(`${url} опит ${attempt} се провали: ${e.message}`);
      }
      await sleep(Math.min(attempt * 1500, 6000));
    }
  }
  if (lastErr) throw lastErr;
  return [];
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
  // Подреждане от най-стар към най-нов; дедуп по дата (резерва: номер тираж).
  draws.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  writeFileSync(join(dataDir, id + ".json"), JSON.stringify(draws, null, 2) + "\n");
}

// Добавя тираж, ако още го няма (по дата или номер на тираж).
function mergeDraw(list, draw) {
  const exists = list.some(
    (d) =>
      (draw.date && d.date === draw.date) ||
      (draw.draw != null && d.draw === draw.draw)
  );
  if (exists) return false;
  list.push({ date: draw.date, numbers: draw.numbers, draw: draw.draw });
  return true;
}

async function main() {
  const fresh = await fetchResults();
  if (!fresh.length) {
    console.log("Няма извлечени тиражи (вероятно временно блокиране).");
    process.exit(0);
  }

  let added = 0;
  const touched = new Set();
  for (const d of fresh) {
    const list = loadGame(d.gameId);
    if (mergeDraw(list, d)) {
      saveGame(d.gameId, list);
      touched.add(d.gameId);
      added++;
      console.log(`+ ${GAMES[d.gameId].label}  тираж ${d.draw} (${d.date}): ${d.numbers.join(", ")}`);
    } else {
      console.log(`= ${GAMES[d.gameId].label}  тираж ${d.draw} вече съществува`);
    }
  }

  console.log(`Готово. Нови тиражи: ${added}. Обновени игри: ${[...touched].join(", ") || "няма"}.`);
}

main().catch((e) => {
  console.error("Грешка:", e);
  process.exit(1);
});
