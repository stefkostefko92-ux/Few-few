// Фискалните правила носят правна тежест — тестват се като чиста логика.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  transizioneFatturaAmmessa,
  transizionePreventivoAmmessa,
  documentoModificabile,
  fatturaEliminabile,
  deltaGiacenza,
  quantitaValida,
  TRANSIZIONI_FATTURA,
  TRANSIZIONI_PREVENTIVO,
  STATI_FATTURA,
  STATI_PREVENTIVO,
} from "../regole-fiscali";

describe("преходи на фактурата", () => {
  test("нормалният път минава", () => {
    assert.ok(transizioneFatturaAmmessa("BOZZA", "EMESSA"));
    assert.ok(transizioneFatturaAmmessa("EMESSA", "INVIATA"));
    assert.ok(transizioneFatturaAmmessa("INVIATA", "PAGATA"));
  });

  test("издаденият документ не се връща в чернова", () => {
    for (const da of [
      "EMESSA",
      "INVIATA",
      "PAGATA",
      "SCADUTA",
      "STORNATA",
    ] as const) {
      assert.equal(
        transizioneFatturaAmmessa(da, "BOZZA"),
        false,
        `${da} → BOZZA`,
      );
    }
  });

  test("платената приема само сторно", () => {
    assert.deepEqual(TRANSIZIONI_FATTURA.PAGATA, ["STORNATA"]);
  });

  test("сторнираната е финална", () => {
    assert.deepEqual(TRANSIZIONI_FATTURA.STORNATA, []);
    for (const a of ["BOZZA", "EMESSA", "PAGATA"] as const) {
      assert.equal(transizioneFatturaAmmessa("STORNATA", a), false);
    }
  });

  test("сторно е достижимо от всяко издадено състояние", () => {
    for (const da of ["EMESSA", "INVIATA", "PAGATA", "SCADUTA"] as const) {
      assert.ok(transizioneFatturaAmmessa(da, "STORNATA"), `${da} → STORNATA`);
    }
  });
});

describe("преходи на офертата", () => {
  test("одобрената и отхвърлената са финални", () => {
    assert.deepEqual(TRANSIZIONI_PREVENTIVO.APPROVATO, []);
    assert.deepEqual(TRANSIZIONI_PREVENTIVO.RIFIUTATO, []);
    assert.equal(transizionePreventivoAmmessa("RIFIUTATO", "BOZZA"), false);
    assert.equal(transizionePreventivoAmmessa("APPROVATO", "INVIATO"), false);
  });

  test("изтеклата може да се преиздаде", () => {
    assert.ok(transizionePreventivoAmmessa("SCADUTO", "INVIATO"));
  });

  test("не се прескача от чернова направо в одобрена", () => {
    assert.equal(transizionePreventivoAmmessa("BOZZA", "APPROVATO"), false);
  });
});

describe("променимост", () => {
  test("без списък всичко е променимо", () => {
    assert.equal(documentoModificabile("QUALSIASI", undefined), true);
  });

  test("списъкът се спазва", () => {
    assert.equal(documentoModificabile("BOZZA", ["BOZZA"]), true);
    assert.equal(documentoModificabile("EMESSA", ["BOZZA"]), false);
    assert.equal(documentoModificabile("INVIATO", ["BOZZA", "INVIATO"]), true);
  });

  test("само черновата се трие", () => {
    assert.equal(fatturaEliminabile("BOZZA"), true);
    for (const s of ["EMESSA", "INVIATA", "PAGATA", "SCADUTA", "STORNATA"]) {
      assert.equal(fatturaEliminabile(s), false, s);
    }
  });
});

describe("склад", () => {
  test("знакът на движението", () => {
    assert.equal(deltaGiacenza("ENTRATA", 5), 5);
    assert.equal(deltaGiacenza("USCITA", 5), -5);
    assert.equal(deltaGiacenza("RETTIFICA", -3), -3);
    assert.equal(deltaGiacenza("RETTIFICA", 3), 3);
  });

  test("валидност на количеството", () => {
    assert.equal(quantitaValida("ENTRATA", 1), true);
    assert.equal(quantitaValida("ENTRATA", 0), false);
    assert.equal(quantitaValida("USCITA", -1), false);
    assert.equal(quantitaValida("RETTIFICA", -3), true);
    assert.equal(quantitaValida("RETTIFICA", 0), false);
    assert.equal(quantitaValida("ENTRATA", 1.5), false);
  });
});

test("списъците със състояния са пълни и без дубли", () => {
  // От тях се строят падащите менюта и проверките за променимост: дубъл значи
  // два еднакви реда в менюто, липса значи документ, който не може да се смени.
  for (const lista of [STATI_FATTURA, STATI_PREVENTIVO]) {
    assert.ok(lista.length > 0);
    assert.equal(new Set(lista).size, lista.length);
  }
  assert.ok((STATI_FATTURA as readonly string[]).includes("STORNATA"));
  assert.ok((STATI_PREVENTIVO as readonly string[]).includes("SCADUTO"));
});
