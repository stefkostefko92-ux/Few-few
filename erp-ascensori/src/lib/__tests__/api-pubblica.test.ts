import test from "node:test";
import assert from "node:assert/strict";
import {
  generaChiave,
  hashChiave,
  chiaveDaHeader,
  autorizza,
  ambitiValidi,
  confrontaHash,
  PREFISSO,
} from "../api-pubblica/chiavi";
import {
  firmaCorpo,
  verificaFirma,
  prossimoTentativo,
  vaRiprovato,
  consegnaRiuscita,
  eventiValidi,
  TOLLERANZA_SECONDI,
  MAX_TENTATIVI,
} from "../webhook/firma";

test("ключът е уникален и се пази само като отпечатък", () => {
  const a = generaChiave();
  const b = generaChiave();
  assert.notEqual(a.chiave, b.chiave);
  assert.ok(a.chiave.startsWith(PREFISSO));
  assert.equal(a.chiaveHash, hashChiave(a.chiave));
  // Отпечатъкът НЕ съдържа ключа — иначе базата пак го издава.
  assert.equal(a.chiaveHash.includes(a.chiave.slice(PREFISSO.length)), false);
  assert.equal(a.chiaveHash.length, 64);
});

test("видимият префикс разпознава ключа, без да го издава", () => {
  const k = generaChiave();
  assert.ok(k.chiave.startsWith(k.prefisso));
  // Осем знака от 43 не стигат за възстановяване.
  assert.ok(k.prefisso.length < k.chiave.length - 20);
});

test("сравнението на отпечатъци е в постоянно време и е точно", () => {
  const h = hashChiave("ea_live_x");
  assert.equal(confrontaHash(h, h), true);
  assert.equal(confrontaHash(h, hashChiave("ea_live_y")), false);
  assert.equal(confrontaHash(h, "corto"), false);
});

test("заглавието Authorization се чете строго", () => {
  const k = generaChiave().chiave;
  assert.equal(chiaveDaHeader(`Bearer ${k}`), k);
  assert.equal(chiaveDaHeader(`bearer ${k}`), k);
  assert.equal(chiaveDaHeader(null), null);
  assert.equal(chiaveDaHeader(k), null, "без схема не се приема");
  assert.equal(chiaveDaHeader("Basic abc"), null);
  // Чужд формат не бива да стига до заявка към базата.
  assert.equal(chiaveDaHeader("Bearer sk_live_qualcosa"), null);
});

test("празни права значат НИЩО, не всичко", () => {
  const esito = autorizza({ ambiti: [] }, "impianti:read");
  assert.equal(esito.valida, false);
  assert.equal(esito.valida === false && esito.motivo, "ambito");
  assert.equal(ambitiValidi([]), false);
  assert.equal(ambitiValidi(["impianti:read"]), true);
  // Печатна грешка се отказва, вместо да стане тих отказ по-късно.
  assert.equal(ambitiValidi(["impianti:reed"]), false);
});

test("отменен и изтекъл ключ не работят", () => {
  const ora = new Date("2026-07-25T12:00:00Z");
  assert.equal(
    autorizza(
      { ambiti: ["impianti:read"], revocataAt: ora },
      "impianti:read",
      ora,
    ).valida,
    false,
  );
  const scaduto = autorizza(
    { ambiti: ["impianti:read"], scadenza: new Date("2026-07-24T12:00:00Z") },
    "impianti:read",
    ora,
  );
  assert.equal(scaduto.valida, false);
  assert.equal(scaduto.valida === false && scaduto.motivo, "scaduta");
  // Валиден, неизтекъл, с правото → минава.
  assert.equal(
    autorizza(
      { ambiti: ["impianti:read"], scadenza: new Date("2026-08-01T00:00:00Z") },
      "impianti:read",
      ora,
    ).valida,
    true,
  );
});

test("подписът покрива И времевата отметка", () => {
  const corpo = JSON.stringify({ evento: "fattura.pagata" });
  const a = firmaCorpo(corpo, "segreto", 1000);
  const b = firmaCorpo(corpo, "segreto", 1001);
  // Иначе нападателят преиграва старо валидно известие с нова отметка.
  assert.notEqual(a, b);
  assert.notEqual(a, firmaCorpo(corpo, "altro", 1000));
});

test("получателят проверява подписа и прозореца", () => {
  const corpo = '{"a":1}';
  const ts = 1_700_000_000;
  const firma = firmaCorpo(corpo, "segreto", ts);

  assert.equal(verificaFirma(corpo, "segreto", firma, ts, ts).valida, true);
  // Подправено тяло със същия подпис.
  const alterato = verificaFirma('{"a":2}', "segreto", firma, ts, ts);
  assert.equal(alterato.valida, false);
  assert.equal(alterato.valida === false && alterato.motivo, "firma");
  // Извън прозореца — преиграване.
  const vecchio = verificaFirma(
    corpo,
    "segreto",
    firma,
    ts,
    ts + TOLLERANZA_SECONDI + 1,
  );
  assert.equal(vecchio.valida, false);
  assert.equal(vecchio.valida === false && vecchio.motivo, "timestamp");
  // И в двете посоки: часовник напред също е подозрителен.
  assert.equal(
    verificaFirma(corpo, "segreto", firma, ts, ts - 400).valida,
    false,
  );
});

test("изчакването расте, но има таван и разсейване", () => {
  const ora = 1_000_000;
  const t1 = prossimoTentativo(1, ora, 0).getTime() - ora;
  const t5 = prossimoTentativo(5, ora, 0).getTime() - ora;
  assert.ok(t5 > t1);
  // Таван: без него осмият опит е след дни.
  const t20 = prossimoTentativo(20, ora, 0).getTime() - ora;
  assert.equal(t20, 3_600_000);
  // Разсейване: хиляда доставки, паднали заедно, не бива да тръгнат в една
  // и съща секунда и да съборят получателя повторно.
  assert.notEqual(
    prossimoTentativo(3, ora, 0).getTime(),
    prossimoTentativo(3, ora, 1).getTime(),
  );
});

test("повтаря се само това, което има смисъл", () => {
  assert.equal(vaRiprovato(null, 0), true, "мрежова грешка е преходна");
  assert.equal(vaRiprovato(500, 0), true);
  assert.equal(vaRiprovato(503, 3), true);
  assert.equal(
    vaRiprovato(429, 3),
    true,
    "ограничение — изчакай и пробвай пак",
  );
  assert.equal(vaRiprovato(408, 3), true);
  // „Не искам това" не се повтаря: шум за двете страни.
  assert.equal(vaRiprovato(400, 0), false);
  assert.equal(vaRiprovato(404, 0), false);
  assert.equal(vaRiprovato(200, 0), false);
  // Таванът е таван.
  assert.equal(vaRiprovato(500, MAX_TENTATIVI), false);
});

test("успехът е 2xx, не „не е грешка“", () => {
  assert.equal(consegnaRiuscita(200), true);
  assert.equal(consegnaRiuscita(204), true);
  // Пренасочването не е доставка: получателят не е потвърдил нищо.
  assert.equal(consegnaRiuscita(302), false);
  assert.equal(consegnaRiuscita(500), false);
});

test("само познати събития се записват", () => {
  assert.equal(eventiValidi(["fattura.pagata"]), true);
  assert.equal(eventiValidi([]), false);
  assert.equal(eventiValidi(["fattura.pagate"]), false);
});
