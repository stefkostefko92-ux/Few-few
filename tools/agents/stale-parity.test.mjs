// stale-parity.test.mjs — ЕДНА дефиниция за „просрочена поука", не две.
//
// Дефектът (измерен 2026-09-08): `oversee` казваше 3409/4031 (85%) „застарели" по своя евристика
// (регекс за версия/година + 45 дни), а `memory-freshness` — гейтът — казваше 0 просрочени по
// класове (наш код 90 · платформа 180 · рамка 365 · стандарт 730 · без външен източник → не изтича)
// В ЕДИН И СЪЩ ДЕН. Същата евристика беше преписана и в `curate.mjs`. Две истини за едно понятие
// произвеждат тих отпад — същият клас като source-parity / secret-parity. Тестът държи гейта
// единствен източник и сверява, че двата консуматора дават СЪЩОТО число върху реалната памет.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(ROOT, p), "utf8");

test("oversee и curate ползват classify() на memory-freshness — не своя евристика", () => {
  for (const f of ["tools/agents/oversee.mjs", "tools/memory/curate.mjs"]) {
    const s = src(f);
    assert.match(s, /import \{ classify \} from "[./]+\/(agents\/)?memory-freshness\.mjs"/, `${f} трябва да импортира classify`);
    assert.ok(!/TIME_SENSITIVE|STALE_DAYS/.test(s), `${f} не бива да носи втора дефиниция`);
  }
  assert.ok(!/export const (STALE_DAYS|TIME_SENSITIVE)/.test(src("tools/agents/oversee-lib.mjs")),
    "oversee-lib не бива да експортира мъртвата евристика (иначе тя се връща)");
});

test("върху реалната памет: oversee и memory-freshness дават ЕДНО число за просрочените", () => {
  const run = (args) => {
    const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const i = r.stdout.indexOf("{");
    return JSON.parse(r.stdout.slice(i));
  };
  const ov = run(["tools/agents/oversee.mjs", "--json"]);
  const mf = run(["tools/agents/memory-freshness.mjs", "--json"]);
  const overseeStale = ov.agents.reduce((s, a) => s + (a.stale || 0), 0);
  assert.equal(overseeStale, mf.overdue, `oversee=${overseeStale} · memory-freshness=${mf.overdue} — двете трябва да съвпадат`);
});
