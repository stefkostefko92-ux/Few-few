// backend/src/__tests__/ropaCoverage.test.js
// Регистърът по чл. 30 (ROPA) не бива да изостава от продукта.
//
// ДЕФЕКТЪТ (одит на одита, 02.09.2026): четири обработки работеха на живо БЕЗ
// ред в регистъра — „лепкави роли" (нова категория лични данни от #212),
// дневникът на активността, публичните API ключове и изходящите webhook-и.
// Схемата и кодът се самопроверяват с гейтове; правният документ се
// поддържаше на ръка и тихо остана на 12 дейности.
//
// Гейтът НЕ е оракул за покритие: ROPA описва ДЕЙНОСТИ, не таблици, и „коя
// таблица към коя дейност" е преценка, не grep — наивно сравнение по имена на
// модели би давало фалшиви тревоги (урок, повтарян пет пъти в този проект).
// Той закотвя ДНЕШНОТО състояние: минимален брой дейности и четирите
// заглавия, които липсваха. Нова обработка утре ще иска съзнателно вдигане на
// прага — точно моментът, в който някой трябва да отвори документа.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ropa = readFileSync(join(ROOT, "legal", "ROPA.md"), "utf8");

const activities = [...ropa.matchAll(/^## Processing Activity (\d+) — (.+)$/gm)]
  .map((m) => ({ n: Number(m[1]), title: m[2].trim() }));

describe("ROPA (чл. 30) отразява живите обработки", () => {
  it("има поне 16 дейности и са номерирани без дупки", () => {
    expect(activities.length).toBeGreaterThanOrEqual(16);
    const nums = activities.map((a) => a.n);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });

  it.each([
    ["лепкави роли", /Sticky Roles/i, /180 days/],
    ["дневник на активността", /Server Activity Logging/i, /Not stored by Supreme Bot/],
    ["публични API ключове", /Public API Keys/i, /SHA-256 hash/],
    ["изходящи webhook-и", /Outbound Webhooks/i, /SSRF guard/],
  ])("описва %s — заглавие + ключов факт, не само име", (_, heading, fact) => {
    const a = activities.find((x) => heading.test(x.title));
    expect(a, `няма дейност за ${heading}`).toBeTruthy();
    // Фактът трябва да е В блока на дейността, не някъде другаде в документа.
    const start = ropa.indexOf(`## Processing Activity ${a.n} —`);
    const end = ropa.indexOf("\n## ", start + 1);
    const block = ropa.slice(start, end === -1 ? undefined : end);
    expect(block, `дейност ${a.n}: липсва ${fact}`).toMatch(fact);
  });

  it("всяка дейност носи задължителните полета по чл. 30(1)", () => {
    for (const a of activities) {
      const start = ropa.indexOf(`## Processing Activity ${a.n} —`);
      const end = ropa.indexOf("\n## ", start + 1);
      const block = ropa.slice(start, end === -1 ? undefined : end);
      for (const field of ["Purpose", "Legal basis", "Data categories", "Data subjects", "Recipients", "Retention period"]) {
        expect(block, `дейност ${a.n} „${a.title}": липсва ред ${field}`).toMatch(new RegExp(`\\*\\*${field}\\*\\*`));
      }
    }
  });

  it("версията казва, че 13–16 са добавени (историята не се пренаписва)", () => {
    expect(ropa).toMatch(/\*\*Version:\*\* 1\.2[^\n]*13.?16/);
  });
});
