#!/usr/bin/env node
// drift-lint.mjs — детерминистичен детектор за ДРЕЙФ в агентския слой (0 LLM токена, fail-closed).
//
// Защо: взаимният преглед (26 агента, ~1.4M токена) откри клас грешки, които детерминистичен гейт лови
// БЕЗ да плаща модел — стар/счупен път, чужда поука в памет. Тук ги превръщаме в евтин повтарящ се
// гейт. Философия: хващай грешката където е най-евтино (код, не LLM); LLM-верификацията пази само SC.
//
// Две проверки:
//  - ТВЪРДА: счупени `файл:ред` референции — дефиниция/оркестрация сочи backtick-нат репо път, който
//    НЕ съществува → грешка (exit 1). Нула фалшиви положителни (path-ът или е там, или не).
//  - СЪВЕТ (advisory): memory↔domain дрейф — поука в паметта на агент X, чийто източник носи силен
//    сигнал за ЧУЖД домейн (хваща класа „3d-maniac" — game-render поуки в CAD агент). Евристика →
//    печата, не гейтва (без --strict), за да не блокира CI при легитимно споменаване.
//
//   node tools/agents/drift-lint.mjs            # отчет (ТВЪРДА гейтва, съвет само печата)
//   node tools/agents/drift-lint.mjs --json
//   node tools/agents/drift-lint.mjs --strict    # гейтва и на съветите (нулев дрейф)

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sectionBullets } from "./oversee-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const AGENTS_DIR = join(ROOT, ".claude", "agents");
const MEM_DIR = join(AGENTS_DIR, "_memory");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const STRICT = argv.includes("--strict");

const NOT_AGENT_DEF = new Set(["README.md"]);
const NOT_AGENT_MEM = new Set(["SECURITY.md", "PROTOCOL.md", "PROCEDURE.md", "_shared.md"]);

// --- ТВЪРДА: счупени файлови референции -------------------------------------
// САМО репо-root-анкорирани папки (tools/.claude/.github/agents-dashboard/deploy/docs) — те са спрямо
// корена, проверими са. НЕ включваме src/prisma/apps: агентите ги пишат СПРЯМО своя продукт
// (`src/lib/money.ts` = `CSPos/src/...`), не спрямо корена → биха дали фалшиви положителни.
const PATH_RE = /`((?:tools|\.claude|\.github|agents-dashboard|deploy|docs)\/[A-Za-z0-9_@./*-]+)`/g;
const IGNORE_PATH = /[*]|\/<|>\/|\.\.\.|node_modules/; // glob/плейсхолдъри — не са реален път
function brokenPaths() {
  const hits = [];
  const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !NOT_AGENT_DEF.has(f));
  for (const f of files) {
    const txt = readFileSync(join(AGENTS_DIR, f), "utf8");
    for (const m of txt.matchAll(PATH_RE)) {
      const p = m[1];
      if (IGNORE_PATH.test(p)) continue;
      // допусни път-до-директория и конкретен файл; отреж евентуален :ред суфикс
      const clean = p.replace(/:\d+$/, "");
      if (!existsSync(join(ROOT, clean))) hits.push({ file: f, path: p });
    }
  }
  return hits;
}

// --- СЪВЕТ: memory↔domain дрейф ---------------------------------------------
// Сигналът е ТЯСЪН нарочно: конкретен render-source път, не общ термин (three.js в правен/ревю контекст
// е легитимно). Плюс ИЗКЛЮЧВАМЕ крос-режещите агенти (ревю/право/аналитика/тест/качество) — те
// легитимно цитират кода на ВСЕКИ продукт, там cross-domain е нормално, не дрейф.
const DOMAIN_SIGNALS = [
  { owner: "dizayner", re: /apps\/web\/src\/features\/game\/(gl|ludo|magnat|backgammon)/i, label: "game-rendering source (домейн на Дизайнера)" },
];
const CROSS_CUTTING = new Set(["kodadjiyata", "kachestveniyat", "pravniyat-razbirach", "analizatora", "izpitatelya", "razbivacha", "seo", "letopisetsa", "prevodach"]);
function memoryDrift() {
  const hits = [];
  const ids = readdirSync(MEM_DIR).filter((f) => f.endsWith(".md") && !NOT_AGENT_MEM.has(f) && !f.startsWith(".")).map((f) => f.replace(/\.md$/, ""));
  for (const id of ids) {
    if (CROSS_CUTTING.has(id)) continue; // крос-режещ агент — cross-domain е легитимно
    const bullets = sectionBullets(readFileSync(join(MEM_DIR, id + ".md"), "utf8"), "Проверени поуки");
    for (const b of bullets) {
      for (const sig of DOMAIN_SIGNALS) {
        if (sig.owner !== id && sig.re.test(b)) {
          hits.push({ agent: id, owner: sig.owner, signal: sig.label, excerpt: b.replace(/^\-\s*/, "").slice(0, 90) });
        }
      }
    }
  }
  return hits;
}

