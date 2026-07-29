// version-freshness.test.mjs — гейтът „агентите не говорят с 2–3 годишни версии".
//
// Механизмът: световната истина живее в versions.json със checkedAt + TTL; изтече ли TTL,
// гейтът пада и НАЛАГА живо освежаване. Репо-истината се чете от package.json при всеки рън.
// Тук се тества ЛОГИКАТА (чисти функции) — мрежата е само в --refresh, който не е гейт.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ttlBreaches, major, upgradeRadar, daysBetween, repoPins } from "./version-freshness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

test("изтекъл TTL се хваща; в рамките — не; ГРАНИЦАТА е включителна", () => {
  const reg = { ttlDays: 45, entries: [
    { id: "свеж", checkedAt: "2026-07-01" },
    { id: "стар", checkedAt: "2026-01-01" },
    { id: "точно-на-ръба", checkedAt: "2026-06-14", ttlDays: 45 },
  ] };
  const b = ttlBreaches(reg, "2026-07-29").map((x) => x.id);
  assert.ok(b.includes("стар"));
  assert.ok(!b.includes("свеж"));
  assert.ok(!b.includes("точно-на-ръба"), "45-ият ден още е валиден (ръбът не е пробив)");
});

test("запис БЕЗ checkedAt е веднага изтекъл — „вечно валиден\" не съществува", () => {
  const b = ttlBreaches({ ttlDays: 45, entries: [{ id: "x" }] }, "2026-07-29");
  assert.equal(b.length, 1);
  assert.equal(b[0].checkedAt, "НИКОГА");
});

test("per-entry ttlDays надделява над глобалния", () => {
  const reg = { ttlDays: 365, entries: [{ id: "volatile", checkedAt: "2026-06-01", ttlDays: 30 }] };
  assert.equal(ttlBreaches(reg, "2026-07-29").length, 1);
});

test("major() вади мажора от реални пин формати", () => {
  assert.equal(major("^15.1.4"), 15);
  assert.equal(major("16.2.9"), 16);
  assert.equal(major("~0.185.1"), 0);
  assert.equal(major(""), null);
  assert.equal(major(undefined), null);
});

test("радарът хваща изоставане по мажор и мълчи при паритет", () => {
  const reg = { entries: [{ id: "next", npm: "next", current: "16.2.12" }] };
  const radar = upgradeRadar(reg, { next: { стар: "^15.1.4", свеж: "16.2.9" } });
  assert.equal(radar.length, 1);
  assert.equal(radar[0].product, "стар");
  assert.equal(radar[0].behindMajors, 1);
});

test("реалният versions.json е валиден: всеки запис има id + current + checkedAt + източник за ръчните", () => {
  const reg = JSON.parse(readFileSync(join(HERE, "versions.json"), "utf8"));
  assert.ok(reg.entries.length >= 20, `очаквах ≥20 записа, има ${reg.entries.length}`);
  for (const e of reg.entries) {
    assert.ok(e.id && e.current && e.checkedAt, `непълен запис: ${e.id}`);
    assert.ok(e.npm || e.manual, `${e.id}: нито npm, нито manual — как ще се освежава?`);
    if (e.manual) assert.ok(e.source, `${e.id}: ръчен запис БЕЗ източник = слух`);
  }
});

test("репо-пиновете се четат живо и виждат реалните продукти", () => {
  const pins = repoPins();
  assert.ok(pins.next && Object.keys(pins.next).length >= 5, "поне 5 Next продукта");
  assert.ok(pins["discord.js"]?.SupremeDiscordBot, "SupremeDiscordBot пинва discord.js");
});

test("daysBetween смята календарно, не наивно", () => {
  assert.equal(daysBetween("2026-07-01", "2026-07-29"), 28);
  assert.equal(daysBetween("2026-01-01", "2026-07-29"), 209);
});
