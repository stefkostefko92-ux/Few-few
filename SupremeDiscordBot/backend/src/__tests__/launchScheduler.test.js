// backend/src/__tests__/launchScheduler.test.js
// Готовност за пускане (docs/LAUNCH_READINESS_SPEC.md) — планировчикът: И2, А5, А9.
// Логиката е в малки чисти функции (lib/recurrence.js, lib/scheduledPlan.js,
// lib/paginate.js), защото scheduler.js пуска cron при зареждане и не се внася в тест.
import { describe, it, expect, vi } from "vitest";
import { nextOccurrence, isValidTimeZone, anchorDayOf } from "../lib/recurrence.js";
import { planDueMessages, STALE_AFTER_MS } from "../lib/scheduledPlan.js";
import { eachPage } from "../lib/paginate.js";

const iso = (d) => d.toISOString();

describe("А5 — повтарящо се месечно съобщение на 29–31 число", () => {
  it("31 януари → 28 февруари → 31 март → 30 април (без трайно изместване)", () => {
    let at = new Date("2027-01-31T09:00:00Z");
    const anchorDay = anchorDayOf(at, null); // 31
    const seen = [];
    for (let i = 0; i < 4; i++) {
      at = nextOccurrence(at, "monthly", new Date(at.getTime() + 1000), { anchorDay });
      seen.push(iso(at));
    }
    // Старият код (`setMonth(+1)`) даваше 03.03 → 03.04 → 03.05 и оставаше на 3-то число завинаги.
    expect(seen).toEqual([
      "2027-02-28T09:00:00.000Z",
      "2027-03-31T09:00:00.000Z",
      "2027-04-30T09:00:00.000Z",
      "2027-05-31T09:00:00.000Z",
    ]);
  });

  it("високосна година: 29-о число остава 29 февруари", () => {
    const at = new Date("2028-01-29T12:00:00Z");
    expect(iso(nextOccurrence(at, "monthly", new Date("2028-01-29T12:00:01Z"), { anchorDay: 29 })))
      .toBe("2028-02-29T12:00:00.000Z");
  });

  it("ред без записана котва (стар запис) не прелива в следващия месец", () => {
    const at = new Date("2027-01-31T09:00:00Z");
    expect(iso(nextOccurrence(at, "monthly", new Date("2027-01-31T09:00:01Z")))).toBe("2027-02-28T09:00:00.000Z");
  });

  it("пропуснати периоди се наваксват с ЕДНО следващо изпращане, не с всички", () => {
    const at = new Date("2027-01-10T09:00:00Z");
    const now = new Date("2027-04-15T00:00:00Z");
    expect(iso(nextOccurrence(at, "monthly", now, { anchorDay: 10 }))).toBe("2027-05-10T09:00:00.000Z");
    expect(iso(nextOccurrence(at, "weekly", now))).toBe("2027-04-18T09:00:00.000Z");
    expect(iso(nextOccurrence(at, "daily", now))).toBe("2027-04-15T09:00:00.000Z");
  });
});

describe("А5 — дневното съобщение пази МЕСТНИЯ час през смяната на времето", () => {
  const tz = "Europe/Sofia"; // UTC+2 зимата, UTC+3 лятото; смяна на 28.03.2027 и 31.10.2027

  it("пролет: 9:00 местно остава 9:00 местно (в UTC се мести от 07:00 на 06:00)", () => {
    const sat = new Date("2027-03-27T07:00:00Z"); // 09:00 в София (зимно)
    const sun = nextOccurrence(sat, "daily", new Date("2027-03-27T07:00:01Z"), { timeZone: tz });
    expect(iso(sun)).toBe("2027-03-28T06:00:00.000Z"); // 09:00 в София (лятно)
    // Старият код оставяше 07:00 UTC = 10:00 местно.
  });

  it("есен: 9:00 местно остава 9:00 местно (в UTC се мести от 06:00 на 07:00)", () => {
    const sat = new Date("2027-10-30T06:00:00Z");
    expect(iso(nextOccurrence(sat, "daily", new Date("2027-10-30T06:00:01Z"), { timeZone: tz })))
      .toBe("2027-10-31T07:00:00.000Z");
  });

  it("седмичното и месечното също пазят местния час", () => {
    expect(iso(nextOccurrence(new Date("2027-03-22T07:00:00Z"), "weekly", new Date("2027-03-22T07:00:01Z"), { timeZone: tz })))
      .toBe("2027-03-29T06:00:00.000Z");
    expect(iso(nextOccurrence(new Date("2027-03-15T07:00:00Z"), "monthly", new Date("2027-03-15T07:00:01Z"), { timeZone: tz, anchorDay: 15 })))
      .toBe("2027-04-15T06:00:00.000Z");
  });

  it("без зона (стар запис, /schedule от Discord) смята в UTC, както досега", () => {
    expect(iso(nextOccurrence(new Date("2027-03-27T07:00:00Z"), "daily", new Date("2027-03-27T07:00:01Z"))))
      .toBe("2027-03-28T07:00:00.000Z");
  });

  it("зоната се валидира — непозната зона не стига до базата", () => {
    expect(isValidTimeZone("Europe/Sofia")).toBe(true);
    expect(isValidTimeZone("Europe/Rome")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone("x".repeat(200))).toBe(false);
  });

  it("котвата е МЕСТНИЯТ ден: 31-ви в 01:00 в София е още 30-и в UTC", () => {
    const at = new Date("2027-01-30T23:00:00Z"); // 31.01 01:00 в София
    expect(anchorDayOf(at, tz)).toBe(31);
    expect(anchorDayOf(at, null)).toBe(30);
  });
});