// --- ТВЪРДА: consistency на бройката/ростера (бройка-дрейфът е доказан рецидивен клас грешки) ---
// Каноничният брой = agents.json. Проверяваме, че settings matcher-ите и човеко-четимите бройки
// в CLAUDE.md/README.md/_orchestration.md съвпадат — иначе документите лъжат за размера на екипа.
const EN = { "twenty-one": 21, "twenty-two": 22, "twenty-three": 23, "twenty-four": 24, "twenty-five": 25, "twenty-six": 26, "twenty-seven": 27, "twenty-eight": 28, "twenty-nine": 29, thirty: 30, "thirty-one": 31, "thirty-two": 32 };
const BG_ONES = { еднате: 1, еднат: 1, двете: 2, трите: 3, четирите: 4, петте: 5, шестте: 6, седемте: 7, осемте: 8, деветте: 9 };
function countConsistency() {
  const aj = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  const ids = new Set(aj.agents.map((a) => a.id));
  const N = ids.size;
  const hits = [];
  const read = (p) => { try { return readFileSync(join(ROOT, p), "utf8"); } catch { return ""; } };

  // 1) settings.json hook matcher-и == точния id набор (липсващ агент = счупен памет-цикъл).
  try {
    const sj = JSON.parse(read(".claude/settings.json"));
    for (const ev of ["SubagentStart", "SubagentStop"]) for (const h of (sj.hooks?.[ev] || [])) {
      if (typeof h.matcher !== "string") continue;
      const set = new Set(h.matcher.split("|"));
      const missing = [...ids].filter((x) => !set.has(x)), extra = [...set].filter((x) => !ids.has(x));
      if (missing.length || extra.length) hits.push({ file: ".claude/settings.json", what: `${ev} matcher`, detail: `липсват: ${missing.join(",") || "—"} · излишни: ${extra.join(",") || "—"}` });
    }
  } catch { /* */ }

  // 2) човеко-четими бройки → число, сравни с N.
  const checkNum = (file, label, num) => { if (num != null && num !== N) hits.push({ file, what: label, detail: `казва ${num}, а са ${N}` }); };
  const claude = read("CLAUDE.md");
  checkNum("CLAUDE.md", "purpose-built subagents", (claude.match(/(\d+)\s+purpose-built subagents/) || [])[1] | 0 || null);
  for (const m of claude.matchAll(/(\d+)\s+(?:агента|agents|subagents)\b/g)) { const n = +m[1]; if (n >= 18 && n <= 40) checkNum("CLAUDE.md", `„${m[0]}"`, n); }

  const readme = read(".claude/agents/README.md");
  const enM = readme.match(/(twenty-\w+|thirty(?:-\w+)?)\s+agents/i);
  if (enM) checkNum(".claude/agents/README.md", `„${enM[0]}"`, EN[enM[1].toLowerCase()] ?? null);
  for (const m of readme.matchAll(/(\d+)\s+agents\b/g)) { const n = +m[1]; if (n >= 18 && n <= 40) checkNum(".claude/agents/README.md", `„${m[0]}"`, n); }

  const orch = read(".claude/agents/_orchestration.md");
  const bgM = orch.match(/(Двадесет|Тридесет)\s+и\s+(\S+?те)\s+агента/);
  if (bgM) { const base = bgM[1].toLowerCase() === "тридесет" ? 30 : 20; const ones = BG_ONES[bgM[2].toLowerCase()]; if (ones != null) checkNum(".claude/agents/_orchestration.md", `„${bgM[0]}"`, base + ones); }
  for (const m of orch.matchAll(/(\d+)\s+агента\b/g)) { const n = +m[1]; if (n >= 18 && n <= 40) checkNum(".claude/agents/_orchestration.md", `„${m[0]}"`, n); }

  return { N, hits };
}

const broken = brokenPaths();
const drift = memoryDrift();
const cons = countConsistency();

if (JSON_OUT) { console.log(JSON.stringify({ brokenPaths: broken, memoryDrift: drift, countConsistency: cons.hits }, null, 2)); process.exit(broken.length || cons.hits.length ? 1 : 0); }

console.log(`\n🧭 Drift-lint на агентския слой\n`);
if (!broken.length) console.log("  ✓ файлови референции: нула счупени пътища в дефинициите");
else { console.log(`  ✗ ${broken.length} СЧУПЕНИ файлови референции (сочат несъществуващ път):`); for (const h of broken) console.log(`      ${h.file}: \`${h.path}\``); }
if (!cons.hits.length) console.log(`  ✓ consistency: бройката/ростерът съвпадат навсякъде (${cons.N} агента)`);
else { console.log(`  ✗ ${cons.hits.length} НЕсъответствия в бройката/ростера (каноничен = ${cons.N}):`); for (const h of cons.hits) console.log(`      ${h.file} · ${h.what}: ${h.detail}`); }
if (!drift.length) console.log("  ✓ memory↔domain: нула чужди поуки в паметите");
else { console.log(`  ⚠ ${drift.length} възможен memory↔domain дрейф (съвет — премести при собственика):`); for (const h of drift) console.log(`      ${h.agent} ← ${h.signal}: „${h.excerpt}…" (→ ${h.owner})`); }

const hard = broken.length + cons.hits.length;
const soft = drift.length;
console.log(`\nИтог: ${hard} твърди · ${soft} съвети · ${hard || (STRICT && soft) ? "ДРЕЙФ" : "чисто"}\n`);
process.exit(hard || (STRICT && soft) ? 1 : 0);
