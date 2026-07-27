// Форматирането за италианския интерфейс.
//
// Изглежда като козметика и не е: това е слоят, на който едно число става
// стойност, която човек чете и на която взима решение. Отрязана дата с един ден
// назад върху срок по чл. 13 D.P.R. 162/1999 е сгрешен срок, а „—" вместо сума
// е разликата между „нула евро" и „не знаем".

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  euro,
  dataIt,
  dataOraIt,
  plurale,
  perInputData,
} from "@/lib/format";

describe("парите", () => {
  test("низ и число дават една и съща италианска запис", () => {
    // Неразделният интервал на it-IT не е обикновен — сравнението е нормализирано.
    const n = (v: string) => v.replace(/ /g, " ");
    assert.equal(n(euro(12345.5)), "12.345,50 €");
    assert.equal(n(euro("12345.5")), "12.345,50 €");
    assert.equal(n(euro(0)), "0,00 €");
    // ЧЕТИРИЦИФРЕНОТО НЕ СЕ ГРУПИРА и това не е дефект: CLDR задава на
    // италианския `minimumGroupingDigits = 2`, тоест „1234,50 €" е вярното
    // изписване, а „1.234,50 €" — не. Тестът пинова точно това, защото при
    // първото писане очакването беше обратното.
    assert.equal(n(euro(1234.5)), "1234,50 €");
  });

  test("липсващото е ТИРЕ, не нула", () => {
    // Нулата твърди „струва нула"; тирето казва „не знаем" — и точно това
    // разграничение пази отчета за рентабилността от лъжлива печалба.
    for (const v of [null, undefined, "", "non un numero"])
      assert.equal(euro(v as string | null), "—");
  });
});

describe("датите", () => {
  test("денят е с водеща нула и годината е четири цифри", () => {
    assert.equal(dataIt("2026-03-05T00:00:00Z"), "05/03/2026");
    assert.equal(dataIt(new Date("2026-12-31T00:00:00Z")), "31/12/2026");
  });

  test("датата с час носи и часа", () => {
    const originale = process.env.TZ;
    process.env.TZ = "Europe/Rome";
    try {
      assert.equal(
        dataOraIt("2026-07-27T12:30:00Z").replace(/,/g, ""),
        "27/07/2026 14:30",
      );
    } finally {
      process.env.TZ = originale;
    }
  });

  test("липсващото и невалидното дават тире, не „Invalid Date“", () => {
    for (const v of [null, undefined, "", "ieri"]) {
      assert.equal(dataIt(v as string | null), "—");
      assert.equal(dataOraIt(v as string | null), "—");
    }
  });

  test("perInputData дава ISO дата за <input type=\"date\">", () => {
    assert.equal(perInputData("2026-03-05T00:00:00Z"), "2026-03-05");
    assert.equal(perInputData(new Date("2026-03-05T00:00:00Z")), "2026-03-05");
    assert.equal(perInputData(null), "");
    assert.equal(perInputData("ieri"), "");
  });
});

describe("множественото число", () => {
  test("едно и много се различават", () => {
    assert.equal(plurale(1, "riga", "righe"), "1 riga");
    assert.equal(plurale(3, "riga", "righe"), "3 righe");
    // Нулата е множествено в италианския: „0 righe", не „0 riga".
    assert.equal(plurale(0, "riga", "righe"), "0 righe");
  });
});
