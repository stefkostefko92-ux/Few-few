import test from "node:test";
import assert from "node:assert/strict";
import { calcolaRedditivita, ordinaPerMargine } from "../redditivita";

const VUOTO = { ricaviNetti: [], ore: [], materiali: [], costiEsterni: [] };

test("празната сметка е нула, не NaN", () => {
  const r = calcolaRedditivita(VUOTO);
  assert.equal(r.ricavi, "0.00");
  assert.equal(r.margine, "0.00");
  // Процент спрямо нулев приход е безсмислен — не нула.
  assert.equal(r.marginePerc, null);
  assert.equal(r.completo, true);
});

test("приход минус трите вида разход", () => {
  const r = calcolaRedditivita({
    ricaviNetti: ["1000.00"],
    ore: [
      { ore: "8", costoOrario: "25.00" },
      { ore: "2.5", costoOrario: "25.00" },
    ],
    materiali: [{ quantita: 3, prezzoAcquisto: "40.00" }],
    costiEsterni: ["150.00"],
  });
  // 10,5 ч × 25 = 262,50 · 3 × 40 = 120,00 · външни 150,00 → 532,50
  assert.equal(r.costoManodopera, "262.50");
  assert.equal(r.costoMateriali, "120.00");
  assert.equal(r.costiEsterni, "150.00");
  assert.equal(r.costoTotale, "532.50");
  assert.equal(r.margine, "467.50");
  assert.equal(r.marginePerc, "46.75");
});

test("маржът е спрямо ПРИХОДА, не надценка спрямо разхода", () => {
  const r = calcolaRedditivita({
    ...VUOTO,
    ricaviNetti: ["100.00"],
    costiEsterni: ["50.00"],
  });
  // Марж 50 % (50/100). Надценката би била 100 % (50/50) — различно число за
  // една и съща сделка, и точно затова се бърка постоянно.
  assert.equal(r.marginePerc, "50.00");
});

test("липсващата цена е НЕИЗВЕСТНА, не нула", () => {
  const r = calcolaRedditivita({
    ricaviNetti: ["500.00"],
    ore: [
      { ore: "10", costoOrario: null },
      { ore: "2", costoOrario: "30.00" },
    ],
    materiali: [{ quantita: 5 }, { quantita: 1, prezzoAcquisto: "10.00" }],
    costiEsterni: [],
  });
  // Само познатото влиза в сметката…
  assert.equal(r.costoManodopera, "60.00");
  assert.equal(r.costoMateriali, "10.00");
  // …а непознатото се обявява, за да не изглежда договорът печеливш, защото
  // някой не е попълнил цената на час.
  assert.equal(r.oreSenzaCosto, "10.00");
  assert.equal(r.materialiSenzaCosto, 1);
  assert.equal(r.completo, false);
});

test("празен низ се брои като липсваща цена, не като нула", () => {
  const r = calcolaRedditivita({
    ...VUOTO,
    ore: [{ ore: "4", costoOrario: "" }],
  });
  assert.equal(r.costoManodopera, "0.00");
  assert.equal(r.oreSenzaCosto, "4.00");
  assert.equal(r.completo, false);
});

test("отрицателният марж излиза като отрицателен", () => {
  const r = calcolaRedditivita({
    ...VUOTO,
    ricaviNetti: ["100.00"],
    costiEsterni: ["250.00"],
  });
  assert.equal(r.margine, "-150.00");
  assert.equal(r.marginePerc, "-150.00");
});

test("центесимите не се разминават с фактурата", () => {
  // Час и петнайсет по 33,33 €: с плаваща запетая се получава 41,662499…
  const r = calcolaRedditivita({
    ...VUOTO,
    ore: [{ ore: "1.25", costoOrario: "33.33" }],
  });
  assert.equal(r.costoManodopera, "41.66");
});

test("входът приема запетая за десетичен знак (IT)", () => {
  // Разделител за хиляди НЕ се поддържа (и не се твърди никъде): „1.234,56"
  // е двусмислен без локал, затова `toCents` го отказва вместо да гадае.
  const r = calcolaRedditivita({
    ...VUOTO,
    ricaviNetti: ["1234,56"],
    costiEsterni: ["234,56"],
  });
  assert.equal(r.ricavi, "1234.56");
  assert.equal(r.margine, "1000.00");
});

test("подредбата слага най-губещото ПЪРВО", () => {
  const riga = (margine: string) => ({ redditivita: { margine } as never });
  const out = ordinaPerMargine([riga("100.00"), riga("-50.00"), riga("0.00")]);
  assert.deepEqual(
    out.map((r) => (r.redditivita as unknown as { margine: string }).margine),
    ["-50.00", "0.00", "100.00"],
  );
});
