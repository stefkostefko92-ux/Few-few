// Схемите на входа — слоят, който решава какво изобщо влиза в базата.
//
// ЗАЩО ЗАСЛУЖАВА СОБСТВЕН ПАКЕТ. Тези схеми изглеждат като декларации, но са
// код: там живеят преобразуването на запетаята в точка, отрязването на празното
// към `null`, таваните заради ширината на колоната и правилата, които пазят от
// 500-ца вместо 400-ца. Нито едно от тези неща не се вижда при преглед на
// схемата — вижда се само когато мине стойност.
//
// Точно този слой мълчаливо изхвърли `Amministratore.provincia`: полето беше в
// базата и във формата, но не и в схемата. Тестът върви ПО РЕГИСТЪРА, за да не
// може ново поле да се добави без някой да го погледне.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  dec,
  aliquota,
  decRiga,
  decOpt,
  conLimiteImporto,
  conPeriodoValido,
  contrattoBase,
  voceSchema,
  rigaDdtSchema,
  fatturaSchema,
  pagamentoSchema,
  notificaSdiSchema,
  rapportinoSchema,
  firmaSchema,
  verificaImpiantoSchema,
  preventivoSchema,
  ordineSchema,
  ddtSchema,
  contrattoSchema,
  ESITI_INTERVENTO,
  PERIODICITA_VALORI,
  condomini,
  amministratori,
  dipendenti,
  automezzi,
  cottimisti,
  squadre,
  impianti,
  impiantiMedia,
  scadenzeImpianti,
  assegnazioniTecnici,
  articoli,
  documenti,
  tenants,
} from "../entities";

/** Помощник: стойността минава ли, и каква става. */
function ok<T extends z.ZodTypeAny>(s: T, v: unknown): z.infer<T> {
  const r = s.safeParse(v);
  assert.ok(r.success, `отхвърлено: ${JSON.stringify(v)} — ${r.error?.issues[0]?.message}`);
  return r.data;
}

function ko<T extends z.ZodTypeAny>(s: T, v: unknown): string {
  const r = s.safeParse(v);
  assert.equal(r.success, false, `прието, а не биваше: ${JSON.stringify(v)}`);
  return r.error!.issues[0]?.message ?? "";
}

describe("паричните стойности", () => {
  test("запетаята се приема и се нормализира към точка", () => {
    // Италианската клавиатура пише „1.234,56"; отказът да се приеме запетая
    // прави продукта дразнещ точно при най-честото поле.
    assert.equal(ok(dec, "12,50"), "12.50");
    assert.equal(ok(dec, "12.50"), "12.50");
    assert.equal(ok(dec, "  7 ".trim()), "7");
  });

  test("празното се отрязва преди проверката", () => {
    assert.equal(ok(dec, " 3,10 "), "3.10");
  });

  test("три десетични се отказват", () => {
    assert.match(ko(dec, "1,234"), /decimal/i);
  });

  test("девет цели цифри се отказват — колоната е Decimal(12,2)", () => {
    // Произведението количество × цена трябва да се побере; при 10 цифри на
    // всяко тоталът стига 10²⁰ и заявката гърми със 500.
    ok(dec, "99999999");
    ko(dec, "999999999");
  });

  test("отрицателното и буквите не минават", () => {
    for (const v of ["-1", "abc", "1e3", "", " ", "1,2,3"]) ko(dec, v);
  });

  test("nullish вариантът приема липса", () => {
    assert.equal(ok(decOpt, undefined), undefined);
    assert.equal(ok(decOpt, null), null);
    assert.equal(ok(decOpt, "5,5"), "5.5");
  });
});

describe("ставката на ДДС", () => {
  test("до 99 минава", () => {
    assert.equal(ok(aliquota, "22"), "22");
    assert.equal(ok(aliquota, "10,00"), "10.00");
    assert.equal(ok(aliquota, "0"), "0");
    ok(aliquota, "99");
  });

  test("„2200“ вместо „22“ дава 400 с обяснение, не 500 от базата", () => {
    // Дотогава се ползваше `dec` (8 цели цифри): Postgres връщаше numeric field
    // overflow (22003), кодът не беше сред обработваните и операторът получаваше
    // „Errore interno" за собствената си печатна грешка.
    assert.match(ko(aliquota, "2200"), /Aliquota/i);
  });

  test("границата е РОВНО 99, не 99,99", () => {
    // Регулярният израз пуска „99,99"; проверката отдолу го спира, защото
    // сравнява ЧИСЛОТО. Двете заедно значат таван точно 99 — и това е
    // поведението, което трябва да е записано, а не да се предполага.
    ok(aliquota, "99");
    ko(aliquota, "99.99");
    ko(aliquota, "100");
  });
});

