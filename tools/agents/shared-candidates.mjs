#!/usr/bin/env node
// shared-candidates.mjs — намира поуки, ДУБЛИРАНИ през много лични памети → кандидати за `_shared.md`.
//
// Защо (токен-лост): поука, повторена в личната памет на K агента, се инжектира и плаща **K пъти**.
// Същата поука в `_memory/_shared.md` се инжектира ВЕДНЪЖ и е част от кешируемия статичен префикс
// (чете се на ~0.1×). Промоцията на крос-режещото знание маха дублирането през флота — по-малко токени
// на всеки старт И знанието циркулира, не тъне в силоз. Само ДОКЛАДВА (човек решава промоцията —
// закон: не пренаписвай памет мълчаливо). Собственик на решението: AI-джията.
//
//   node tools/agents/shared-candidates.mjs           # четим отчет
//   node tools/agents/shared-candidates.mjs --json
//   node tools/agents/shared-candidates.mjs --min 3    # праг: поука в ≥N агента (по подр. 3)

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { jaccard, sectionBullets, MERGE_THRESHOLD } from "./oversee-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MEM_DIR = join(ROOT, ".claude", "agents", "_memory");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const MIN = (() => { const i = argv.indexOf("--min"); return i >= 0 && argv[i + 1] ? Math.max(2, parseInt(argv[i + 1], 10) || 3) : 3; })();
// Праг за „същата поука" през агенти — по-хлабав от точен дубъл, по-строг от общ SIM (истинска редундантност).
const CLUSTER_SIM = MERGE_THRESHOLD; // 0.82

const NOT_AGENT = new Set(["SECURITY.md", "PROTOCOL.md", "PROCEDURE.md", "_shared.md"]);
const ids = readdirSync(MEM_DIR).filter((f) => f.endsWith(".md") && !NOT_AGENT.has(f) && !f.startsWith(".")).map((f) => f.replace(/\.md$/, ""));

// Вече в _shared? Не го предлагай пак.
const sharedBullets = existsSync(join(MEM_DIR, "_shared.md")) ? sectionBullets(readFileSync(join(MEM_DIR, "_shared.md"), "utf8"), "Споделени поуки") : [];
const alreadyShared = (b) => sharedBullets.some((s) => jaccard(s, b) >= CLUSTER_SIM);

// Събери всички лични поуки с техния собственик.
const items = [];
for (const id of ids) {
  const f = join(MEM_DIR, id + ".md");
  for (const b of sectionBullets(readFileSync(f, "utf8"), "Проверени поуки")) items.push({ id, b });
}

// Клъстеризирай близките поуки (прост single-pass съюз по Jaccard≥CLUSTER_SIM).
const clusters = [];
for (const it of items) {
  let hit = null;
  for (const c of clusters) if (jaccard(c.rep, it.b) >= CLUSTER_SIM) { hit = c; break; }
  if (hit) { hit.members.push(it); hit.agents.add(it.id); }
  else clusters.push({ rep: it.b, members: [it], agents: new Set([it.id]) });
}

// Кандидат = клъстер, покрит от ≥MIN РАЗЛИЧНИ агента и още не е в _shared.
const candidates = clusters
  .filter((c) => c.agents.size >= MIN && !alreadyShared(c.rep))
  .map((c) => ({ agents: [...c.agents].sort(), count: c.agents.size, example: c.rep.replace(/^\-\s*/, "").slice(0, 160) }))
  .sort((a, b) => b.count - a.count);

if (JSON_OUT) { console.log(JSON.stringify({ min: MIN, candidates }, null, 2)); process.exit(0); }

console.log(`\n🔗 Кандидати за промоция към _shared (поука в ≥${MIN} агента → инжектирай веднъж, кеширано)\n`);
if (!candidates.length) { console.log("  Няма — крос-режещото знание вече е в _shared или под прага. Чисто.\n"); process.exit(0); }
for (const c of candidates) {
  console.log(`  ▲ ${c.count} агента [${c.agents.join(", ")}]`);
  console.log(`    „${c.example}…"\n`);
}
console.log(`Промоцията е ЧОВЕШКО решение (маркирай с scope: споделено в learn или премести ръчно). Пести токени на всеки старт.\n`);
process.exit(0);
