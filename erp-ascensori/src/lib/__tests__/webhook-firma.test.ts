// Подписът на webhook-а и правилата за повторен опит.
//
// ЗАЩО Е ВАЖНО ДО ПОСЛЕДНАТА РАЗКЛОНКА. Получателят е ЧУЖДА система — обикновено
// счетоводният софтуер на клиента. Единственото, което го пази от подхвърлено
// „фактурата е платена", е този подпис. Ако тук има дупка, тя не се вижда от
// нашата страна изобщо.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  firmaCorpo,
  verificaFirma,
  eventiValidi,
  prossimoTentativo,
  consegnaRiuscita,
  vaRiprovato,
  EVENTI,
  MAX_TENTATIVI,
  MAX_FALLIMENTI_WEBHOOK,
  TOLLERANZA_SECONDI,
  HEADER_FIRMA,
  HEADER_TIMESTAMP,
  HEADER_EVENTO,
  HEADER_CONSEGNA,
} from "../webhook/firma";

const SEGRETO = "segreto-di-prova-molto-lungo-0123456789";
const CORPO = '{"evento":"fattura.pagata","id":"abc"}';
const TS = 1_800_000_000;

describe("имената на заглавията са ДОГОВОР с получателя", () => {
  test("не се преименуват мълчаливо", () => {
    // Кодът на получателя ги чете по име и е публикуван в документацията ни.
    // Преименуване тук чупи всяка вече работеща интеграция, без нищо от наша
    // страна да падне — затова стойностите са заковани в тест.
    assert.equal(HEADER_FIRMA, "x-erp-signature");
    assert.equal(HEADER_TIMESTAMP, "x-erp-timestamp");
    assert.equal(HEADER_EVENTO, "x-erp-event");
    assert.equal(HEADER_CONSEGNA, "x-erp-delivery");
  });

  test("са с малки букви — HTTP/2 не приема главни", () => {
    for (const h of [
      HEADER_FIRMA,
      HEADER_TIMESTAMP,
      HEADER_EVENTO,
      HEADER_CONSEGNA,
    ])
      assert.equal(h, h.toLowerCase(), h);
  });

  test("праговете имат разумни стойности", () => {
    assert.equal(TOLLERANZA_SECONDI, 300);
    assert.equal(MAX_TENTATIVI, 8);
    // Мъртъв получател не бива да се чука вечно — това е DoS срещу самите нас.
    assert.equal(MAX_FALLIMENTI_WEBHOOK, 20);
    assert.ok(MAX_FALLIMENTI_WEBHOOK > MAX_TENTATIVI);
  });
});

describe("подписът", () => {
  test("е стабилен за едни и същи входове", () => {
    assert.equal(
      firmaCorpo(CORPO, SEGRETO, TS),
      firmaCorpo(CORPO, SEGRETO, TS),
    );
    assert.match(firmaCorpo(CORPO, SEGRETO, TS), /^[0-9a-f]{64}$/);
  });

  test("ВРЕМЕВАТА ОТМЕТКА влиза в подписания низ", () => {
    // Това е цялата защита срещу преиграване: ако отметката беше само в
    // заглавие, нападателят би презаписал старо валидно известие с нова
    // отметка и получателят би го приел повторно — „фактурата е платена"
    // два пъти.
    assert.notEqual(
      firmaCorpo(CORPO, SEGRETO, TS),
      firmaCorpo(CORPO, SEGRETO, TS + 1),
    );
  });

  test("смяната на един знак в тялото сменя подписа", () => {
    assert.notEqual(
      firmaCorpo(CORPO, SEGRETO, TS),
      firmaCorpo(CORPO.replace("abc", "abd"), SEGRETO, TS),
    );
  });

  test("различна тайна дава различен подпис", () => {
    assert.notEqual(
      firmaCorpo(CORPO, SEGRETO, TS),
      firmaCorpo(CORPO, "altro", TS),
    );
  });

  test("отметка и тяло не могат да се разменят", () => {
    // Разделителят („.") пази от подвеждане: без него „12" + „34" и „1" + „234"
    // биха дали един и същ подписан низ.
    assert.notEqual(
      firmaCorpo("34", SEGRETO, 12),
      firmaCorpo("234", SEGRETO, 1),
    );
  });
});

