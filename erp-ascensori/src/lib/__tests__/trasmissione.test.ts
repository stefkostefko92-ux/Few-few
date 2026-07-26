import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  configTrasmissione,
  controllaInvio,
  indirizzoInterno,
  PEC_SDI_PRIMO_INVIO,
  ErroreTrasmissione,
  type ConfigTrasmissione,
} from "../sdi/trasmissione";

const INVIO = {
  nomeFile: "IT12345678901_00001.xml",
  xml: '<?xml version="1.0"?><p:FatturaElettronica versione="FPR12"></p:FatturaElettronica>',
  numeroFattura: "2026/0001",
};

describe("конфигурацията", () => {
  test("подразбирането е ИЗКЛЮЧЕНО", () => {
    // Продукт, който сам започва да подава фактури, защото някой е попълнил
    // променлива, е продукт, който издава документи без да е питан.
    assert.equal(configTrasmissione({}).canale, "manuale");
  });

  test("непознат канал НЕ се приема — пада на ръчното", () => {
    // Печатна грешка в конфигурацията не бива да произвежда неопределено
    // поведение върху фискален документ.
    assert.equal(configTrasmissione({ SDI_CANALE: "carta-piccione" }).canale, "manuale");
  });

  test("PEC без изричен адрес пада на публично известния за ПЪРВО подаване", () => {
    const c = configTrasmissione({ SDI_CANALE: "pec" });
    assert.equal(c.canale, "pec");
    assert.equal(c.destinatarioPec, PEC_SDI_PRIMO_INVIO);
  });

  test("след първото подаване адресът се сменя — затова е конфигурируем", () => {
    assert.equal(
      configTrasmissione({
        SDI_CANALE: "pec",
        SDI_PEC_DESTINATARIO: "sdi02@pec.fatturapa.it",
      }).destinatarioPec,
      "sdi02@pec.fatturapa.it",
    );
  });

  test("конфигурацията НЕ издава тайни", () => {
    const c = configTrasmissione({
      SDI_CANALE: "intermediario",
      SDI_INTERMEDIARIO_URL: "https://fatture.commercialista.it/api",
      SDI_INTERMEDIARIO_TOKEN: "segretissimo",
    });
    assert.equal(/segretissimo/.test(JSON.stringify(c)), false);
  });
});

describe("проверките на входа", () => {
  const manuale: ConfigTrasmissione = { canale: "manuale", etichetta: "—" };

  test("правилното подаване минава", () => {
    assert.deepEqual(controllaInvio(INVIO, manuale), []);
  });

  test("името на файла е КЛЮЧ за идемпотентност, не украса", () => {
    // SDI отхвърля повторно име като дубликат независимо от съдържанието.
    const p = controllaInvio({ ...INVIO, nomeFile: "fattura.xml" }, manuale);
    assert.ok(p.some((x) => /Nome file/i.test(x)), p.join(" | "));
  });

  test("съдържание, което не е фактура, се отказва", () => {
    const p = controllaInvio({ ...INVIO, xml: "<html>ciao</html>" }, manuale);
    assert.ok(p.some((x) => /fattura elettronica/i.test(x)), p.join(" | "));
  });

  test("проверките се правят и когато каналът е ИЗКЛЮЧЕН", () => {
    // Иначе включването утре би отворило дупки, които днес никой не е тествал.
    assert.ok(controllaInvio({ ...INVIO, xml: "" }, manuale).length > 0);
  });
});

describe("PEC", () => {
  test("невалиден адрес се отказва", () => {
    const p = controllaInvio(INVIO, {
      canale: "pec",
      destinatarioPec: "не-е-адрес",
      etichetta: "PEC",
    });
    assert.ok(p.some((x) => /PEC/i.test(x)), p.join(" | "));
  });
});

describe("посредник — това е SSRF повърхност", () => {
  const con = (url: string | null): ConfigTrasmissione => ({
    canale: "intermediario",
    urlIntermediario: url,
    etichetta: "Intermediario",
  });

  test("липсващ адрес се отказва", () => {
    assert.ok(controllaInvio(INVIO, con(null)).length > 0);
  });

  test("HTTP се отказва: фискален документ не пътува в чист вид", () => {
    const p = controllaInvio(INVIO, con("http://fatture.example.it/api"));
    assert.ok(p.some((x) => /HTTPS/i.test(x)), p.join(" | "));
  });

  test("метаданните на облака се отказват", () => {
    // Класическият SSRF: сървърът праща фактурата — и всичко, до което стигне —
    // на 169.254.169.254.
    const p = controllaInvio(INVIO, con("https://169.254.169.254/latest/meta-data/"));
    assert.ok(p.some((x) => /interno/i.test(x)), p.join(" | "));
  });

  test("валиден външен адрес минава", () => {
    assert.deepEqual(
      controllaInvio(INVIO, con("https://fatture.commercialista.it/api/v1")),
      [],
    );
  });
});

describe("кои адреси са вътрешни", () => {
  test("частните диапазони и loopback", () => {
    for (const h of [
      "localhost",
      "127.0.0.1",
      "10.0.0.5",
      "172.16.3.9",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "servizio.internal",
    ])
      assert.equal(indirizzoInterno(h), true, h);
  });

  test("публичните НЕ се бъркат с частните", () => {
    // 172.32 е ПУБЛИЧЕН: диапазонът свършва на 172.31. Груба проверка „започва
    // със 172" би отрязала законни адреси.
    for (const h of [
      "fatture.example.it",
      "8.8.8.8",
      "172.32.0.1",
      "172.15.0.1",
      "193.168.1.1",
      "11.0.0.1",
    ])
      assert.equal(indirizzoInterno(h), false, h);
  });
});

describe("грешката на канала", () => {
  test("носи HTTP състояние и се разпознава по тип", () => {
    // Маршрутът я превежда 1:1 в отговор към оператора; без състоянието всяка
    // грешка на канала би станала 500.
    const e = new ErroreTrasmissione(504, "Il canale non risponde");
    assert.ok(e instanceof Error);
    assert.equal(e.name, "ErroreTrasmissione");
    assert.equal(e.stato, 504);
    assert.equal(e.message, "Il canale non risponde");
  });
});

describe("напълно неразбираем адрес", () => {
  test("не гърми, а се отказва с обяснение", () => {
    // `new URL` хвърля; без прихващането конфигурационна печатна грешка би
    // дала 500 при опит за подаване на фактура.
    const p = controllaInvio(INVIO, {
      canale: "intermediario",
      urlIntermediario: "questo-non-e-un-url",
      etichetta: "Intermediario",
    });
    assert.ok(p.some((x) => /non valido/i.test(x)), p.join(" | "));
    // И НЕ се добавят подвеждащи оплаквания за HTTPS върху нещо, което дори не
    // е адрес.
    assert.equal(p.some((x) => /HTTPS/.test(x)), false);
  });
});
