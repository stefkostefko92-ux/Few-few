// audit-deps.test.mjs — филтърът „само продукционни" от package-lock.json.
// Auto-discover в agents.yml CI (`find tools -name '*.test.mjs'`).
//   node --test tools/security/audit-deps.test.mjs
//
// Точно тази функция решава КАКВО изобщо се проверява. Сгрешена, тя не гърми —
// просто пита за по-малко пакети и гейтът минава зелен върху непроверен код.
// Затова носи тест, а мрежата остава извън него.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pacchettiProduzione, LIVELLI } from "./audit-deps.mjs";

const lock = {
  packages: {
    "": { name: "prodotto", dependencies: { next: "15.5.4" } },
    "node_modules/next": { version: "15.5.4" },
    "node_modules/eslint": { version: "9.0.0", dev: true },
    // Вложена версия на същия пакет — двете трябва да се питат ЗАЕДНО.
    "node_modules/next/node_modules/postcss": { version: "8.4.31" },
    "node_modules/postcss": { version: "8.5.0" },
    // Двойно означен: dev по един път, продукционен по друг. Остава ВЪТРЕ.
    "node_modules/tslib": { version: "2.6.0", devOptional: true },
    // Симлинк към работно пространство — няма версия за питане.
    "node_modules/interno": { link: true, resolve: "packages/interno" },
    "node_modules/senza-versione": {},
  },
};

test("dev зависимостите отпадат, продукционните остават", () => {
  const p = pacchettiProduzione(lock);
  assert.ok("next" in p);
  assert.equal("eslint" in p, false, "dev пакет не бива да влиза в одита");
});

test("двойно означеният (devOptional) остава — иначе крием реален пакет", () => {
  assert.deepEqual(pacchettiProduzione(lock).tslib, ["2.6.0"]);
});

test("вложените версии на един пакет се събират под едно име", () => {
  const versioni = pacchettiProduzione(lock).postcss;
  assert.equal(versioni.length, 2);
  assert.deepEqual([...versioni].sort(), ["8.4.31", "8.5.0"]);
});

test("симлинк и запис без версия се пропускат — няма какво да се пита", () => {
  const p = pacchettiProduzione(lock);
  assert.equal("interno" in p, false);
  assert.equal("senza-versione" in p, false);
});

test("коренният запис не е пакет", () => {
  assert.equal("" in pacchettiProduzione(lock), false);
  assert.equal("prodotto" in pacchettiProduzione(lock), false);
});

test("празен lock не гърми", () => {
  assert.deepEqual(pacchettiProduzione({}), {});
});

test("нивата на тежест са подредени от ниско към високо", () => {
  assert.equal(LIVELLI.indexOf("critical") > LIVELLI.indexOf("high"), true);
  assert.equal(LIVELLI.indexOf("high") > LIVELLI.indexOf("moderate"), true);
});