describe("проверката, която прави получателят", () => {
  const firma = firmaCorpo(CORPO, SEGRETO, TS);

  test("правилният подпис минава", () => {
    assert.deepEqual(verificaFirma(CORPO, SEGRETO, firma, TS, TS), {
      valida: true,
    });
  });

  test("подправено тяло се отхвърля", () => {
    const r = verificaFirma(CORPO + " ", SEGRETO, firma, TS, TS);
    assert.equal(r.valida, false);
    assert.equal(r.valida === false && r.motivo, "firma");
  });

  test("чужда тайна се отхвърля", () => {
    assert.equal(verificaFirma(CORPO, "altro", firma, TS, TS).valida, false);
  });

  test("прозорецът за преиграване се спазва от ДВЕТЕ страни", () => {
    // Само „не по-старо от" не стига: часовник, избързал напред, също е начин
    // да се удължи животът на подпис.
    assert.equal(
      verificaFirma(CORPO, SEGRETO, firma, TS, TS + TOLLERANZA_SECONDI).valida,
      true,
    );
    assert.equal(
      verificaFirma(CORPO, SEGRETO, firma, TS, TS + TOLLERANZA_SECONDI + 1)
        .valida,
      false,
    );
    assert.equal(
      verificaFirma(CORPO, SEGRETO, firma, TS, TS - TOLLERANZA_SECONDI - 1)
        .valida,
      false,
    );
  });

  test("изтекла отметка се обявява като timestamp, не като firma", () => {
    // Разликата е диагностична: „часовникът ти е разместен" е друг проблем от
    // „тайната ти е грешна", а получателят трябва да знае кой от двата гони.
    const r = verificaFirma(CORPO, SEGRETO, firma, TS, TS + 10_000);
    assert.equal(r.valida === false && r.motivo, "timestamp");
  });

  test("подпис с ДРУГА дължина не гърми в сравнението", () => {
    // `timingSafeEqual` хвърля при различна дължина — затова дължината се
    // проверява преди него. Без това празен хедър би дал 500 вместо отказ.
    for (const f of ["", "abc", firma + "00"])
      assert.equal(verificaFirma(CORPO, SEGRETO, f, TS, TS).valida, false, f);
  });

  test("подразбиращият се час е сегашният", () => {
    const ora = Math.floor(Date.now() / 1000);
    const f = firmaCorpo(CORPO, SEGRETO, ora);
    assert.equal(verificaFirma(CORPO, SEGRETO, f, ora).valida, true);
  });
});

describe("списъкът със събития", () => {
  test("празният абонамент не е валиден", () => {
    // Празно значи „нищо" — абонамент, който не носи нищо, е грешка при
    // въвеждане, не избор.
    assert.equal(eventiValidi([]), false);
  });

  test("познатите минават", () => {
    assert.equal(eventiValidi([...EVENTI]), true);
    assert.equal(eventiValidi(["fattura.pagata"]), true);
  });

  test("един непознат проваля целия списък", () => {
    assert.equal(eventiValidi(["fattura.pagata", "fattura.inventata"]), false);
    assert.equal(eventiValidi(["*"]), false);
  });

  test("отхвърлената от SDI е сред събитията", () => {
    // Външното счетоводство трябва да го научи веднага, а не при месечната
    // сверка: срокът за преиздаване е 5 дни.
    assert.ok((EVENTI as readonly string[]).includes("fattura.scartata"));
  });
});

describe("кога се опитва пак", () => {
  test("успехът е 2xx и само той", () => {
    for (const s of [200, 201, 204, 299])
      assert.equal(consegnaRiuscita(s), true, String(s));
    for (const s of [199, 300, 301, 400, 500])
      assert.equal(consegnaRiuscita(s), false, String(s));
  });

  test("мрежовата грешка е преходна", () => {
    assert.equal(vaRiprovato(null, 0), true);
  });

  test("4xx НЕ се повтаря — получателят не иска това", () => {
    for (const s of [400, 401, 403, 404, 422])
      assert.equal(vaRiprovato(s, 0), false, String(s));
  });

  test("408 и 429 са изключенията", () => {
    // Те казват „сега не мога", не „не искам".
    assert.equal(vaRiprovato(408, 0), true);
    assert.equal(vaRiprovato(429, 0), true);
  });

  test("5xx се повтаря", () => {
    for (const s of [500, 502, 503, 504])
      assert.equal(vaRiprovato(s, 0), true, String(s));
  });

  test("успехът не се повтаря", () => {
    assert.equal(vaRiprovato(200, 0), false);
  });

  test("таванът на опитите спира всичко, включително мрежовата грешка", () => {
    assert.equal(vaRiprovato(null, MAX_TENTATIVI), false);
    assert.equal(vaRiprovato(500, MAX_TENTATIVI), false);
    assert.equal(vaRiprovato(500, MAX_TENTATIVI - 1), true);
  });
});

describe("забавянето между опитите", () => {
  test("расте експоненциално", () => {
    const t0 = prossimoTentativo(0, 0, 0).getTime();
    const t1 = prossimoTentativo(1, 0, 0).getTime();
    const t2 = prossimoTentativo(2, 0, 0).getTime();
    assert.equal(t0, 1_000);
    assert.equal(t1, 2_000);
    assert.equal(t2, 4_000);
  });

  test("има ТАВАН — иначе осмият опит е след дни", () => {
    assert.equal(prossimoTentativo(30, 0, 0).getTime(), 3_600_000);
    assert.equal(prossimoTentativo(12, 0, 0).getTime(), 3_600_000);
  });

  test("разсейването е до 20 % НАГОРЕ, никога надолу", () => {
    // Хиляда доставки, паднали заедно (получателят е бил долу), без разсейване
    // тръгват в една и съща секунда и го събарят повторно.
    const senza = prossimoTentativo(3, 0, 0).getTime();
    const con = prossimoTentativo(3, 0, 1).getTime();
    assert.equal(senza, 8_000);
    assert.equal(con, 8_000 + 1_600);
    // Никога по-рано от базата: по-ранен опит е по-агресивен, не по-мек.
    for (const c of [0, 0.25, 0.5, 0.99, 1])
      assert.ok(prossimoTentativo(3, 0, c).getTime() >= senza);
  });

  test("отчита се от подадения час, не от системния", () => {
    assert.equal(prossimoTentativo(0, 1_000_000, 0).getTime(), 1_001_000);
  });

  test("подразбиранията работят и без подадени стойности", () => {
    const t = prossimoTentativo(0);
    assert.ok(t.getTime() >= Date.now());
    assert.ok(t.getTime() <= Date.now() + 1_300);
  });
});
