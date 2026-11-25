// memory-recall.test.mjs — трудният режим (задачата = само обхватът) и правилото за общ обхват.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scopeOf, measureScopes } from "./memory-recall.mjs";
import { genericScope } from "../lib/lesson-scope.mjs";

const L = (d, text, scope) => `- **${d}** ${text} _(${scope}; verified; src/x.ts:1)_`;

test("scopeOf чете последната мета-опашка, не `_(` в текста", () => {
  assert.equal(scopeOf(L("2026-10-01", "викай fn_(a) преди запис", "seed скрипт на zabobovdol")), "seed скрипт на zabobovdol");
  assert.equal(scopeOf("- **2026-10-01** без мета"), "");
});

test("genericScope: празно, общ етикет, продукт и име на агента са общи; ситуация, тема и път не са", () => {
  assert.equal(genericScope(""), "липсва");
  assert.equal(genericScope("„общо“"), "общ етикет");
  assert.equal(genericScope("global"), "общ етикет");
  assert.equal(genericScope("project:"), "общ етикет");
  assert.equal(genericScope("zabobovdol"), "само продуктът");
  assert.equal(genericScope("siydara", "siydara"), "името на агента");
  for (const s of ["upsert в seed скрипт на zabobovdol", "stripe-webhooks", "playwright/ci", "project:tools/3d", "tools/fivem/manifest-lint.mjs", "калибрация"])
    assert.equal(genericScope(s), null, s);
});

test("measureScopes: конкретният обхват стига, общият се брои като дълг, не като пропуск", () => {
  const dir = mkdtempSync(join(tmpdir(), "recall-"));
  const lessons = [
    L("2026-10-01", "upsert по уникален slug, иначе дубли при втори seed", "upsert в seed скрипт на zabobovdol"),
    L("2026-10-02", "телефоните на общината се сверяват с официалния сайт", "телефони на общински служби"),
    L("2026-10-03", "нещо общо за продукта", "zabobovdol"),
    L("2026-10-04", "нещо за агента", "siydara"),
  ];
  writeFileSync(join(dir, "siydara.md"), `# Сийдъра\n\n## Проверени поуки\n${lessons.join("\n")}\n`);
  writeFileSync(join(dir, "_shared.md"), `## Проверени поуки\n${L("2026-10-01", "x", "y z")}\n`);
  const r = measureScopes(dir, { today: "2026-10-31" });
  assert.equal(r.rows.length, 1, "_shared не се брои като агент");
  assert.equal(r.judged, 2);
  assert.equal(r.vague, 2);
  assert.equal(r.recall, 1);
  assert.equal(r.vagueShare, 0.5);
});
