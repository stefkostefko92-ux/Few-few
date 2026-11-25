import test from "node:test";
import assert from "node:assert/strict";
import { groupMisses, missKey, guideQuestion, type MissRow } from "@/lib/search-misses";

const at = (s: string) => new Date(`${s}T10:00:00Z`);
const row = (id: string, query: string, count: number, resolved = false, day = "2026-10-20"): MissRow => ({
  id,
  query,
  count,
  resolved,
  createdAt: at(day),
  updatedAt: at(day),
});

test("ключът събира различните изписвания на една нужда", () => {
  assert.equal(missKey("пенсия"), missKey("пенсии"));
  assert.equal(missKey("как да взема пенсия"), missKey("пенсията как да я взема"));
  assert.notEqual(missKey("пенсия"), missKey("данък"));
  // Маскираните лични данни не влияят на групирането.
  assert.equal(missKey("пенсия [ЕГН]"), missKey("пенсия"));
});

test("групи: необработените първо, после по общ брой; главното изписване е най-търсеното", () => {
  const groups = groupMisses([
    row("1", "пенсии", 3),
    row("2", "пенсия", 5),
    row("3", "данък кола", 20, true),
    row("4", "сметосъбиране", 1),
  ]);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].main.query, "пенсия");
  assert.equal(groups[0].total, 8);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].main.query, "сметосъбиране");
  assert.equal(groups[2].resolved, true);
});

test("първо и последно търсене в групата", () => {
  const [g] = groupMisses([row("1", "пенсия", 1, false, "2026-10-01"), row("2", "пенсии", 1, false, "2026-10-15")]);
  assert.equal(g.firstAt.toISOString().slice(0, 10), "2026-10-01");
  assert.equal(g.lastAt.toISOString().slice(0, 10), "2026-10-15");
});

test("въпрос за ново ръководство", () => {
  assert.equal(guideQuestion("как да взема пенсия"), "Как да взема пенсия?");
  assert.equal(guideQuestion("пенсия [ЕГН]"), "Пенсия?");
  assert.equal(guideQuestion("кога е изборът?"), "Кога е изборът?");
  assert.equal(guideQuestion("[ЕГН]"), "");
});
