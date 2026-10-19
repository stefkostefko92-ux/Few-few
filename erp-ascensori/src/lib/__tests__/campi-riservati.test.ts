// Запазените полета: скрити дълбоко, писането им от по-ниско ниво — отказ.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campiNascosti,
  oscuraRiservati,
  scritturaVietata,
} from "@/lib/campi-riservati";

const R = { ruolo: "DIREZIONE" as const, campi: ["costoOrario"] };

test("DIREZIONE+ вижда всичко, по-ниските — не", () => {
  assert.equal(campiNascosti(R, "DIREZIONE").size, 0);
  assert.equal(campiNascosti(R, "MASTER").size, 0);
  assert.deepEqual([...campiNascosti(R, "TECNICO")], ["costoOrario"]);
  assert.equal(campiNascosti(undefined, "OPERATORE").size, 0);
});

test("скриването е дълбоко и не пипа датите", () => {
  const d = new Date("2026-01-01");
  const riga = {
    id: "a",
    costoOrario: "35.00",
    creato: d,
    squadra: { membri: [{ nome: "Mario", costoOrario: "30.00" }] },
  };
  const n = campiNascosti(R, "OPERATORE");
  assert.deepEqual(oscuraRiservati(riga, n), {
    id: "a",
    creato: d,
    squadra: { membri: [{ nome: "Mario" }] },
  });
  assert.deepEqual(oscuraRiservati([riga], new Set()), [riga]);
  assert.equal(oscuraRiservati(null, n), null);
});

test("писането на запазено поле се хваща; undefined не се брои", () => {
  const n = campiNascosti(R, "OPERATORE");
  assert.deepEqual(scritturaVietata({ nome: "x", costoOrario: 1 }, n), [
    "costoOrario",
  ]);
  assert.deepEqual(scritturaVietata({ costoOrario: undefined }, n), []);
  assert.deepEqual(scritturaVietata(null, n), []);
});

test("Decimal и Buffer минават непокътнати (не стават `{s,e,d}`)", () => {
  // Prisma Decimal е обект със собствени полета — обходен като литерал, той
  // излизаше в JSON като {s,e,d} и „Modifica" връщаше „Valore non valido".
  class Dec {
    s = 1;
    e = 2;
    d = [100];
    toJSON() {
      return "100";
    }
  }
  const prezzo = new Dec();
  const logo = Buffer.from("x");
  const riga = { costoOrario: new Dec(), prezzo, logo, voci: [{ prezzo }] };
  const nascosti = oscuraRiservati(riga, new Set(["costoOrario"]));
  assert.equal(nascosti.prezzo, prezzo);
  assert.equal(nascosti.logo, logo);
  assert.equal(nascosti.voci[0].prezzo, prezzo);
  assert.equal(
    JSON.stringify(nascosti),
    '{"prezzo":"100","logo":{"type":"Buffer","data":[120]},"voci":[{"prezzo":"100"}]}',
  );
  // Нищо за криене — същият обект, без копие.
  assert.equal(oscuraRiservati(riga, new Set()), riga);
});
