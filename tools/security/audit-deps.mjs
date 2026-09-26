#!/usr/bin/env node
// tools/security/audit-deps.mjs — одит на ПРОДУКЦИОННИТЕ зависимости, без `npm audit`.
//
// Защо изобщо съществува. От юли 2026 г. `npm audit` е счупен срещу самия
// registry на npm: командата първо пита работещия „bulk" endpoint (200), а
// после — за обобщението — ретирания „quick" (`/-/npm/v1/security/audits/quick`),
// който вече връща 400 „Invalid package tree". Изходът е ненулев независимо от
// това дали има уязвимости. Тоест гейтът вече не казва нищо за сигурността, а
// само че npm говори с мъртъв endpoint — и понеже е блокиращ, спира всяко
// вливане. Заглушаването му (`|| true`) би било по-лошо от липсата му: зелена
// отметка, която не проверява нищо.
//
// Затова питаме РАБОТЕЩИЯ endpoint направо. Нула зависимости, както всичко в
// `tools/`; източникът на съветите остава същият (npm Security Advisories),
// само пътят до него е друг.
//
// Употреба:
//   node tools/security/audit-deps.mjs <dir> [--soglia critical|high|moderate|low]
//                                            [--solo-report] [--consenti-offline]
//
// Изход: 0 = чисто (или само под прага) · 1 = има уязвимост на/над прага ·
//        2 = вътрешна грешка или недостъпен източник (fail closed).

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const RED = "\x1b[31m",
  YEL = "\x1b[33m",
  GRN = "\x1b[32m",
  DIM = "\x1b[2m",
  RST = "\x1b[0m";

const ENDPOINT = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
export const LIVELLI = ["info", "low", "moderate", "high", "critical"];

function argomento(nome, predefinito = null) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
}
const flag = (nome) => process.argv.includes(`--${nome}`);

/**
 * Продукционните пакети от lock файла.
 *
 * Ключът е `dev: true` — точно това, което `--omit=dev` прави: dev-уязвимост в
 * линтера не стига до клиента, а блокирането ѝ води до заглушаване на целия
 * гейт. `devOptional` е ДВОЙНО означен (dev в един път, продукционен в друг) и
 * затова остава ВЪТРЕ: изключването му би скрило реални продукционни пакети.
 */
export function pacchettiProduzione(lock) {
  const perNome = new Map();
  for (const [percorso, p] of Object.entries(lock.packages ?? {})) {
    if (!percorso || p.dev || p.link || !p.version) continue;
    // "node_modules/a/node_modules/b" → "b"
    const nome = percorso.slice(percorso.lastIndexOf("node_modules/") + "node_modules/".length);
    if (!perNome.has(nome)) perNome.set(nome, new Set());
    perNome.get(nome).add(p.version);
  }
  return Object.fromEntries([...perNome].map(([n, v]) => [n, [...v]]));
}

async function consulta(corpo) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} от ${ENDPOINT}`);

  // НЕ `res.json()`. Зад корпоративно прокси отговорът идва gzip-нат, но БЕЗ
  // хедъра `content-encoding` — тогава `fetch` не разархивира и `json()` гърми
  // върху двоични байтове с подвеждащо „is not valid JSON". Затова гледаме
  // самите байтове: `1f 8b` е подписът на gzip.
  const dati = Buffer.from(await res.arrayBuffer());
  const testo =
    dati[0] === 0x1f && dati[1] === 0x8b ? gunzipSync(dati).toString("utf8") : dati.toString("utf8");
  return JSON.parse(testo);
}

async function main() {
  const dir = resolve(
    process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".",
  );
  const soglia = argomento("soglia", "critical");
  if (!LIVELLI.includes(soglia)) {
    console.error(`✗ непознат праг „${soglia}"; допустими: ${LIVELLI.join(", ")}`);
    return 2;
  }
  const sogliaIdx = LIVELLI.indexOf(soglia);

  const lockPath = join(dir, "package-lock.json");
  if (!existsSync(lockPath)) {
    console.error(`✗ няма ${lockPath}`);
    return 2;
  }
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const pacchetti = pacchettiProduzione(lock);
  const quanti = Object.keys(pacchetti).length;
  console.log(`${DIM}Одит на ${quanti} продукционни пакета · праг: ${soglia}${RST}`);

  let avvisi;
  try {
    avvisi = await consulta(pacchetti);
  } catch (e) {
    // Fail closed: недоказана сигурност не е сигурност. Локално може да се
    // разреши изрично, за да не спира работата без мрежа.
    const msg = `✗ източникът на съвети е недостъпен: ${e.message}`;
    if (flag("consenti-offline")) {
      console.log(`${YEL}${msg} — пропуснато по изричен избор (--consenti-offline)${RST}`);
      return 0;
    }
    console.error(`${RED}${msg}${RST}`);
    return 2;
  }

  const trovate = [];
  for (const [nome, elenco] of Object.entries(avvisi)) {
    for (const a of elenco) {
      trovate.push({
        nome,
        severita: String(a.severity ?? "info").toLowerCase(),
        titolo: a.title,
        versioni: a.vulnerable_versions,
        correzione: a.patched_versions,
        url: a.url,
      });
    }
  }

  if (trovate.length === 0) {
    console.log(`${GRN}✔ няма известни уязвимости в продукционните зависимости${RST}`);
    return 0;
  }

  trovate.sort((a, b) => LIVELLI.indexOf(b.severita) - LIVELLI.indexOf(a.severita));
  const bloccanti = trovate.filter((t) => LIVELLI.indexOf(t.severita) >= sogliaIdx);

  for (const t of trovate) {
    const alto = LIVELLI.indexOf(t.severita) >= sogliaIdx;
    const colore = alto ? RED : YEL;
    console.log(`${colore}[${t.severita}]${RST} ${t.nome} ${DIM}${t.versioni}${RST}`);
    console.log(`   ${t.titolo}`);
    console.log(`   ${DIM}поправено в: ${t.correzione || "—"} · ${t.url}${RST}`);
  }

  const conteggio = LIVELLI.map((l) => [l, trovate.filter((t) => t.severita === l).length])
    .filter(([, n]) => n > 0)
    .map(([l, n]) => `${n} ${l}`)
    .join(" · ");
  console.log(`\n${DIM}Общо: ${conteggio}${RST}`);

  if (!bloccanti.length) {
    console.log(`${GRN}✔ нищо на или над прага „${soglia}"${RST}`);
    return 0;
  }
  if (flag("solo-report")) {
    console.log(`${YEL}⚠ ${bloccanti.length} на/над прага — само доклад${RST}`);
    return 0;
  }
  console.error(`${RED}✗ ${bloccanti.length} уязвимости на/над прага „${soglia}"${RST}`);
  return 1;
}

// Само при пряко извикване: файлът се внася и от теста (`audit-deps.test.mjs`),
// а тогава не бива да тръгва одит и да вика `process.exit`.
if (import.meta.url === `file://${process.argv[1]}`)
  main().then(
    (c) => process.exit(c),
    (e) => {
      console.error(`✗ ${e.stack ?? e.message}`);
      process.exit(2);
    },
  );
