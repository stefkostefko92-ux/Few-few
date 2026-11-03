#!/usr/bin/env node
// version-freshness.mjs — агентите работят с ДНЕШНИТЕ версии, не с 2–3 годишни спомени.
//
// Две истини, две проверки:
//   РЕПО-истина  — какво пинват продуктите (чете се ЖИВО от package.json при всеки рън; не се
//                  съхранява — съхранената щеше да остарее като всичко останало). Агент, който
//                  работи ПО продукт, говори версията на продукта.
//   СВЕТОВНА     — последното стабилно (tools/agents/versions.json, всеки запис с checkedAt).
//                  Агент, който СЪВЕТВА (ъпгрейд, ново решение), стъпва на нея.
//
// ГЕЙТЪТ (offline, в gate.mjs): запис с изтекъл TTL = ТВЪРД провал. Така „знанието е свежо"
// не е обещание, а насрочено задължение — червеният гейт КАЗВА да пуснеш --refresh.
// РАДАРЪТ (advisory): продукт на мажор назад от световната истина. Ъпгрейдът е решение на
// собственика per продукт — радарът го прави ВИДИМО, не го налага.
//
//   node tools/agents/version-freshness.mjs             # проверка + радар (offline)
//   node tools/agents/version-freshness.mjs --check     # same, за gate.mjs (fail-closed)
//   node tools/agents/version-freshness.mjs --refresh   # ЖИВО: npm registry → versions.json
//   node tools/agents/version-freshness.mjs --json      # машинно четим изход
//
// Исторически факти („MV2 умря", „EN 301 549 V3.2.1 цитира WCAG 2.1") НЕ се следят тук —
// те не остаряват. Сляпото вдигане на числа в чужд текст поврежда верни факти.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitJsonNow } from "../lib/emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REG = join(ROOT, "tools", "agents", "versions.json");
const argv = process.argv.slice(2);
const TODAY = process.env.OVERSEE_TODAY || new Date().toISOString().slice(0, 10);

export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
export const major = (v) => { const m = String(v || "").match(/(\d+)/); return m ? Number(m[1]) : null; };

/** Изтекли записи: без checkedAt = веднага изтекъл (не „вечно валиден"). */
export function ttlBreaches(reg, today = TODAY) {
  const def = reg.ttlDays || 45;
  return (reg.entries || []).filter((e) => {
    if (!e.checkedAt) return true;
    return daysBetween(e.checkedAt, today) > (e.ttlDays || def);
  }).map((e) => ({ id: e.id, checkedAt: e.checkedAt || "НИКОГА", ttl: e.ttlDays || def }));
}

/** РЕПО-истина: продукт → { пакет: пинната версия } от всички package.json (без node_modules). */
export function repoPins(root = ROOT) {
  const pins = {};
  const walk = (dir, depth) => {
    if (depth > 3) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name === "package.json") {
        try {
          const j = JSON.parse(readFileSync(p, "utf8"));
          const product = p.slice(root.length + 1).split("/")[0];
          for (const [k, v] of Object.entries({ ...j.dependencies, ...j.devDependencies }))
            (pins[k] ??= {})[product] = v;
        } catch { /* счупен manifest се хваща от продуктовия CI, не тук */ }
      }
    }
  };
  walk(root, 0);
  return pins;
}

/** Радар: продукти на мажор (или повече) зад световната истина. Advisory — решение на човек. */
export function upgradeRadar(reg, pins) {
  const out = [];
  for (const e of reg.entries || []) {
    if (!e.npm) continue;
    const world = major(e.current);
    for (const [product, pinned] of Object.entries(pins[e.npm] || {})) {
      const have = major(pinned);
      if (world != null && have != null && have < world)
        out.push({ pkg: e.npm, product, pinned, world: e.current, behindMajors: world - have });
    }
  }
  return out.sort((a, b) => b.behindMajors - a.behindMajors || a.pkg.localeCompare(b.pkg));
}

async function refresh(reg) {
  let changed = 0;
  for (const e of reg.entries) {
    if (!e.npm) continue;
    try {
      const r = await fetch(`https://registry.npmjs.org/${encodeURIComponent(e.npm)}/latest`, { signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      if (j.version && j.version !== e.current) { console.log(`  ${e.id}: ${e.current} → ${j.version}`); e.current = j.version; changed++; }
      e.checkedAt = TODAY;
    } catch (err) {
      // недостъпен registry НЕ подновява checkedAt — иначе „освежих", без да съм проверил
      console.error(`  ✘ ${e.id}: ${err.message} (checkedAt остава ${e.checkedAt})`);
    }
  }
  const manualStale = reg.entries.filter((x) => x.manual && daysBetween(x.checkedAt, TODAY) > (x.ttlDays || reg.ttlDays));
  for (const m of manualStale) console.log(`  ⚠ ръчен запис „${m.id}" чака ЖИВА сверка срещу: ${m.source}`);
  writeFileSync(REG, JSON.stringify(reg, null, 2) + "\n");
  return { changed, manualStale: manualStale.map((m) => m.id) };
}

async function main() {
  if (!existsSync(REG)) { console.error("липсва tools/agents/versions.json"); process.exit(2); }
  const reg = JSON.parse(readFileSync(REG, "utf8"));

  if (argv.includes("--refresh")) {
    console.log(`🔄 Живо освежаване (npm registry) — ${TODAY}`);
    const r = await refresh(reg);
    console.log(`✓ ${r.changed} обновени · ${reg.entries.length} записа · ръчни за сверка: ${r.manualStale.length ? r.manualStale.join(", ") : "няма"}`);
    return;
  }

  const breaches = ttlBreaches(reg);
  const pins = repoPins();
  const radar = upgradeRadar(reg, pins);

  if (argv.includes("--json")) await emitJsonNow({ today: TODAY, breaches, radar, entries: reg.entries.length }, breaches.length ? 1 : 0);

  console.log(`\n📅 Версийна свежест — ${reg.entries.length} записа · ${TODAY}\n`);
  if (breaches.length) {
    console.log(`✗ ${breaches.length} записа с ИЗТЕКЛА проверка (знанието вече е спомен, не факт):`);
    for (const b of breaches) console.log(`    ${b.id} — проверен ${b.checkedAt}, TTL ${b.ttl} дни → пусни --refresh (npm) / жива сверка (ръчните)`);
  } else {
    console.log("✓ всички записи са проверени в рамките на TTL — световната истина е свежа.");
  }
  if (radar.length) {
    console.log(`\n📡 Радар (advisory — ъпгрейдът е решение на собственика per продукт):`);
    for (const r of radar) console.log(`    ${r.pkg.padEnd(12)} ${r.product.padEnd(18)} пин ${String(r.pinned).padEnd(10)} свят ${r.world}  (${r.behindMajors} мажора назад)`);
  }
  process.exitCode = breaches.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
