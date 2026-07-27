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
  ALIQUOTA_AGEVOLATA,
  ALIQUOTA_ORDINARIA,
} from "../fiscale/beni-significativi";
import {
  calcolaRitenuta,
  ritenutaDovuta,
  problemiRitenuta,
  aliquotaRitenuta,
  ALIQUOTA_RITENUTA_APPALTI,
} from "../fiscale/ritenuta";
import {
  importoDaIncassare,
  statoDaIncassi,
  residuo,
  modalitaValida,
  condizioneValida,
  giorniRitardo,
  residuoFattura,
  MODALITA_PAGAMENTO,
  CONDIZIONI_PAGAMENTO,
  STATI_PAGAMENTO,
} from "../fiscale/pagamenti";
import {
  statoDaNotifica,
  scadenzaRinvio,
  numeroAncoraLibero,
  documentoEmesso,
  giaTrasmessa,
  transizioneSdiAmmessa,
  azioneRichiesta,
  STATI_SDI,
  TIPI_NOTIFICA,
  STATI_SDI_MANUALI,
  statoSdiManuale,
  TRANSIZIONI_SDI,
  GIORNI_RINVIO_DOPO_SCARTO,
} from "../fiscale/sdi-stato";
import {
  calcolaInteressi,
  regimePerDebitore,
  tassoVigente,
  TASSI_LEGALI,
  TASSI_COMMERCIALI,
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
    assert.equal(legale.tasso, 160); // 1,60 % — D.M. MEF 10.12.2025
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
    assert.match(r.motivazione, /salvo conguaglio/);
    assert.equal(tassoVigente(TASSI_LEGALI, new Date("2015-01-01")), null);
  });
});

// ── Затваряне на последните пътища ─────────────────────────────────────────

describe("удържането: ставка и таблици", () => {
  test("ставката по чл. 25-ter е 4,00 % и се пази в центесими", () => {
    // Числото влиза в XML-а като „4.00": закръгляне на плаваща запетая тук
    // означава отхвърлен документ.
    assert.equal(ALIQUOTA_RITENUTA_APPALTI, 400);
    assert.equal(aliquotaRitenuta("4.00"), 400);
    assert.equal(aliquotaRitenuta(4), 400);
    assert.equal(aliquotaRitenuta("4,00"), 400);
    // Decimal от Prisma идва като обект с `toString`.
    assert.equal(aliquotaRitenuta({ toString: () => "4.00" }), 400);
  });
});

describe("плащания: закъснение и публични таблици", () => {
  test("дните закъснение се броят НАДОЛУ, не се закръглят", () => {
    const sc = new Date("2026-03-01T00:00:00Z");
    assert.equal(giorniRitardo(sc, new Date("2026-03-01T23:59:00Z")), 0);
    assert.equal(giorniRitardo(sc, new Date("2026-03-02T00:00:00Z")), 1);
    assert.equal(giorniRitardo(sc, new Date("2026-03-31T00:00:00Z")), 30);
    // Ненастъпил падеж дава отрицателно, а не нула: „минус три дни" е
    // информация, „нула" изглежда като „днес".
    assert.equal(giorniRitardo(sc, new Date("2026-02-26T00:00:00Z")), -3);
  });

  test("кодовете MP и TP имат етикет — иначе в интерфейса излиза суровият код", () => {
    for (const [c, etichetta] of Object.entries(MODALITA_PAGAMENTO)) {
      assert.match(c, /^MP\d{2}$/);
      assert.ok(etichetta.length > 0, c);
      assert.equal(modalitaValida(c), true, c);
    }
    for (const [c, etichetta] of Object.entries(CONDIZIONI_PAGAMENTO)) {
      assert.match(c, /^TP\d{2}$/);
      assert.ok(etichetta.length > 0, c);
      assert.equal(condizioneValida(c), true, c);
    }
  });

  test("трите състояния на плащането и само те", () => {
    assert.deepEqual(
      [...STATI_PAGAMENTO],
      ["NON_PAGATA", "PARZIALE", "PAGATA"],
    );
    // Всяко състояние трябва да е достижимо от сметката, иначе е мъртво.
    assert.equal(statoDaIncassi(1000, 0), "NON_PAGATA");
    assert.equal(statoDaIncassi(1000, 400), "PARZIALE");
    assert.equal(statoDaIncassi(1000, 1000), "PAGATA");
  });
});

