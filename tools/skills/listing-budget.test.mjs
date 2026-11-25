// listing-budget.test.mjs — нашите умения се побират в бюджета на списъка (иначе описанията им се режат и не се
// задействат сами; измерено 19.11.2026: stripe-payment и revolut-payment бяха без описание).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listingBudget, listingChars, DESC_CAP } from "./trigger-check.mjs";

test("бюджетът на проекта побира нашите умения с място за вградените и синхронизираните", () => {
  const b = listingBudget();
  assert.ok(b.ok, `нашите ${b.ours} знака > таван ${b.limit} при skillListingBudgetFraction ${b.fraction}`);
  assert.ok(b.fraction >= 0.02, "под 2% измереният общ списък (~51 000 знака) не се побира");
});

test("броенето: таван 1536 на умение, ръчните (disable-model-invocation) не се броят, липсваща настройка = 1%", () => {
  const dir = mkdtempSync(join(tmpdir(), "skills-"));
  try {
    const mk = (n, fm) => { mkdirSync(join(dir, n)); writeFileSync(join(dir, n, "SKILL.md"), `---\nname: ${n}\n${fm}\n---\nтяло\n`); };
    mk("a", `description: ${"д".repeat(3000)}`);
    mk("b", "description: кратко\ndisable-model-invocation: true");
    mk("c", "description: кратко\nwhen_to_use: при нужда");
    const { chars, listed } = listingChars(dir);
    assert.equal(listed, 2);
    assert.equal(chars, DESC_CAP + 1 + 4 + "кратко при нужда".length + 1 + 4);
    const b = listingBudget(join(dir, "няма.json"), dir);
    assert.equal(b.fraction, 0.01);
    assert.equal(b.budget, 30000);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
