import test from "node:test";
import assert from "node:assert/strict";
import { orthodoxEaster, dayInfo, findNameDay, upcomingNameDays } from "@/lib/calendar";

test("orthodoxEaster дава познати дати на православния Великден", () => {
  assert.deepEqual(orthodoxEaster(2024), { month: 5, day: 5 });
  assert.deepEqual(orthodoxEaster(2025), { month: 4, day: 20 });
  assert.deepEqual(orthodoxEaster(2026), { month: 4, day: 12 });
});

test("dayInfo връща фиксирани имена и празници", () => {
  const gergyov = dayInfo(2026, 5, 6);
  assert.ok(gergyov.names.includes("Георги"));
  assert.ok(gergyov.feasts.some((f) => f.startsWith("Гергьовден")));

  const nikulden = dayInfo(2026, 12, 6);
  assert.ok(nikulden.names.includes("Никола"));
  assert.ok(nikulden.feasts.includes("Никулден"));
});

test("dayInfo добавя подвижните празници спрямо Великден", () => {
  // Великден 2026 = 12 април → Цветница 5 април, Лазаровден 4 април.
  assert.ok(dayInfo(2026, 4, 12).feasts.some((f) => f.startsWith("Великден")));
  assert.ok(dayInfo(2026, 4, 5).feasts.some((f) => f.startsWith("Цветница")));
  assert.ok(dayInfo(2026, 4, 5).names.includes("Цветан"));
  assert.ok(dayInfo(2026, 4, 4).feasts.includes("Лазаровден"));
});

test("findNameDay намира датата на именния ден", () => {
  assert.deepEqual(findNameDay("Иван", 2026), [{ month: 1, day: 7 }]);
  assert.deepEqual(findNameDay("георги", 2026), [{ month: 5, day: 6 }]);
  assert.deepEqual(findNameDay("Несъществуващо", 2026), []);
});

test("upcomingNameDays пропуска празните дни и подрежда напред", () => {
  const list = upcomingNameDays({ year: 2026, month: 12, day: 24 }, 5);
  const keys = list.map((d) => `${d.month}-${d.day}`);
  assert.ok(keys.includes("12-25")); // Коледа
  assert.ok(keys.includes("12-27")); // Стефановден
});
