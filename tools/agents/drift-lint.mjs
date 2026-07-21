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

const broken = brokenPaths();
const drift = memoryDrift();

if (JSON_OUT) { console.log(JSON.stringify({ brokenPaths: broken, memoryDrift: drift }, null, 2)); process.exit(broken.length ? 1 : 0); }

console.log(`\n🧭 Drift-lint на агентския слой\n`);
if (!broken.length) console.log("  ✓ файлови референции: нула счупени пътища в дефинициите");
else { console.log(`  ✗ ${broken.length} СЧУПЕНИ файлови референции (сочат несъществуващ път):`); for (const h of broken) console.log(`      ${h.file}: \`${h.path}\``); }
if (!drift.length) console.log("  ✓ memory↔domain: нула чужди поуки в паметите");
else { console.log(`  ⚠ ${drift.length} възможен memory↔domain дрейф (съвет — премести при собственика):`); for (const h of drift) console.log(`      ${h.agent} ← ${h.signal}: „${h.excerpt}…" (→ ${h.owner})`); }

const hard = broken.length;
const soft = drift.length;
console.log(`\nИтог: ${hard} твърди · ${soft} съвети · ${hard || (STRICT && soft) ? "ДРЕЙФ" : "чисто"}\n`);
process.exit(hard || (STRICT && soft) ? 1 : 0);
