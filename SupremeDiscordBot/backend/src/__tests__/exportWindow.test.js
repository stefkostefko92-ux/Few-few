// backend/src/__tests__/exportWindow.test.js
// Клиентът може да си вземе данните ПРИ прекратяване, а не само докато плаща.
//
// ДЕФЕКТЪТ (Правният Разбирач, одит 07.08.2026): експортът беше гейтнат на
// активен Premium, а `syncServerPaidFlag` връща `archiveRetentionDays` на 30
// при загуба на достъп и метлата трие архивите — при това 30-те дни се броят от
// ЗАТВАРЯНЕТО на тикета, значи архив, затворен преди три месеца, изчезва до 24
// часа след свалянето. Клиентът губеше И данните, И единственото средство да си
// ги вземе, точно в момента на прекратяване. Чл. 16(4) от Дир. (ЕС) 2019/770
// (ЗПЦСЦУПС) му дава обратното право; лендингът обещаваше „експортирай, когато
// поискаш“, а обещанието беше празно тъкмо когато има значение.
//
// Двете страни трябва да СЪВПАДАТ: маршрутът да пуска и метлата да чака. Затова
// прозорецът живее веднъж, в `lib/premium.js`, и се тества и от двете страни.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inExportWindow, EXPORT_GRACE_DAYS } from "../lib/premium.js";

const DAY = 86400_000;
const ago = (d) => new Date(Date.now() - d * DAY);
const ahead = (d) => new Date(Date.now() + d * DAY);

describe("прозорецът за експорт", () => {
  it("е 30 дни — срокът, обещан в DPA §9.1", () => {
    expect(EXPORT_GRACE_DAYS).toBe(30);
  });

  it("отменен вчера → отворен", () => {
    expect(inExportWindow({ accessUntil: ago(1) })).toBe(true);
  });

  it("периодът още тече → отворен", () => {
    expect(inExportWindow({ accessUntil: ahead(10) })).toBe(true);
  });

  it("29 дни след края → още отворен", () => {
    expect(inExportWindow({ accessUntil: ago(29) })).toBe(true);
  });

  it("31 дни след края → затворен", () => {
    expect(inExportWindow({ accessUntil: ago(31) })).toBe(false);
  });

  it("изтекла проба също дава прозорец", () => {
    expect(inExportWindow({ trialEndsAt: ago(5) })).toBe(true);
  });

  it("взима по-КЪСНАТА котва, ако има и двете", () => {
    // Проба, после платен период: броим от платения, не от пробата.
    expect(inExportWindow({ trialEndsAt: ago(90), accessUntil: ago(3) })).toBe(true);
  });

  it("сървър без нито една котва → нула прозорец (никога не е плащал)", () => {
    expect(inExportWindow({})).toBe(false);
    expect(inExportWindow(null)).toBe(false);
    expect(inExportWindow(undefined)).toBe(false);
  });
});

describe("двете страни ползват ЕДИН източник", () => {
  const read = (rel) =>
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", rel), "utf-8");

  it("маршрутът за експорт пита прозореца, не само тарифата", () => {
    const code = read("routes/export.js").split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    expect(code).toContain("inExportWindow(");
  });

  it("метлата за архиви ОТЛАГА, докато прозорецът е отворен", () => {
    // Без това правото на експорт е на хартия — метлата минава първа.
    const code = read("services/scheduler.js").split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    const job = code.slice(code.indexOf('job("archive-cleanup"'));
    const body = job.slice(0, job.indexOf('}), TZ);'));
    expect(body, "метлата вече не проверява прозореца за експорт").toContain("inExportWindow(");
    expect(body, "прозорецът се проверява, но нищо не се пропуска").toMatch(/continue/);
  });

  it("нито един от двата не си дефинира СВОЯ срок", () => {
    for (const f of ["routes/export.js", "services/scheduler.js"]) {
      const code = read(f).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(code, `${f} си пише собствени 30 дни вместо да ползва общия срок`)
        .not.toMatch(/EXPORT_GRACE_DAYS\s*=/);
    }
  });
});
