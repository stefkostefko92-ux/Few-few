import test from "node:test";
import assert from "node:assert/strict";
import {
  aggiungiMesi,
  prossimaScadenza,
  periodiScaduti,
  rinnovo,
  mesiTra,
  inPreavviso,
  descrizionePeriodo,
  MESI_PERIODO,
} from "../contratti-logic";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

test("добавянето на месеци не прескача месец", () => {
  // 31 януари + 1 месец: `setMonth` би дал 3 март. Прищипваме към 28/29 февруари.
  assert.equal(iso(aggiungiMesi(d("2026-01-31"), 1)), "2026-02-28");
  assert.equal(iso(aggiungiMesi(d("2024-01-31"), 1)), "2024-02-29"); // високосна
  assert.equal(iso(aggiungiMesi(d("2026-03-31"), 1)), "2026-04-30");
  assert.equal(iso(aggiungiMesi(d("2026-01-15"), 1)), "2026-02-15");
});

test("графикът не се измества при последователни периоди", () => {
  // Договор от 31 януари: посещенията остават на 31-ви там, където месецът го има.
  let x = d("2026-01-31");
  const mesi = [];
  for (let i = 0; i < 4; i++) {
    x = aggiungiMesi(d("2026-01-31"), i + 1);
    mesi.push(iso(x));
  }
  assert.deepEqual(mesi, [
    "2026-02-28",
    "2026-03-31",
    "2026-04-30",
    "2026-05-31",
  ]);
});

test("периодичността дава верния брой месеци", () => {
  assert.equal(
    iso(prossimaScadenza(d("2026-01-01"), "TRIMESTRALE")),
    "2026-04-01",
  );
  assert.equal(
    iso(prossimaScadenza(d("2026-01-01"), "SEMESTRALE")),
    "2026-07-01",
  );
  assert.equal(iso(prossimaScadenza(d("2026-01-01"), "ANNUALE")), "2027-01-01");
  assert.equal(MESI_PERIODO.QUADRIMESTRALE, 4);
});

test("спрял автоматизъм НАВАКСВА пропуснатите периоди", () => {
  // Три месечни периода са минали, докато cron-ът е бил спрян.
  assert.equal(periodiScaduti(d("2026-01-01"), d("2026-03-15"), "MENSILE"), 3);
  // Още не е дошло време.
  assert.equal(periodiScaduti(d("2026-04-01"), d("2026-03-15"), "MENSILE"), 0);
  // Точно на датата — един период е дължим.
  assert.equal(periodiScaduti(d("2026-03-15"), d("2026-03-15"), "MENSILE"), 1);
});

test("наваксването има таван срещу повредени данни", () => {
  // Дата отпреди 50 години не бива да върти цикъла безкрайно.
  assert.equal(
    periodiScaduti(d("1976-01-01"), d("2026-01-01"), "MENSILE"),
    120,
  );
});

test("подновяването пази годишнината, не тръгва от днес", () => {
  const r = rinnovo(d("2026-01-01"), d("2026-12-31"));
  assert.equal(iso(r.dataInizio), "2027-01-01");
  assert.equal(iso(r.dataFine), "2027-12-31");
});

test("месеците между две дати", () => {
  assert.equal(mesiTra(d("2026-01-01"), d("2027-01-01")), 12);
  assert.equal(mesiTra(d("2026-01-15"), d("2026-02-10")), 1); // поне 1
});

test("подновяването на полугодишен договор пази дължината", () => {
  const r = rinnovo(d("2026-01-01"), d("2026-06-30"));
  assert.equal(iso(r.dataInizio), "2026-07-01");
  assert.equal(iso(r.dataFine), "2026-12-31");
});

test("предизвестието се вдига в срока преди изтичане", () => {
  const fine = d("2026-12-31");
  assert.equal(inPreavviso(fine, 3, d("2026-11-01")), true);
  assert.equal(inPreavviso(fine, 3, d("2026-09-01")), false);
  assert.equal(inPreavviso(fine, 3, d("2027-01-05")), false); // вече е изтекъл
});

test("описанието на периода показва ЗА КОГА е фактурата", () => {
  assert.equal(
    descrizionePeriodo(d("2026-01-01"), "TRIMESTRALE"),
    "01/01/2026 – 31/03/2026",
  );
  assert.equal(
    descrizionePeriodo(d("2026-07-01"), "SEMESTRALE"),
    "01/07/2026 – 31/12/2026",
  );
});