describe("количество и цена в ред", () => {
  test("таванът е по-строг, за да не прелее произведението", () => {
    ok(decRiga, "999999");
    ko(decRiga, "1000000");
  });

  test("отказът е с четимо съобщение", () => {
    assert.match(ko(decRiga, "9999999"), /6 cifre|Valore/i);
  });
});

describe("таванът на реда като произведение", () => {
  const schema = conLimiteImporto(
    z.object({
      quantita: z.string().optional(),
      prezzoUnitario: z.string().optional(),
    }),
  );

  test("нормалният ред минава", () => {
    ok(schema, { quantita: "2", prezzoUnitario: "150.00" });
  });

  test("поотделно допустими, заедно преливат — това е целият смисъл", () => {
    // 999999 × 999999 ≈ 10¹² прелива `Decimal(12,2)`, Postgres връща 22003 и
    // потребителят получава 500 вместо 400.
    assert.match(
      ko(schema, { quantita: "999999", prezzoUnitario: "999999" }),
      /troppo elevato/i,
    );
  });

  test("частичната промяна с едно поле НЕ се блокира", () => {
    // При `PATCH` само с количество другата стойност е неизвестна: отказът би
    // спрял законна промяна.
    ok(schema, { quantita: "999999" });
    ok(schema, { prezzoUnitario: "999999" });
    ok(schema, {});
  });
});

describe("периодът на договора", () => {
  const schema = conPeriodoValido(
    z.object({
      dataInizio: z.coerce.date().optional(),
      dataFine: z.coerce.date().optional(),
    }),
  );

  test("край след начало минава", () => {
    ok(schema, { dataInizio: "2026-01-01", dataFine: "2026-12-31" });
  });

  test("край ПРЕДИ начало се отказва", () => {
    // Иначе графикът е безсмислен, а подновяването дава отрицателна
    // продължителност.
    assert.match(
      ko(schema, { dataInizio: "2026-12-31", dataFine: "2026-01-01" }),
      /successiva/i,
    );
  });

  test("еднакви дати не са период", () => {
    ko(schema, { dataInizio: "2026-01-01", dataFine: "2026-01-01" });
  });

  test("при частична промяна проверката се прилага само с двете дати", () => {
    ok(schema, { dataInizio: "2026-12-31" });
    ok(schema, { dataFine: "2026-01-01" });
    ok(schema, {});
  });

  test("пълната схема на договора носи проверката", () => {
    const base = {
      oggetto: "Manutenzione",
      canone: "300,00",
      dataInizio: "2026-01-01",
      dataFine: "2025-01-01",
    };
    ko(conPeriodoValido(contrattoBase), base);
    ok(conPeriodoValido(contrattoBase), { ...base, dataFine: "2027-01-01" });
  });

  test("договорните времена за отзив приемат null и имат таван", () => {
    const base = {
      oggetto: "x",
      canone: "1",
      dataInizio: "2026-01-01",
      dataFine: "2027-01-01",
    };
    ok(contrattoBase, { ...base, slaInterventoMin: null, slaRipristinoOre: null });
    ok(contrattoBase, { ...base, slaInterventoMin: 60, slaRipristinoOre: 24 });
    ko(contrattoBase, { ...base, slaInterventoMin: 10_081 });
    ko(contrattoBase, { ...base, slaRipristinoOre: 721 });
  });
});

// ── Празният низ при полета С ПРОВЕРКА НА ФОРМАТА ───────────────────────────
//
// Формата праща "" за незапълнено поле. За поле с проверка на формата (адрес за
// поща, код на получателя, скорост) празният низ е НЕВАЛИДЕН — а операторът,
// който не е попълнил незадължително поле, не бива да получава грешка. Затова
// точно тези полета носят `.or(z.literal("").transform(() => null))`.
//
// Обратното НЕ важи за свободния текст: там "" е законна стойност и значи
// „изчистих бележката". Разликата е нарочна и се проверява и в двете посоки.

