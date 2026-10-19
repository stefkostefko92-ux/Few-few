// Документ от документ: преводът на редовете, без база.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vociDaPreventivo,
  vociDaMateriali,
  righeDdtDaMateriali,
  raggruppaMateriali,
  STATO_PREVENTIVO_GENERABILE,
  type MaterialeUsato,
} from "../genera-documenti";

const fune: MaterialeUsato = {
  articoloId: "a",
  codice: "FUNE-10",
  nome: "Fune Ø10",
  quantita: 30,
  prezzoVendita: "7.90",
  aliquotaIva: "22",
};
const morsetto: MaterialeUsato = {
  articoloId: "b",
  codice: "MORS",
  nome: "Morsetto",
  quantita: 4,
  prezzoVendita: null,
  aliquotaIva: "22",
};

test("редовете на офертата минават в нейния ред, цената непокътната", () => {
  const v = vociDaPreventivo([
    {
      descrizione: "Manodopera",
      quantita: "12.00",
      prezzoUnitario: "45.00",
      aliquotaIva: "22.00",
      naturaIva: null,
      ordine: 5,
    },
    {
      descrizione: "Fune",
      quantita: "60.00",
      prezzoUnitario: "7.90",
      aliquotaIva: "22.00",
      naturaIva: null,
      ordine: 1,
    },
  ]);
  assert.deepEqual(
    v.map((x) => [x.descrizione, x.prezzoUnitario, x.ordine]),
    [
      ["Fune", "7.90", 0],
      ["Manodopera", "45.00", 1],
    ],
  );
});

test("един артикул от два рапортина е един ред с общото количество", () => {
  const r = raggruppaMateriali([fune, { ...fune, quantita: 30 }, morsetto]);
  assert.equal(r.length, 2);
  assert.equal(r[0].quantita, 60);
  // Нулевото количество (върнат материал) не става ред.
  assert.equal(raggruppaMateriali([{ ...fune, quantita: 0 }]).length, 0);
});

test("артикул без продажна цена: цена 0 и предупреждение, не измислена цена", () => {
  const { voci, senzaPrezzo } = vociDaMateriali([fune, morsetto], 2);
  assert.deepEqual(senzaPrezzo, ["MORS — Morsetto"]);
  assert.equal(voci[1].prezzoUnitario, "0");
  assert.equal(voci[0].prezzoUnitario, "7.90");
  assert.deepEqual(
    voci.map((v) => v.ordine),
    [2, 3],
  );
});

test("редовете на DDT носят стоката и количеството, без цени", () => {
  const r = righeDdtDaMateriali([fune, morsetto]);
  assert.deepEqual(r[0], {
    descrizione: "FUNE-10 — Fune Ø10",
    quantita: "30",
    um: "pz",
    ordine: 0,
  });
  assert.equal("prezzoUnitario" in r[0], false);
});

test("от оферта се ражда само приета оферта", () => {
  assert.equal(STATO_PREVENTIVO_GENERABILE, "APPROVATO");
});
