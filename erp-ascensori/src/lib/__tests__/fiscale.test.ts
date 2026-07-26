// Фискалните правила, които носят правна тежест — тестват се без база.
//
// Всеки от тези модули заменя решение, което дотук се вземаше наум или изобщо
// не се вземаше. Затова тук стоят и НЕОЧЕВИДНИТЕ случаи: горницата над
// престацията, кондоминиумът срещу предприятието, отхвърленият документ.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  ripartizioneBeniSignificativi,
  baseImponibili,
  righeRipartite,
  problemiBeniSignificativi,
} from "../fiscale/beni-significativi";
import {
  calcolaRitenuta,
  ritenutaDovuta,
  problemiRitenuta,
} from "../fiscale/ritenuta";
import {
  importoDaIncassare,
  statoDaIncassi,
  residuo,
  modalitaValida,
  condizioneValida,
} from "../fiscale/pagamenti";
import {
  statoDaNotifica,
  scadenzaRinvio,
  numeroAncoraLibero,
  documentoEmesso,
  transizioneSdiAmmessa,
  azioneRichiesta,
} from "../fiscale/sdi-stato";
import {
  calcolaInteressi,
  regimePerDebitore,
  tassoVigente,
  TASSI_LEGALI,
} from "../fiscale/interessi";

describe("значими блага (D.M. 29.12.1999)", () => {
  test("облекчението стига дотам, докъдето стига престацията", () => {
    // Асансьор 8 000 €, монтаж и труд 3 000 € — общо 11 000 €.
    const r = ripartizioneBeniSignificativi(300_000, 800_000);
    assert.equal(r.imponibileAgevolato, 600_000); // 3 000 + 3 000
    assert.equal(r.imponibileOrdinario, 500_000); // горницата: 8 000 − 3 000
    assert.equal(r.eccedenza, true);
    // Двете основи винаги се събират до цялата стойност на доставката.
    assert.equal(
      r.imponibileAgevolato + r.imponibileOrdinario,
      300_000 + 800_000,
    );
  });

  test("благо под престацията минава изцяло с намалената ставка", () => {
    const r = ripartizioneBeniSignificativi(500_000, 200_000);
    assert.equal(r.imponibileAgevolato, 700_000);
    assert.equal(r.imponibileOrdinario, 0);
    assert.equal(r.eccedenza, false);
  });

  test("без значимо благо цялата основа е облекчена", () => {
    const r = ripartizioneBeniSignificativi(120_000, 0);
    assert.equal(r.imponibileAgevolato, 120_000);
    assert.equal(r.imponibileOrdinario, 0);
  });

  test("основите се четат от отметките по редовете", () => {
    const voci = [
      {
        descrizione: "Manodopera",
        quantita: "20",
        prezzoUnitario: "35.00",
        aliquotaIva: "10",
      },
      {
        descrizione: "Quadro di manovra",
        quantita: "1",
        prezzoUnitario: "4200.00",
        aliquotaIva: "10",
        beneSignificativo: true,
      },
    ];
    assert.deepEqual(baseImponibili(voci), {
      prestazione: 70_000,
      beneSignificativo: 420_000,
    });
  });

  test("разцепването ражда трите законови реда — с изричните стойности", () => {
    const righe = righeRipartite([
      {
        descrizione: "Posa",
        quantita: "1",
        prezzoUnitario: "3000.00",
        aliquotaIva: "10",
      },
      {
        descrizione: "Ascensore",
        quantita: "1",
        prezzoUnitario: "8000.00",
        aliquotaIva: "10",
        beneSignificativo: true,
      },
    ]);
    assert.equal(righe.length, 3);
    assert.equal(righe[0].prezzoUnitario, "3000.00");
    assert.equal(righe[0].aliquotaIva, "10.00");
    assert.equal(righe[1].prezzoUnitario, "3000.00");
    assert.equal(righe[1].aliquotaIva, "10.00");
    // Горницата — с обикновената ставка. Всичко на 10 % е недобор от ДДС.
    assert.equal(righe[2].prezzoUnitario, "5000.00");
    assert.equal(righe[2].aliquotaIva, "22.00");
    // Чл. 1, ал. 19 от закон 205/2017: стойностите трябва да ЛИЧАТ в документа.
    assert.match(righe[1].descrizione, /bene significativo/i);
    assert.match(righe[0].descrizione, /prestazione/i);
  });

  test("режим без нито едно значимо благо е безпредметен", () => {
    const p = problemiBeniSignificativi([
      {
        descrizione: "Manodopera",
        quantita: "1",
        prezzoUnitario: "100",
        aliquotaIva: "10",
      },
    ]);
    assert.ok(p.some((x) => /nessuna riga/.test(x)));
  });

  test("благо без престация не носи облекчение", () => {
    const p = problemiBeniSignificativi([
      {
        descrizione: "Ascensore",
        quantita: "1",
        prezzoUnitario: "8000",
        aliquotaIva: "10",
        beneSignificativo: true,
      },
    ]);
    assert.ok(p.some((x) => /senza posa in opera/.test(x)));
  });
});