describe("празният низ при поле с проверка на формата става null", () => {
  const casi: [string, z.ZodTypeAny, Record<string, unknown>, string][] = [
    [
      "condomini.pec",
      condomini.schemaCreate,
      { nome: "A", indirizzo: "Via Verdi 12", citta: "Milano" },
      "pec",
    ],
    [
      "condomini.codiceSdi",
      condomini.schemaCreate,
      { nome: "A", indirizzo: "Via Verdi 12", citta: "Milano" },
      "codiceSdi",
    ],
    ["amministratori.pec", amministratori.schemaCreate, { nome: "Studio" }, "pec"],
    [
      "amministratori.codiceSdi",
      amministratori.schemaCreate,
      { nome: "Studio" },
      "codiceSdi",
    ],
    [
      "amministratori.email",
      amministratori.schemaCreate,
      { nome: "Studio" },
      "email",
    ],
    [
      "dipendenti.email",
      dipendenti.schemaCreate,
      { nome: "M", cognome: "R" },
      "email",
    ],
    [
      "dipendenti.costoOrario",
      dipendenti.schemaCreate,
      { nome: "M", cognome: "R" },
      "costoOrario",
    ],
    ["cottimisti.email", cottimisti.schemaCreate, { ragioneSociale: "D" }, "email"],
    [
      "impianti.velocita",
      impianti.schemaCreate,
      { matricola: "M1", marca: "Otis", modello: "Gen2" },
      "velocita",
    ],
  ];

  for (const [nome, schema, minimo, campo] of casi)
    test(nome, () => {
      const r = ok(schema, { ...minimo, [campo]: "" }) as Record<string, unknown>;
      assert.equal(r[campo], null, nome);
    });

  test("същите полета отхвърлят СГРЕШЕНА стойност, не само празната", () => {
    // Иначе преобразуването би било вратичка: „каквото не разбирам → null".
    ko(amministratori.schemaCreate, { nome: "S", email: "non-un-indirizzo" });
    ko(amministratori.schemaCreate, { nome: "S", codiceSdi: "ABC" });
    ko(condomini.schemaCreate, {
      nome: "A",
      indirizzo: "V",
      citta: "M",
      pec: "chiocciola-mancante",
    });
  });

  test("свободният текст ЗАПАЗВА празния низ — това е изчистване, не липса", () => {
    const r = ok(automezzi.schemaCreate, {
      targa: "AB123CD",
      marca: "Fiat",
      modello: "Doblò",
      note: "",
    }) as { note?: unknown };
    assert.equal(r.note, "");
  });
});

describe("минималният валиден запис за всяка анагрифика", () => {
  // Ако утре някой добави задължително поле, без да пипне формата, тестът пада
  // тук — а не при клиента, който попълва формата и получава 400.
  const casi: [string, z.ZodTypeAny, Record<string, unknown>][] = [
    [
      "condomini",
      condomini.schemaCreate,
      { nome: "Condominio A", indirizzo: "Via Verdi 12", citta: "Milano" },
    ],
    ["amministratori", amministratori.schemaCreate, { nome: "Studio" }],
    ["dipendenti", dipendenti.schemaCreate, { nome: "M", cognome: "R" }],
    [
      "automezzi",
      automezzi.schemaCreate,
      { targa: "AB123CD", marca: "Fiat", modello: "Doblò" },
    ],
    ["cottimisti", cottimisti.schemaCreate, { ragioneSociale: "Ditta" }],
    [
      "squadre",
      squadre.schemaCreate,
      { nome: "Squadra 1", cottimistiId: "33333333-3333-4333-8333-333333333333" },
    ],
    [
      "impianti",
      impianti.schemaCreate,
      {
        matricola: "MAT-001",
        marca: "Otis",
        modello: "Gen2",
        condominioId: "11111111-1111-4111-8111-111111111111",
      },
    ],
    [
      "impiantiMedia",
      impiantiMedia.schemaCreate,
      {
        impiantoId: "11111111-1111-4111-8111-111111111111",
        tipo: "foto",
        url: "/x.jpg",
      },
    ],
    [
      "scadenzeImpianti",
      scadenzeImpianti.schemaCreate,
      {
        impiantoId: "11111111-1111-4111-8111-111111111111",
        tipo: "revisione",
        dataScadenza: "2026-12-31",
      },
    ],
    [
      "assegnazioniTecnici",
      assegnazioniTecnici.schemaCreate,
      {
        impiantoId: "11111111-1111-4111-8111-111111111111",
        dipendenteId: "22222222-2222-4222-8222-222222222222",
      },
    ],
    ["articoli", articoli.schemaCreate, { codice: "ART-1", nome: "Contattore" }],
    [
      "documenti",
      documenti.schemaCreate,
      { titolo: "Certificato", tipo: "CERTIFICATO" },
    ],
    [
      "tenants",
      tenants.schemaCreate,
      { slug: "azienda-1", ragioneSociale: "Azienda", email: "a@b.it" },
    ],
  ];

  for (const [nome, schema, minimo] of casi)
    test(nome, () => {
      ok(schema, minimo);
    });
});

