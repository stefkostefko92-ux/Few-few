// Тестове за форматирането на дати (bg-BG) и ageFrom.
// Сървърът работи в UTC (Dockerfile: TZ=UTC); тестът го фиксира изрично, за да не
// зависи от часовата зона на машината. Времето в ageFrom се подменя с mock.timers.
import { test, describe, before, mock, afterEach } from "node:test";
import assert from "node:assert/strict";

type Fmt = typeof import("../format");
let f: Fmt;

before(async () => {
  process.env.TZ = "UTC";
  // Динамичен внос: форматерите се създават при зареждане на модула.
  f = await import("../format");
});

afterEach(() => mock.timers.reset());

// Фиксира „сега“ (UTC), за да е ageFrom детерминистичен.
function nowIs(iso: string) {
  mock.timers.reset(); // позволява повторно задаване в рамките на един тест
  mock.timers.enable({ apis: ["Date"], now: new Date(iso) });
}

const D = new Date(Date.UTC(2025, 2, 5, 14, 30)); // сряда, 5 март 2025, 14:30 UTC

describe("formatDate / formatDateShort / formatTime / formatWeekday", () => {
  test("formatDate: дълъг български формат", () => {
    assert.equal(f.formatDate(D), "05 март 2025 г.");
  });

  test("formatDateShort: ДД.ММ.ГГГГ", () => {
    assert.equal(f.formatDateShort(D), "05.03.2025 г.");
  });

  test("formatTime: ЧЧ:ММ в UTC", () => {
    assert.equal(f.formatTime(D), "14:30");
  });

  test("formatWeekday: ден от седмицата", () => {
    assert.equal(f.formatWeekday(D), "сряда");
  });

  test("приема ISO низ", () => {
    assert.equal(f.formatDate("2025-03-05T14:30:00Z"), "05 март 2025 г.");
    assert.equal(f.formatTime("2025-03-05T14:30:00Z"), "14:30");
  });

  test("null/undefined/празно → „—“ (weekday → празен низ)", () => {
    for (const v of [null, undefined, ""]) {
      assert.equal(f.formatDate(v), "—");
      assert.equal(f.formatDateShort(v), "—");
      assert.equal(f.formatTime(v), "—");
      assert.equal(f.formatWeekday(v), "");
    }
  });

  test("невалидна дата → „—“ (weekday → празен низ)", () => {
    assert.equal(f.formatDate("не-дата"), "—");
    assert.equal(f.formatDateShort(new Date("x")), "—");
    assert.equal(f.formatTime("не-дата"), "—");
    assert.equal(f.formatWeekday("не-дата"), "");
  });
});

describe("ageFrom", () => {
  test("null, undefined и празно → null", () => {
    nowIs("2026-06-15T12:00:00Z");
    assert.equal(f.ageFrom(null), null);
    assert.equal(f.ageFrom(undefined), null);
    assert.equal(f.ageFrom(""), null);
  });

  test("невалидна дата → null", () => {
    nowIs("2026-06-15T12:00:00Z");
    assert.equal(f.ageFrom("не-дата"), null);
    assert.equal(f.ageFrom(new Date("x")), null);
  });

  test("ден ПРЕДИ рождения ден → още не е навършил", () => {
    nowIs("2026-06-14T12:00:00Z");
    assert.equal(f.ageFrom(new Date("2000-06-15T00:00:00Z")), 25);
  });

  test("НА рождения ден → навършил", () => {
    nowIs("2026-06-15T00:00:00Z");
    assert.equal(f.ageFrom(new Date("2000-06-15T23:59:00Z")), 26);
  });

  test("ден СЛЕД рождения ден → навършил", () => {
    nowIs("2026-06-16T12:00:00Z");
    assert.equal(f.ageFrom(new Date("2000-06-15T00:00:00Z")), 26);
  });

  test("по-ранен месец от рождения → още не е навършил; по-късен → навършил", () => {
    nowIs("2026-05-31T12:00:00Z");
    assert.equal(f.ageFrom("2000-06-01"), 25);
    nowIs("2026-07-01T12:00:00Z");
    assert.equal(f.ageFrom("2000-06-30"), 26);
  });

  test("приема ISO низ и Date", () => {
    nowIs("2026-06-15T12:00:00Z");
    assert.equal(f.ageFrom("2000-06-15"), 26);
    assert.equal(f.ageFrom(new Date(Date.UTC(2000, 5, 15))), 26);
  });

  test("роден на 29 февруари: на 28 февруари (не-високосна) още не е навършил, на 1 март е", () => {
    nowIs("2026-02-28T12:00:00Z");
    assert.equal(f.ageFrom("2004-02-29"), 21);
    nowIs("2026-03-01T12:00:00Z");
    assert.equal(f.ageFrom("2004-02-29"), 22);
  });

  test("роден днес → 0", () => {
    nowIs("2026-06-15T12:00:00Z");
    assert.equal(f.ageFrom("2026-06-15"), 0);
  });

  test("дата в бъдещето → null", () => {
    nowIs("2026-06-15T12:00:00Z");
    assert.equal(f.ageFrom("2027-01-01"), null);
  });

  test("нереалистична възраст (≥120) → null", () => {
    nowIs("2026-06-15T12:00:00Z");
    assert.equal(f.ageFrom("1906-06-15"), null);
    assert.equal(f.ageFrom("1907-06-16"), 118);
  });
});
