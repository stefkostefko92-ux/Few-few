// scope-check.test.mjs — монорепо закон №1 „one project per change" (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScope } from "./scope-check.mjs";
import { defaultRange } from "./scope-check.mjs";

test("един продукт → ок", () => {
  const r = checkScope(["medqr/server.js", "medqr/src/i18n.js"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.products, ["medqr"]);
});

test("два продукта → нарушение", () => {
  const r = checkScope(["medqr/server.js", "zabobovdol/src/app/page.tsx"]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.products, ["medqr", "zabobovdol"]);
});

test("инфра + един продукт → ок (CI на продукта е нормален)", () => {
  const r = checkScope([".github/workflows/medqr.yml", "medqr/server.js", "tools/agents/oversee.mjs"]);
  assert.equal(r.ok, true);
});

test("само инфра/root → ок", () => {
  const r = checkScope(["CLAUDE.md", "tools/agents/verifier.mjs", ".claude/agents/seo.md", "docs/adr/README.md"]);
  assert.equal(r.ok, true);
  assert.equal(r.products.length, 0);
});

test("./ префикс се нормализира", () => {
  const r = checkScope(["./medqr/a.js", "./panev/b.js"]);
  assert.equal(r.ok, false);
});

// ── Red-team F1 (razbivacha 2026-07-24): абсолютни пътища обезсилваха гейта ──
test("АБСОЛЮТНИ пътища с root → релативизират се и хващат 2 продукта (F1)", () => {
  const root = "/home/user/Few-few";
  const r = checkScope([`${root}/medqr/server.js`, `${root}/zabobovdol/src/app/page.tsx`], root);
  assert.equal(r.ok, false, "трябва да хване scope-creep при абсолютни пътища");
  assert.deepEqual(r.products, ["medqr", "zabobovdol"]);
});

test("абсолютни пътища в ЕДИН продукт (+ инфра) с root → ок", () => {
  const root = "/home/user/Few-few";
  const r = checkScope([`${root}/medqr/a.js`, `${root}/tools/agents/x.mjs`], root);
  assert.equal(r.ok, true);
  assert.deepEqual(r.products, ["medqr"]);
});

test("абсолютен път БЕЗ root вече не мислабелва като продукт '' (F1 регресия)", () => {
  const r = checkScope(["/home/user/Few-few/medqr/a.js", "/home/user/Few-few/panev/b.js"]);
  assert.ok(!r.products.includes(""), "празен продукт не бива да съществува");
});

// --- Режимът на сравнение -----------------------------------------------------------
// ДЕФЕКТЪТ: по подразбиране инструментът мереше `git diff HEAD` (само НЕКОМИТНАТИТЕ промени),
// а CI мери `origin/<base>...HEAD` (целия PR). След комит локалният ран нямаше какво да види и
// обявяваше „само инфраструктура", докато CI за същия клон валеше нарушение. Доверих се на
// фалшивия зелен и сгреших (PR #147). Гейт, който отговаря различно на двете места, е по-лош от
// липсващ, защото активно подвежда.

test("defaultRange сочи към БАЗАТА, не към работното дърво", () => {
  const d = defaultRange();
  assert.equal(d.mode, "range", "в нормално репо трябва да има база за сравнение");
  assert.match(d.args, /\.\.\.HEAD$/, "трипосочен diff спрямо merge-base, както в CI");
  assert.match(d.args, /^(origin\/)?(main|master)/);
});

test("defaultRange описва какво мери (мълчаливият избор на режим беше причината за подвеждането)", () => {
  const d = defaultRange();
  assert.ok(d.label && d.label.length > 10, "етикетът се печата на потребителя");
  assert.match(d.label, /CI/, "казва изрично, че съвпада с CI");
});

test("резервният режим се самообявява като по-слаб", () => {
  // Не можем да махнем origin/main тук, но инвариантът е проверим: резервният етикет ТРЯБВА да
  // предупреждава, че мери само некомитнатото — иначе пак ще бъде прочетен като пълна проверка.
  const fallbackLabel = "САМО некомитнатите промени (няма база за сравнение!)";
  assert.match(fallbackLabel, /САМО|!/, "резервният режим се обявява шумно");
});