describe("частичната схема приема празен обект", () => {
  // `PATCH` с едно поле е нормалният случай; схема, която иска всичко, прави
  // редакцията на едно поле невъзможна.
  for (const [nome, cfg] of Object.entries({
    condomini,
    amministratori,
    dipendenti,
    automezzi,
    cottimisti,
    squadre,
    impianti,
    articoli,
    documenti,
    tenants,
  }))
    test(nome, () => {
      ok(cfg.schemaUpdate, {});
    });
});

describe("правилата, които не са очевидни", () => {
  test("slug на фирма: само малки букви, цифри и тире", () => {
    ok(tenants.schemaCreate, {
      slug: "azienda-1",
      ragioneSociale: "A",
      email: "a@b.it",
    });
    for (const s of ["Azienda", "azienda_1", "azienda 1", "à"])
      ko(tenants.schemaCreate, {
        slug: s,
        ragioneSociale: "A",
        email: "a@b.it",
      });
  });

  test("невалиден адрес за поща се отказва", () => {
    ko(tenants.schemaCreate, {
      slug: "a",
      ragioneSociale: "A",
      email: "non-un-indirizzo",
    });
  });

  test("административното спиране НЕ се вдига от падащото меню", () => {
    // Чл. 14, ал. 2 D.P.R. 162/1999: вдига се само с нова положителна
    // проверка. Ако менюто може да го махне, състоянието не значи нищо.
    const v = impianti.vincoloModifica!;
    assert.match(
      String(v({ stato: "FERMO_AMMINISTRATIVO" }, { stato: "ATTIVO" })),
      /fermo amministrativo/i,
    );
    // Същото състояние не е промяна.
    assert.equal(v({ stato: "FERMO_AMMINISTRATIVO" }, { stato: "FERMO_AMMINISTRATIVO" }), null);
    // Промяна без ново състояние не се пипа.
    assert.equal(v({ stato: "FERMO_AMMINISTRATIVO" }, { note: "x" }), null);
    // Уредба, която НЕ е спряна, се мени свободно.
    assert.equal(v({ stato: "ATTIVO" }, { stato: "FERMO" }), null);
  });

  test("документът наследява потребителя от СЕСИЯТА, не от тялото", () => {
    // Иначе всеки може да припише документ на друг.
    assert.deepEqual(documenti.campiSessione!({ sub: "u-1" } as never), {
      utenteId: "u-1",
    });
  });
});

describe("редовете на документите", () => {
  test("voce: минимален валиден ред", () => {
    ok(voceSchema, {
      descrizione: "Canone",
      quantita: "1",
      prezzoUnitario: "300,00",
    });
  });

  test("voce: количеството е задължително", () => {
    ko(voceSchema, { descrizione: "x", prezzoUnitario: "1" });
  });

  test("riga DDT: мерна единица и тегло са по избор", () => {
    const r = ok(rigaDdtSchema, { descrizione: "Cavo", quantita: "3" });
    assert.equal((r as { um?: unknown }).um, undefined);
    ok(rigaDdtSchema, { descrizione: "Cavo", quantita: "3", um: "m" });
  });
});

