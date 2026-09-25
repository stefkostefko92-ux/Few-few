// json-pipe.test.mjs — `--json` трябва да оцелява през ТРЪБА, не само към файл.
//
// ДЕФЕКТЪТ: `console.log(JSON.stringify(huge)); process.exit(0)` реже изхода на 65 536 байта,
// когато stdout е тръба. Записът в Node е асинхронен за тръби; `process.exit` не чака буфера.
// Към ФАЙЛ същият код работи (файловите записи са синхронни) — затова е невидим при ръчна проверка.
// Измерено: quarantine-review даваше 544 528 байта към файл и 65 536 през тръба. 88% тихо изчезваха,
// а CI и таблото четат ТОЧНО през тръба.
//
// Тестът чете през реална тръба — така хваща и всеки БЪДЕЩ инструмент, който прехвърли лимита.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Всеки инструмент, който обявява `--json`. Четем ГИ ПРЕЗ ТРЪБА (`| cat`), не към файл.
const JSON_TOOLS = [
  ["tools/memory/quarantine-review.mjs", ["--json"]],
  ["tools/agents/oversee.mjs", ["--json"]],
  ["tools/agents/token-budget.mjs", ["--json"]],
  ["tools/agents/deep-audit.mjs", ["--json"]],
  ["tools/agents/flow-cost.mjs", ["--json"]],
  ["tools/agents/coverage.mjs", ["--json"]],
  ["tools/agents/defect-rate.mjs", ["--json"]],
  ["tools/agents/trajectory-audit.mjs", ["--json"]],
  ["tools/qa/test-audit.mjs", [".", "--json"]],
  ["tools/docs/doc-audit.mjs", [".", "--json"]],
];

for (const [rel, args] of JSON_TOOLS) {
  test(`${rel} --json оцелява през ТРЪБА (не се реже на 64 KiB)`, () => {
    // `| cat` прави stdout истинска тръба — точно както го четат CI и таблото.
    const out = execSync(`node ${JSON.stringify(join(ROOT, rel))} ${args.map((a) => JSON.stringify(a)).join(" ")} | cat`,
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(out); },
      `${rel}: JSON-ът е отрязан през тръба (${out.length} байта). Ползвай tools/lib/emit.mjs — ` +
      `\`console.log(...)\` + \`process.exit()\` губи всичко над 65 536 байта.`);
    assert.equal(typeof parsed, "object");
    assert.notEqual(parsed, null);
  });
}

test("emitJson доставя >64 KiB цели през тръба, а старият патърн — не", () => {
  const dir = mkdtempSync(join(tmpdir(), "jsonpipe-"));
  try {
    const big = { rows: Array.from({ length: 4000 }, (_, i) => ({ i, pad: "щ".repeat(40) })) };
    const payload = JSON.stringify(big);
    assert.ok(payload.length > 65536, `образецът трябва да е над лимита, а е ${payload.length}`);

    // СТАРИЯТ патърн — реже се.
    const bad = join(dir, "bad.mjs");
    writeFileSync(bad, `const d=${JSON.stringify(big)};console.log(JSON.stringify(d));process.exit(0);`);
    const badOut = execSync(`node ${JSON.stringify(bad)} | cat`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.throws(() => JSON.parse(badOut), "старият патърн ТРЯБВА да се реже — иначе тестът не доказва нищо");

    // НОВИЯТ — цял.
    const good = join(dir, "good.mjs");
    writeFileSync(good, `import { emitJson } from ${JSON.stringify(join(ROOT, "tools/lib/emit.mjs"))};\n` +
      `emitJson(${JSON.stringify(big)}, 0);`);
    const goodOut = execSync(`node ${JSON.stringify(good)} | cat`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const parsed = JSON.parse(goodOut);
    assert.equal(parsed.rows.length, 4000, "всички редове трябва да пристигнат");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("emitJson задава изходния код, без да убива процеса", () => {
  const dir = mkdtempSync(join(tmpdir(), "jsonexit-"));
  try {
    const f = join(dir, "x.mjs");
    writeFileSync(f, `import { emitJson } from ${JSON.stringify(join(ROOT, "tools/lib/emit.mjs"))};\nemitJson({ ok: false }, 1);`);
    const r = spawnSync(process.execPath, [f], { encoding: "utf8" });
    assert.equal(r.status, 1, "кодът на изход се запазва");
    assert.deepEqual(JSON.parse(r.stdout), { ok: false });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