describe("ritenuta d'acconto (чл. 25-ter D.P.R. 600/1973)", () => {
  test("4 % върху ОСНОВАТА, не върху брутото", () => {
    const r = calcolaRitenuta(100_000, 22_000, 400);
    assert.equal(r.importo, 4_000); // 1 000,00 · 4 % = 40,00
    assert.equal(r.netto, 118_000); // 1 220,00 − 40,00
  });

  test("закръглянето е половин нагоре, веднъж", () => {
    // 123,45 · 4 % = 4,938 → 4,94
    assert.equal(calcolaRitenuta(12_345, 0, 400).importo, 494);
  });

  test("дължи се от кондоминиума, не от студиото", () => {
    assert.equal(ritenutaDovuta({ condominio: true }), true);
    assert.equal(
      ritenutaDovuta({ condominio: true, sostitutoImposta: false }),
      false,
    );
    assert.equal(ritenutaDovuta({ condominio: false }), false);
  });

  test("удържане при получател, който не е кондоминиум, е грешка", () => {
    const p = problemiRitenuta({
      ritenuta: true,
      ritenutaTipo: "RT02",
      ritenutaCausale: "W",
      aliquota: 400,
      destinatarioCondominio: false,
    });
    assert.ok(p.some((x) => /non è un condominio/.test(x)));
  });
});

describe("плащания", () => {
  test("очакваното НЕ е брутото, когато има удържане", () => {
    assert.equal(
      importoDaIncassare({
        imponibile: 100_000,
        imposta: 22_000,
        ritenuta: 4_000,
        splitPayment: false,
      }),
      118_000,
    );
  });

  test("при разцепено плащане ДДС-то изобщо не минава през нас", () => {
    assert.equal(
      importoDaIncassare({
        imponibile: 100_000,
        imposta: 22_000,
        ritenuta: 0,
        splitPayment: true,
      }),
      100_000,
    );
  });

  test("статусът се извежда от постъпленията", () => {
    assert.equal(statoDaIncassi(118_000, 0), "NON_PAGATA");
    assert.equal(statoDaIncassi(118_000, 50_000), "PARZIALE");
    assert.equal(statoDaIncassi(118_000, 118_000), "PAGATA");
    // Надплащането е въпрос на кредитно известие, не повод фактурата да стои
    // отворена.
    assert.equal(statoDaIncassi(118_000, 120_000), "PAGATA");
    assert.equal(residuo(118_000, 120_000), 0);
    assert.equal(residuo(118_000, 50_000), 68_000);
  });

  test("кодировките са тези на SDI", () => {
    assert.equal(modalitaValida("MP05"), true);
    assert.equal(modalitaValida("MP99"), false);
    assert.equal(condizioneValida("TP01"), true);
    assert.equal(condizioneValida("TP09"), false);
  });
});