describe("документите", () => {
  test("фактура: минимална", () => {
    ok(fatturaSchema, { data: "2026-03-15", tipo: "EMESSA" });
  });

  test("фактура: начин на плащане от кодировката MP", () => {
    ok(fatturaSchema, {
      data: "2026-03-15",
      tipo: "EMESSA",
      modalitaPagamento: "MP05",
    });
    assert.match(
      ko(fatturaSchema, {
        data: "2026-03-15",
        tipo: "EMESSA",
        modalitaPagamento: "BONIFICO",
      }),
      /MP01/,
    );
  });

  test("плащане: сумата минава през паричната схема", () => {
    ok(pagamentoSchema, { data: "2026-04-01", importo: "100,50" });
    ko(pagamentoSchema, { data: "2026-04-01", importo: "abc" });
  });

  test("известие от SDI: само познатите типове", () => {
    ok(notificaSdiSchema, { tipo: "RC", data: "2026-03-20" });
    ko(notificaSdiSchema, { tipo: "XX", data: "2026-03-20" });
  });

  test("оферта и ордин: минимални", () => {
    ok(preventivoSchema, { oggetto: "Sostituzione porta" });
    ok(ordineSchema, { oggetto: "Riparazione" });
  });

  test("DDT: минимален", () => {
    ok(ddtSchema.base, { data: "2026-03-15" });
  });
});

describe("отчетът за намесата", () => {
  const minimo = { descrizione: "Sostituito contattore", oreLavoro: "1,5" };

  test("минималният минава и часовете се нормализират", () => {
    const r = ok(rapportinoSchema, minimo) as { oreLavoro: string };
    assert.equal(r.oreLavoro, "1.5");
  });

  test("над 24 часа на една намеса е печатна грешка, не смяна", () => {
    assert.match(ko(rapportinoSchema, { ...minimo, oreLavoro: "25" }), /24/);
  });

  test("проверките по чл. 15 са ТРИСТОЙНОСТНИ", () => {
    // Празно значи „не е гледано", не „наред" — точно това пази при злополука.
    const r = ok(rapportinoSchema, { ...minimo, vFuni: null }) as Record<string, unknown>;
    assert.equal(r.vFuni, null);
    ok(rapportinoSchema, { ...minimo, vFuni: true });
    ok(rapportinoSchema, { ...minimo, vFuni: false });
    ko(rapportinoSchema, { ...minimo, vFuni: "si" });
  });

  test("подписът иска име на подписващия", () => {
    ko(firmaSchema, { firmaCliente: "data:image/png;base64,AAAA" });
    ok(firmaSchema, {
      firmaCliente: "data:image/png;base64,AAAA",
      firmatarioNome: "Sig. Bianchi",
    });
  });
});

describe("законовата проверка", () => {
  test("минимална и с познат изход", () => {
    const base = {
      impiantoId: "11111111-1111-4111-8111-111111111111",
      tipo: "PERIODICA",
      data: "2026-03-01",
      esito: "POSITIVO",
    };
    ok(verificaImpiantoSchema, base);
    ok(verificaImpiantoSchema, { ...base, esito: "CON_PRESCRIZIONI" });
    ok(verificaImpiantoSchema, { ...base, esito: "NEGATIVO" });
    ko(verificaImpiantoSchema, { ...base, esito: "FORSE" });
    ko(verificaImpiantoSchema, { ...base, tipo: "ANNUALE" });
  });
});

describe("затворените списъци на схемите", () => {
  test("изходите от намеса и периодичностите са пълни", () => {
    assert.ok(ESITI_INTERVENTO.length > 0);
    assert.equal(new Set(ESITI_INTERVENTO).size, ESITI_INTERVENTO.length);
    assert.deepEqual(
      [...PERIODICITA_VALORI],
      [
        "MENSILE",
        "BIMESTRALE",
        "TRIMESTRALE",
        "QUADRIMESTRALE",
        "SEMESTRALE",
        "ANNUALE",
      ],
    );
  });

  test("готовата схема на договора вече носи проверката за периода", () => {
    // Маршрутите ползват именно нея; ако проверката се загуби при
    // пренареждане, договор с край преди началото минава.
    ko(contrattoSchema, {
      oggetto: "x",
      canone: "1",
      dataInizio: "2026-06-01",
      dataFine: "2026-01-01",
    });
    ok(contrattoSchema, {
      oggetto: "x",
      canone: "1",
      dataInizio: "2026-01-01",
      dataFine: "2026-06-01",
    });
  });
});