describe("SDI: пълнота на таблицата с преходи", () => {
  test("всяко състояние има ред в таблицата", () => {
    // Липсващ ред би дал `undefined.includes` — 500 при обикновена смяна на
    // състояние.
    for (const s of STATI_SDI) assert.ok(Array.isArray(TRANSIZIONI_SDI[s]), s);
    assert.equal(Object.keys(TRANSIZIONI_SDI).length, STATI_SDI.length);
  });

  test("на ръка се вписват САМО трите човешки състояния", () => {
    // Изходът от SDI (доставена, отказана, приета) идва от ИЗВЕСТИЕ и минава
    // само през `/notifiche`, където се записва и самото известие. Ръчно
    // поставена CONSEGNATA е твърдение без нито един документ зад него; ръчно
    // поставена SCARTATA освобождава номера за преиздаване без да е имало
    // отказ — дупка в регистъра (чл. 21, ал. 2, б. „б" D.P.R. 633/1972).
    assert.deepEqual(
      [...STATI_SDI_MANUALI],
      ["NON_INVIATA", "GENERATA", "INVIATA"],
    );
    const daNotifica = STATI_SDI.filter((s) => !statoSdiManuale(s));
    assert.deepEqual(daNotifica, [
      "CONSEGNATA",
      "MANCATA_CONSEGNA",
      "SCARTATA",
      "ACCETTATA",
      "RIFIUTATA",
      "DECORSI_TERMINI",
    ]);
    // И обратното: всеки от тях е ДОСТИЖИМ през известие — иначе списъкът би
    // заключил състояние, в което фактурата не може да влезе по никакъв път.
    for (const s of daNotifica)
      assert.ok(
        TIPI_NOTIFICA.some(
          (t) => statoDaNotifica(t, "EC02") === s || statoDaNotifica(t) === s,
        ),
        s,
      );
  });

  test("всяка цел на преход е познато състояние", () => {
    for (const [da, verso] of Object.entries(TRANSIZIONI_SDI))
      for (const a of verso)
        assert.ok((STATI_SDI as readonly string[]).includes(a), `${da}→${a}`);
  });

  test("удостоверяването на подаването НЕ мени съдбата на документа", () => {
    // AT казва „SDI получи файла", не „получателят го има".
    assert.equal(statoDaNotifica("AT"), "INVIATA");
  });

  test("срокът за преиздаване е пет дни", () => {
    assert.equal(GIORNI_RINVIO_DOPO_SCARTO, 5);
    const s = scadenzaRinvio(new Date("2026-03-10T00:00:00Z"));
    assert.equal(s.toISOString().slice(0, 10), "2026-03-15");
  });
});