describe("А9 — сървър, паднал на Free, не изпраща натрупани стари съобщения", () => {
  const now = new Date("2027-06-10T12:00:00Z");
  const msg = (over) => ({ id: "m", serverId: "s1", sendAt: new Date("2027-06-10T11:59:00Z"), recurrence: null, timeZone: null, anchorDay: null, ...over });

  it("Premium сървър: дължимото се изпраща", () => {
    const plan = planDueMessages([msg({ id: "a" })], new Set(["s1"]), now);
    expect(plan.send.map((m) => m.id)).toEqual(["a"]);
    expect(plan.expire).toEqual([]);
    expect(plan.advance).toEqual([]);
  });

  it("Free сървър, еднократно, просрочено под 24 ч: чака (планът може да се върне)", () => {
    const plan = planDueMessages([msg({ id: "a" })], new Set(), now);
    expect(plan.send).toEqual([]);
    expect(plan.expire).toEqual([]);
    expect(plan.advance).toEqual([]);
  });

  it("Free сървър, еднократно, просрочено над 24 ч: отпада завинаги — не тръгва при връщане на Premium", () => {
    const old = msg({ id: "a", sendAt: new Date(now.getTime() - STALE_AFTER_MS - 60_000) });
    const plan = planDueMessages([old], new Set(), now);
    expect(plan.expire.map((m) => m.id)).toEqual(["a"]);
    expect(plan.send).toEqual([]);
  });

  it("Free сървър, повтарящо се: премества се напред без изпращане (без залп при връщане)", () => {
    const daily = msg({ id: "a", recurrence: "daily", sendAt: new Date("2027-06-01T09:00:00Z") });
    const plan = planDueMessages([daily], new Set(), now);
    expect(plan.send).toEqual([]);
    expect(plan.advance).toHaveLength(1);
    expect(plan.advance[0].id).toBe("a");
    expect(iso(plan.advance[0].sendAt)).toBe("2027-06-11T09:00:00.000Z");
  });

  it("Premium сървър, еднократно, останало от месеци (планът е бил спрян): не се изпраща със закъснение", () => {
    const ancient = msg({ id: "a", sendAt: new Date("2027-03-01T09:00:00Z") });
    const plan = planDueMessages([ancient], new Set(["s1"]), now);
    expect(plan.send).toEqual([]);
    expect(plan.expire.map((m) => m.id)).toEqual(["a"]);
  });
});

describe("И2 — седмичните куестове и trivia стигат до ВСИЧКИ сървъри", () => {
  it("обхожда с курсор до празна страница, не спира на първите 500", async () => {
    const all = Array.from({ length: 1234 }, (_, i) => ({ serverId: String(1000 + i) }));
    const findMany = vi.fn(async ({ take, cursor, skip }) => {
      const start = cursor ? all.findIndex((r) => r.serverId === cursor.serverId) + (skip || 0) : 0;
      return all.slice(start, start + take);
    });
    const seen = [];
    const total = await eachPage({ findMany }, { where: { enabled: true }, select: { serverId: true } }, async (row) => { seen.push(row.serverId); }, { key: "serverId", pageSize: 500 });
    expect(total).toBe(1234);
    expect(seen).toHaveLength(1234);
    expect(new Set(seen).size).toBe(1234);
    expect(findMany).toHaveBeenCalledTimes(3); // 500 + 500 + 234 — последната страница е непълна и приключва
    // Подредбата е задължителна: без orderBy курсорът няма смисъл и редове се пропускат.
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ serverId: "asc" });
    expect(findMany.mock.calls[1][0]).toMatchObject({ cursor: { serverId: "1499" }, skip: 1 });
  });

  it("грешка за един сървър не спира останалите", async () => {
    const rows = [{ serverId: "1" }, { serverId: "2" }, { serverId: "3" }];
    const findMany = vi.fn(async ({ cursor }) => (cursor ? [] : rows));
    const done = [];
    const total = await eachPage({ findMany }, {}, async (r) => { if (r.serverId === "2") throw new Error("бум"); done.push(r.serverId); }, { key: "serverId", pageSize: 3 });
    expect(done).toEqual(["1", "3"]);
    expect(total).toBe(3);
  });

  it("scheduler.js и trivia.js вече не режат на take: 500 без курсор", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const f of ["services/scheduler.js", "lib/game/trivia.js"]) {
      const code = readFileSync(join(root, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(code, `${f}: gameSettings.findMany с take без курсор`).not.toMatch(/gameSettings\.findMany\([^)]*take:\s*500/);
    }
  });
});
