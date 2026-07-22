#!/usr/bin/env node
// tools/fivem/manifest-lint.mjs — статичен линтер за FiveM ресурси (Геймъра).
//
// Хваща типичните грешки и рискове БЕЗ да пуска сървъра: непълен fxmanifest.lua, client-authoritative
// логика (сървърът трябва да е авторитетът), event handler без проверка на `source`, SQL чрез конкатенация
// (вместо параметри в oxmysql), native в плътен цикъл без кеш, твърдо вписана тайна.
//
// Употреба:  node tools/fivem/manifest-lint.mjs <папка-или-файл>
// Изход: 0 = чисто/само INFO, 1 = има HIGH находки. Евристичен помощник, не заместител на ревю/тест.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

// Тайни: Steam Web API ключ, generic токен в конфиг. (FiveM license key живее в server.cfg, не в ресурс.)
const SECRET_RE = /(steam_webApiKey|sv_licenseKey|api[_-]?key|token|secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i;
const TRIGGER_SERVER = /TriggerServerEvent|RegisterServerEvent|RegisterNetEvent|onNet|AddEventHandler/;

// Оценява едно съдържание. Връща масив находки {sev,code,msg,where}. Чиста функция — тестваема.
export function lintFile(src, rel) {
  const out = [];
  const add = (sev, code, msg) => out.push({ sev, code, msg, where: rel });
  const isManifest = /fxmanifest\.lua$|__resource\.lua$/.test(rel);
  const isServer = /server|sv_/i.test(basename(rel));
  const isClient = /client|cl_/i.test(basename(rel));
  const isSample = /example|sample|\.md$/i.test(rel);

  if (isManifest) {
    if (/__resource\.lua$/.test(rel)) add("MEDIUM", "legacy-manifest", "`__resource.lua` е остарял — мигрирай към `fxmanifest.lua` с `fx_version` + `game`.");
    if (!/fx_version\s+['"]/.test(src)) add("HIGH", "no-fx-version", "Липсва `fx_version` в манифеста — ресурсът няма да зареди. Ползвай напр. `fx_version 'cerulean'`.");
    if (!/\bgame\s+['"]/.test(src) && !/\bgames\s*\{/.test(src)) add("MEDIUM", "no-game", "Липсва `game 'gta5'` (или `games`) — задай целевата игра изрично.");
  }

  // Тайна в код (не в sample)
  if (SECRET_RE.test(src) && !isSample) add("HIGH", "hardcoded-secret", "Изглежда твърдо вписана тайна (API ключ/токен) — дръж я извън ресурса (server.cfg convar / env), НИКОГА в git.");

  // Client-authoritative пари/предмети: сървърът трябва да решава. Клиентски файл, който сам „дава" награда/пари.
  if (isClient && /(AddMoney|GivePlayerMoney|addItem|AddItem|giveWeapon|reward|награда)/.test(src) && !/TriggerServerEvent|lib\.callback|ESX\.TriggerServerCallback/.test(src))
    add("HIGH", "client-authoritative", "Клиентът раздава пари/предмет без сървърна заявка — играч може да trigger-не exploit. Сървърът е авторитетът: валидирай на сървъра.");

  // Server event handler без проверка на source (spoof на нетна заявка)
  if (isServer && TRIGGER_SERVER.test(src)) {
    const handlesNet = /AddEventHandler|RegisterNetEvent|onNet|lib\.callback\.register/.test(src);
    if (handlesNet && !/\bsource\b|_source|src\b|@param.*source/.test(src))
      add("HIGH", "no-source-check", "Сървърен net event handler без проверка на `source` — всеки клиент може да го trigger-не със спуфнати аргументи. Валидирай `source` и всички входни данни server-side.");
  }

  // SQL чрез конкатенация вместо параметри (oxmysql/mysql-async)
  if (/(MySQL|oxmysql|exports\.oxmysql|Query|Execute|Scalar)/.test(src) && /["'`][^"'`]*(SELECT|INSERT|UPDATE|DELETE)[^"'`]*["'`]\s*\.\.\s*/i.test(src))
    add("HIGH", "sql-concat", "SQL заявка чрез конкатенация (`..`) — SQL инжекция. Ползвай параметри: `MySQL.query('... WHERE id = ?', { id })`.");

  // Native в плътен цикъл без кеш (производителност — server tick/thread)
  if (/(while\s+true|Citizen\.CreateThread|CreateThread)[\s\S]{0,300}?(GetEntityCoords|GetPlayerPed|PlayerPedId|GetGamePool)\(/.test(src) && !/Wait\((?!0\))/.test(src))
    add("MEDIUM", "hot-native-loop", "Native в плътен цикъл без `Citizen.Wait(...)` (>0) или кеширане — товари сървъра/клиента. Кеширай резултата или увеличи Wait.");

  return out;
}

function walk(dir, acc = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (["node_modules", ".git", "dist", "build", "stream"].includes(e)) continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

function report(findings, root) {
  const order = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  if (!findings.length) { console.log("✓ manifest-lint: чисто (няма находки)."); return; }
  console.log(`manifest-lint — ${findings.length} находки за ${root}:\n`);
  for (const f of findings) console.log(`  [${f.sev}] ${f.code} · ${f.where}\n        ${f.msg}`);
  const h = findings.filter((f) => f.sev === "HIGH").length;
  console.log(`\n${h} HIGH · ${findings.filter((f) => f.sev === "MEDIUM").length} MEDIUM · ${findings.filter((f) => f.sev === "INFO").length} INFO`);
}

function runCli() {
  const root = process.argv[2] || ".";
  if (!existsSync(root)) { report([{ sev: "HIGH", code: "no-path", msg: `Пътят не съществува: ${root}`, where: root }], root); process.exit(1); }
  const files = (statSync(root).isDirectory() ? walk(root) : [root]).filter((f) => [".lua", ".js", ".ts"].includes(extname(f)));
  const findings = [];
  for (const f of files) {
    let src = ""; try { src = readFileSync(f, "utf8"); } catch { continue; }
    findings.push(...lintFile(src, f.replace(root, "").replace(/^\//, "") || f));
  }
  report(findings, root);
  process.exit(findings.some((f) => f.sev === "HIGH") ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) runCli();
