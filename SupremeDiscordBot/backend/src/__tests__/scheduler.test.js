// backend/src/__tests__/scheduler.test.js
// Структурни гейтове върху планировчика. Не пускаме реални cron задачи —
// проверяваме двете свойства, чиято липса е невидима до продукцията.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "services", "scheduler.js"),
  "utf-8",
);
// Коментарите съдържат същите шаблони — режем ги, иначе тестът чете обяснение
// вместо код (грешка, която вече сме правили веднъж).
const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("scheduler", () => {
  it("всяка задача носи ЯВНА часова зона", () => {
    // Без `timezone` node-cron ползва локалната зона на процеса. Всеки коментар
    // във файла пише „UTC“, но нищо не го налагаше: сменен TZ в образа размества
    // всяко разписание безшумно. Най-опасна е дневната ролка („5 0 * * *“), която
    // смята „вчера“ — изместена граница на деня значи дублирани или липсващи дни.
    const schedules = code.match(/cron\.schedule\(/g) || [];
    const withTz = code.match(/\}\), TZ\);/g) || [];
    expect(schedules.length).toBeGreaterThan(0);
    expect(withTz.length, "задача без TZ").toBe(schedules.length);
  });

  it("всяка задача минава през обвивката job() (анти-застъпване + Sentry)", () => {
    const schedules = [...code.matchAll(/cron\.schedule\("([^"]+)",\s*([\w(]+)/g)];
    const bare = schedules.filter((m) => m[2] !== "job(").map((m) => m[1]);
    expect(bare, `гол callback без job(): ${bare.join(" · ")}`).toEqual([]);
  });
});
