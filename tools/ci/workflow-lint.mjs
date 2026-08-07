#!/usr/bin/env node
// tools/ci/workflow-lint.mjs
// Гейт върху самите GitHub Actions workflow-и. Zero-dep, fail-closed.
//
// ЗАЩО СЪЩЕСТВУВА — засечено на живо (07.08.2026)
// Стъпката `gitleaks (история, best-effort)` ЗАКЪСА за 10+ минути и остави
// цялата проверка „in progress". Тя носеше `continue-on-error: true`, което
// покрива ПРОВАЛ, но не ЗАВИСВАНЕ: висяща стъпка не се проваля, тя просто не
// свършва. Подразбиращият се таван на GitHub е 360 МИНУТИ, значи best-effort
// слой можеше да блокира сливането шест часа, без нищо да е счупено.
// Одитът показа, че 28 от 28 job-а в репото нямаха таван.
//
// Правила:
//   1. всеки job носи `timeout-minutes` (никога „in progress" завинаги);
//   2. `concurrency` с `cancel-in-progress` — иначе стари пускания държат
//      слотове и объркват коя проверка е актуалната;
//   3. `permissions` на ниво workflow — подразбиращият се GITHUB_TOKEN е
//      прекалено щедър (least privilege).
//
// Правило 1 ГЕЙТВА. 2 и 3 се докладват — има легитимни изключения (напр.
// workflow, който нарочно не се отменя), а гейт без изключения ражда заобикаляне.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = ".github/workflows";
const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).sort();

const hard = [];
const soft = [];

/** Груб, но достатъчен парсър: job-овете са с отстъп 2 под `jobs:`. */
function jobsOf(src) {
  const i = src.indexOf("\njobs:");
  if (i < 0) return [];
  const body = src.slice(i + "\njobs:".length);
  const out = [];
  const re = /\n {2}([A-Za-z0-9_-]+):\n((?: {4}.*\n|\n)*)/g;
  let m;
  while ((m = re.exec(body))) out.push({ name: m[1], body: m[2] });
  return out;
}

for (const file of files) {
  const src = readFileSync(join(DIR, file), "utf-8");

  for (const job of jobsOf(src)) {
    if (!/^\s{4}timeout-minutes:\s*\d+/m.test(job.body)) {
      hard.push(`${file} → job „${job.name}“ няма timeout-minutes (таван на GitHub: 360 мин)`);
    }
  }

  if (!/^concurrency:/m.test(src)) {
    soft.push(`${file}: няма concurrency група`);
  } else if (!/cancel-in-progress:\s*true/.test(src)) {
    soft.push(`${file}: concurrency без cancel-in-progress`);
  }
  if (!/^permissions:/m.test(src)) {
    soft.push(`${file}: няма изричен permissions блок (least privilege)`);
  }
}

if (soft.length) {
  console.log(`workflow-lint — ${soft.length} бележки (не гейтват):`);
  for (const s of soft) console.log(`  · ${s}`);
  console.log("");
}

if (hard.length) {
  console.error(`workflow-lint: ${hard.length} нарушения`);
  for (const h of hard) console.error(`  ✗ ${h}`);
  console.error(
    "\nВисяща стъпка не се проваля — тя не свършва. `continue-on-error` НЕ помага.\n" +
    "Сложи `timeout-minutes:` под `runs-on:` на всеки job.",
  );
  process.exit(1);
}

console.log(`✓ workflow-lint: чисто — ${files.length} workflow-а, всеки job с таван на времето.`);