describe("лихви: договорният режим", () => {
  const scadenza = new Date("2026-01-01T00:00:00Z");
  const oggi = new Date("2026-07-01T00:00:00Z");

  test("уговореният процент се ползва такъв, какъвто е", () => {
    const r = calcolaInteressi({
      capitale: 100_000,
      scadenza,
      oggi,
      regime: "CONTRATTUALE",
      tassoContrattuale: 800,
    });
    assert.equal(r.tasso, 800);
    assert.ok(r.importo > 0);
    assert.match(r.motivazione, /contratt/i);
  });

  test("договорен режим БЕЗ уговорен процент не измисля число", () => {
    // Измислена лихва в покана за плащане е искане на пари без основание.
    const r = calcolaInteressi({
      capitale: 100_000,
      scadenza,
      oggi,
      regime: "CONTRATTUALE",
    });
    assert.equal(r.tasso, null);
    assert.equal(r.importo, 0);
  });

  test("търговската таблица е подредена и покрива полугодията", () => {
    // Стойностите се обявяват на 1 януари и 1 юли; несортирана таблица би
    // върнала ставка от грешно полугодие.
    for (let i = 1; i < TASSI_COMMERCIALI.length; i++)
      assert.ok(TASSI_COMMERCIALI[i].dal > TASSI_COMMERCIALI[i - 1].dal);
    for (let i = 1; i < TASSI_LEGALI.length; i++)
      assert.ok(TASSI_LEGALI[i].dal > TASSI_LEGALI[i - 1].dal);
    // Comunicato MEF, G.U. n. 161 del 14.07.2025 — 2,15 % + 8.
    assert.equal(
      tassoVigente(TASSI_COMMERCIALI, new Date("2025-08-01T00:00:00Z")),
      1015,
    );
    // ТАБЛИЦАТА КАЗВА ДОКЪДЕ ЗНАЕ. Ставка за непокрит период е измислено
    // число в покана за плащане — по-добре „не знам" отколкото продължена
    // мълчаливо последна стойност. Точно този механизъм вкара 2,00 % в 2026 г.
    for (let i = 1; i < TASSI_COMMERCIALI.length; i++)
      assert.equal(TASSI_COMMERCIALI[i].dal, TASSI_COMMERCIALI[i - 1].al);
    for (let i = 1; i < TASSI_LEGALI.length; i++)
      assert.equal(TASSI_LEGALI[i].dal, TASSI_LEGALI[i - 1].al);
    const ultimo = TASSI_COMMERCIALI[TASSI_COMMERCIALI.length - 1];
    assert.equal(tassoVigente(TASSI_COMMERCIALI, new Date(ultimo.al)), null);
  });

  // РЕГРЕСИЯ: ставката се вземаше КЪМ ПАДЕЖА и се прилагаше за целия период.
  // Фактура с падеж 15.01.2023, оставена да тече, получаваше 5,00 % за три
  // години вместо 5 %(2023) + 2,5 %(2024) + 2 %(2025) + 1,6 %(2026) — тоест
  // около двойно повече от дължимото, замразено после в „messa in mora".
  test("лихвата тече по ставката на всеки период, не по тази при падежа", () => {
    const r = calcolaInteressi({
      capitale: 1_000_000, // 10 000,00 €
      scadenza: new Date("2023-01-15T00:00:00Z"),
      oggi: new Date("2026-01-15T00:00:00Z"),
      regime: "LEGALE",
    });
    assert.equal(r.giorniNonCoperti, 0);
    assert.deepEqual(
      r.tratti.map((t) => t.tasso),
      [500, 250, 200, 160],
    );
    // Сборът на отрязъците Е тоталът: поканата показва разбивката и тя трябва
    // да дава точно числото отдолу.
    assert.equal(
      r.importo,
      r.tratti.reduce((s, t) => s + t.importo, 0),
    );
    // Старото поведение (5 % за целия период) би дало около 150 000 центесими.
    const vecchio = Math.round((1_000_000 * 500 * r.giorni) / 3_650_000);
    assert.ok(r.importo < vecchio * 0.75, `${r.importo} vs ${vecchio}`);
  });

  // ОЦЕЛЯЛА МУТАЦИЯ: `Math.round` → `Math.floor` в `quota()` не чупеше нищо.
  //
  // `toCents` носи същата граница от по-рано; `quota` е ВТОРА имплементация на
  // закръгляне в същия домейн и стоеше без нея. Занижаване с половин цент на
  // ред е системно, не случайно: лихвата се замразява в поканата.
  test("лихвата се закръглява half-up, не надолу", () => {
    // Подбрано така, че `capitale × tasso × giorni / 3 650 000` да падне точно
    // на .5: 3 650 000 × 2,5 = 9 125 000 = 1 000 000 × 365 × 25 дни.
    const meta = calcolaInteressi({
      capitale: 1_000_000,
      scadenza: new Date("2026-02-01T00:00:00Z"),
      oggi: new Date("2026-02-26T00:00:00Z"), // 25 дни
      regime: "LEGALE", // 1,60 % през 2026
    });
    assert.equal(meta.giorni, 25);
    // 1 000 000 × 160 × 25 / 3 650 000 = 1095,890… → 1096, не 1095.
    assert.equal(meta.importo, 1096);

    // И обратната посока: точно .5 отива НАГОРЕ.
    const suMezzo = calcolaInteressi({
      capitale: 365_000,
      scadenza: new Date("2026-02-01T00:00:00Z"),
      oggi: new Date("2026-02-02T00:00:00Z"), // 1 ден
      regime: "CONTRATTUALE",
      tassoContrattuale: 500, // 365 000 × 500 × 1 / 3 650 000 = 50,0
    });
    assert.equal(suMezzo.importo, 50);
  });

  test("непокрит период НЕ се остойностява мълчаливо", () => {
    const ultimo = TASSI_COMMERCIALI[TASSI_COMMERCIALI.length - 1];
    const r = calcolaInteressi({
      capitale: 1_000_000,
      scadenza: new Date(ultimo.dal),
      oggi: new Date(Date.parse(ultimo.al) + 30 * 86_400_000),
      regime: "COMMERCIALE",
    });
    assert.equal(r.giorniNonCoperti, 30);
    assert.match(r.motivazione, /salvo conguaglio/);
    // Покритата част СЕ смята: отказ на всичко би скрил и известното.
    assert.ok(r.importo > 0);
  });
});

