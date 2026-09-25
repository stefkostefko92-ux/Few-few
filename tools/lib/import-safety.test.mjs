// import-safety.test.mjs — траен гейт срещу класа „CLI код на върха на модула".
//
// Дефектът (удари ТРИ пъти: syntax-check → 1/5 теста; prelaunch-audit — валидация с exit на
// върха; rubric — import преди shebang): файл, който е ЕДНОВРЕМЕННО изпълним и внасян, изпълнява
// върховия си код при `import`. В тест-рънъра това значи: печата боклук, или направо убива
// процеса с process.exit — и пакетът изглежда зелен, защото е СПРЯЛ, не защото е минал.
//
// Статичният grep за guard-а е крехък (шаблонът може да се напише по N начина). Тук пробата е
// ДИНАМИЧНА: всеки модул, който някой наш файл внася, се import-ва в чист подпроцес и трябва:
//   1) да излезе с код 0 (никакъв process.exit по пътя);
//   2) да НЕ печата нищо на stdout (страничен ефект = CLI код се е изпълнил).
// stderr се толерира (warning-и на Node не са наша работа).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function allMjs(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) allMjs(rel, out);
    else if (e.name.endsWith(".mjs")) out.push(rel);
  }
  return out;
}

// Кой се внася отнякъде? (тестове + инструменти + hooks)
const imported = new Set();
for (const rel of [...allMjs("tools"), ...allMjs(".claude/hooks")]) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  for (const m of src.matchAll(/from\s+"(\.[^"]+\.mjs)"/g)) {
    const target = normalize(join(dirname(rel), m[1]));
    if (existsSync(join(ROOT, target)) && !target.endsWith(".test.mjs")) imported.add(target);
  }
}

test("всеки внасян модул е БЕЗОПАСЕН за import — не печата, не излиза, не се срива", () => {
  const targets = [...imported].sort();
  assert.ok(targets.length >= 30, `очаквах ≥30 внасяни модула, намерих ${targets.length}`);
  const offenders = [];
  for (const rel of targets) {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e",
      `await import(${JSON.stringify("file://" + join(ROOT, rel))});`],
      { encoding: "utf8", timeout: 20000, cwd: ROOT });
    if (r.status !== 0) offenders.push(`${rel}: изход ${r.status} при import — ${(r.stderr || "").split("\n")[0]}`);
    else if ((r.stdout || "").length) offenders.push(`${rel}: печата ${r.stdout.length} байта при import (CLI код на върха)`);
  }
  assert.deepEqual(offenders, [], `тези модули имат странични ефекти при import:\n  ${offenders.join("\n  ")}`);
});