describe("път през SDI", () => {
  test("известието определя съдбата на документа", () => {
    assert.equal(statoDaNotifica("RC"), "CONSEGNATA");
    assert.equal(statoDaNotifica("NS"), "SCARTATA");
    assert.equal(statoDaNotifica("MC"), "MANCATA_CONSEGNA");
    assert.equal(statoDaNotifica("NE", "EC01"), "ACCETTATA");
    assert.equal(statoDaNotifica("NE", "EC02"), "RIFIUTATA");
    assert.equal(statoDaNotifica("DT"), "DECORSI_TERMINI");
  });

  test("отхвърленият документ НЕ е издаден и номерът му остава свободен", () => {
    assert.equal(numeroAncoraLibero("SCARTATA"), true);
    assert.equal(documentoEmesso("SCARTATA"), false);
    // Неуспешната доставка е друго: документът Е издаден, стои в кутията в AdE.
    assert.equal(documentoEmesso("MANCATA_CONSEGNA"), true);
    assert.equal(numeroAncoraLibero("MANCATA_CONSEGNA"), false);
  });

  test("срокът за преиздаване е 5 дни от известието и е закръглен на ден", () => {
    const s = scadenzaRinvio(new Date("2026-03-10T23:45:00Z"));
    assert.equal(s.toISOString(), "2026-03-15T00:00:00.000Z");
  });

  test("от отхвърлена се преиздава; приетата е финална", () => {
    assert.equal(transizioneSdiAmmessa("SCARTATA", "GENERATA"), true);
    assert.equal(transizioneSdiAmmessa("ACCETTATA", "GENERATA"), false);
    assert.equal(transizioneSdiAmmessa("CONSEGNATA", "INVIATA"), false);
  });

  test("статусът казва какво да се направи ДНЕС", () => {
    const oggi = new Date("2026-03-12T09:00:00Z");
    assert.match(
      azioneRichiesta("SCARTATA", new Date("2026-03-15T00:00:00Z"), oggi) ?? "",
      /entro 3 giorni/,
    );
    assert.match(
      azioneRichiesta("SCARTATA", new Date("2026-03-01T00:00:00Z"), oggi) ?? "",
      /termine di 5 giorni superato/,
    );
    assert.equal(azioneRichiesta("CONSEGNATA", null, oggi), null);
  });
});

describe("лихва при забава", () => {
  test("кондоминиумът НЕ е предприятие — важи чл. 1284 c.c., не 231/2002", () => {
    assert.equal(regimePerDebitore({ condominio: true }), "LEGALE");
    assert.equal(
      regimePerDebitore({ condominio: false, partitaIva: "12345678901" }),
      "COMMERCIALE",
    );
    assert.equal(
      regimePerDebitore({ condominio: true, pubblicaAmministrazione: true }),
      "COMMERCIALE",
    );
    assert.equal(
      regimePerDebitore({ condominio: true, tassoContrattuale: 500 }),
      "CONTRATTUALE",
    );
  });

  test("двата режима дават драстично различни числа", () => {
    const base = {
      capitale: 100_000,
      scadenza: new Date("2026-01-31"),
      oggi: new Date("2026-03-02"),
    };
    const legale = calcolaInteressi({ ...base, regime: "LEGALE" });
    const commerciale = calcolaInteressi({ ...base, regime: "COMMERCIALE" });
    assert.equal(legale.giorni, 30);
    assert.equal(legale.tasso, 200); // 2,00 %
    assert.equal(commerciale.tasso, 1015); // 10,15 %
    assert.ok(commerciale.importo > legale.importo * 4);
    assert.match(legale.motivazione, /1284/);
  });

  test("преди падежа лихва няма", () => {
    const r = calcolaInteressi({
      capitale: 100_000,
      scadenza: new Date("2026-05-01"),
      oggi: new Date("2026-04-01"),
      regime: "LEGALE",
    });
    assert.equal(r.importo, 0);
    assert.equal(r.giorni, 0);
  });

  test("неизвестна ставка връща нула и КАЗВА защо", () => {
    const r = calcolaInteressi({
      capitale: 100_000,
      scadenza: new Date("2015-01-01"),
      oggi: new Date("2015-06-01"),
      regime: "LEGALE",
    });
    assert.equal(r.tasso, null);
    assert.equal(r.importo, 0);
    assert.match(r.motivazione, /aggiornare la tabella/);
    assert.equal(tassoVigente(TASSI_LEGALI, new Date("2015-01-01")), null);
  });
});