describe("beni significativi: недопустима ставка", () => {
  test("в този режим минават САМО 10 % и 22 %", () => {
    // Режимът е изключение по D.M. 29.12.1999: трета ставка в него значи, че
    // документът е сглобен по друго правило и разцепването не важи.
    assert.equal(ALIQUOTA_AGEVOLATA, 1000);
    assert.equal(ALIQUOTA_ORDINARIA, 2200);
    const p = problemiBeniSignificativi([
      {
        descrizione: "Quadro di manovra",
        quantita: "1",
        prezzoUnitario: "1000.00",
        aliquotaIva: "4",
        beneSignificativo: true,
      },
    ]);
    assert.ok(
      p.some((x) => /10 %|22 %/.test(x)),
      p.join(" | "),
    );
  });
});

describe("остатъкът по фактура — едно правило, едно място", () => {
  const base = {
    totaleNetto: "1000.00",
    totaleIva: "220.00",
    ritenutaImporto: null,
    splitPayment: false,
    pagamenti: [] as { importo: string }[],
  };

  test("обикновена фактура: брутото минус платеното", () => {
    assert.equal(residuoFattura(base), 122_000);
    assert.equal(
      residuoFattura({ ...base, pagamenti: [{ importo: "500" }] }),
      72_000,
    );
    // Надплатена фактура не дава отрицателно вземане.
    assert.equal(
      residuoFattura({ ...base, pagamenti: [{ importo: "2000" }] }),
      0,
    );
  });

  test("удържането по чл. 25-ter НЕ се търси от клиента", () => {
    // 4 % върху 1000 = 40 €: тях получателят плаща на данъчната администрация.
    assert.equal(
      residuoFattura({ ...base, ritenutaImporto: "40.00" }),
      118_000,
    );
  });

  test("при разделено плащане ДДС-то не минава през нас", () => {
    assert.equal(residuoFattura({ ...base, splitPayment: true }), 100_000);
  });

  test("липсващо удържане значи нула, не грешка", () => {
    // Решението е взето ВЕДНЪЖ: преди това `?? 0` стоеше на три места.
    assert.equal(
      residuoFattura({ ...base, ritenutaImporto: null }),
      residuoFattura({ ...base, ritenutaImporto: "0" }),
    );
  });
});

describe("файлът вече е тръгнал към SDI", () => {
  test("повторно подаване се спира, а отхвърленото — не", () => {
    // SDI отхвърля повторно ИМЕ на файл независимо от съдържанието.
    for (const s of [
      "INVIATA",
      "CONSEGNATA",
      "MANCATA_CONSEGNA",
      "ACCETTATA",
      "RIFIUTATA",
      "DECORSI_TERMINI",
    ] as const)
      assert.equal(giaTrasmessa(s), true, s);
    // `SCARTATA` е обратното: файлът НЕ е приет, номерът е свободен и
    // подаването се повтаря след поправка.
    for (const s of ["NON_INVIATA", "GENERATA", "SCARTATA"] as const)
      assert.equal(giaTrasmessa(s), false, s);
  });

  test("покрива всеки статус от изброяването", () => {
    // Нов статус утре трябва да мине СЪЗНАТЕЛНО през това решение, а не да
    // попадне в „още не е тръгнала" по подразбиране.
    for (const s of STATI_SDI) assert.equal(typeof giaTrasmessa(s), "boolean");
  });
});
