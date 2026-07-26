// Нормативният режим на асансьора — правилата, които решават дали уредбата
// изобщо може да работи. Затова носят тестове, а не коментари.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  aggiungiMesi,
  prossimaVerifica,
  statoDopoVerifica,
  riavviabileDaOperatore,
  valutaControlli,
  problemiRapportino,
  richiedeFermo,
  problemiConformita,
  CONTROLLI_ART15,
  MESI_VERIFICA_PERIODICA,
  MESI_VERIFICA_SEMESTRALE,
  GIORNI_COMUNICAZIONE_COMUNE,
} from "../normativa/verifiche";
import {
  TIPI_INTERVENTO,
  TIPO_INTERVENTO_LABEL,
  contaPerTempiDiRisposta,
  richiedeControlliCompleti,
} from "../normativa/interventi";
import {
  TIPI_IMPIANTO,
  TIPO_IMPIANTO_LABEL,
  REGIMI_IMPIANTO,
  REGIME_IMPIANTO_LABEL,
  STATO_IMPIANTO_LABEL,
} from "../normativa/impianti";

describe("срокове", () => {
  test("двугодишният срок тече от датата на проверката", () => {
    const p = prossimaVerifica(new Date("2026-03-15T00:00:00Z"), "POSITIVO");
    assert.equal(p?.toISOString().slice(0, 10), "2028-03-15");
  });

  test("проверка с предписания пак е валидна — срокът тече", () => {
    assert.ok(
      prossimaVerifica(new Date("2026-03-15T00:00:00Z"), "CON_PRESCRIZIONI"),
    );
  });

  test("ОТРИЦАТЕЛНАТА не дава следваща дата", () => {
    // Иначе следващото напомняне идва, когато уредбата вече две години е
    // незаконно спряна.
    assert.equal(
      prossimaVerifica(new Date("2026-03-15T00:00:00Z"), "NEGATIVO"),
      null,
    );
  });

  test("извънредната проверка не смъква часовника на периодичната", () => {
    assert.equal(
      prossimaVerifica(
        new Date("2026-03-15T00:00:00Z"),
        "POSITIVO",
        "STRAORDINARIA",
      ),
      null,
    );
  });

  test("краят на месеца не прескача", () => {
    // 31 август + 6 месеца е 28/29 февруари, не 3 март.
    assert.equal(
      aggiungiMesi(new Date("2026-08-31T00:00:00Z"), 6)
        .toISOString()
        .slice(0, 10),
      "2027-02-28",
    );
    assert.equal(
      aggiungiMesi(new Date("2024-01-31T00:00:00Z"), 1)
        .toISOString()
        .slice(0, 10),
      "2024-02-29",
    );
  });
});

describe("административно спиране", () => {
  test("отрицателната проверка спира уредбата ПО ЗАКОН", () => {
    assert.equal(statoDopoVerifica("NEGATIVO"), "FERMO_AMMINISTRATIVO");
  });

  test("положителната НЕ пуска сама уредба, спряна по друга причина", () => {
    assert.equal(statoDopoVerifica("POSITIVO", "FERMO"), null);
    assert.equal(statoDopoVerifica("CON_PRESCRIZIONI", "MANUTENZIONE"), null);
    assert.equal(statoDopoVerifica("POSITIVO"), null);
  });

  test("положителната ВДИГА административното спиране — иначе то е вечно", () => {
    // Спирането се налага само от отрицателна проверка, а вдигането му е
    // отказано на обикновената промяна: без този случай уредбата няма изход.
    assert.equal(
      statoDopoVerifica("POSITIVO", "FERMO_AMMINISTRATIVO"),
      "ATTIVO",
    );
    assert.equal(
      statoDopoVerifica("CON_PRESCRIZIONI", "FERMO_AMMINISTRATIVO"),
      "ATTIVO",
    );
    // Отрицателната си остава отрицателна.
    assert.equal(
      statoDopoVerifica("NEGATIVO", "FERMO_AMMINISTRATIVO"),
      "FERMO_AMMINISTRATIVO",
    );
  });

  test("операторът не може да вдигне административното спиране", () => {
    assert.equal(riavviabileDaOperatore("FERMO_AMMINISTRATIVO"), false);
    // Обикновената повреда си е наша работа.
    assert.equal(riavviabileDaOperatore("FERMO"), true);
    assert.equal(riavviabileDaOperatore("MANUTENZIONE"), true);
  });
});

describe("проверките по чл. 15, ал. 4", () => {
  const tutte = Object.fromEntries(CONTROLLI_ART15.map((c) => [c.campo, true]));

  test("„не е гледано“ и „не е наред“ са РАЗЛИЧНИ", () => {
    const v = valutaControlli({ vFuni: true, vParacadute: false });
    assert.deepEqual(v.difformi.length, 1);
    // Останалите шест не са провалени — просто не са пипани.
    assert.equal(v.nonVerificati.length, CONTROLLI_ART15.length - 2);
    assert.equal(v.completo, false);
  });

  test("пълният списък прави проверката пълна", () => {
    const v = valutaControlli(tutte);
    assert.equal(v.completo, true);
    assert.equal(v.conformi.length, CONTROLLI_ART15.length);
    assert.deepEqual(v.difformi, []);
  });

  test("непълна шестмесечна проверка се отбелязва", () => {
    const p = problemiRapportino({
      tipoIntervento: "VERIFICA_SEMESTRALE",
      esito: "RISOLTO",
      controlli: { vFuni: true },
    });
    assert.ok(p.some((x) => /art\. 15 c\.4/.test(x)));
  });

  test("обикновеният ремонт не иска пълния списък", () => {
    assert.deepEqual(
      problemiRapportino({
        tipoIntervento: "RIPARAZIONE",
        esito: "RISOLTO",
        controlli: { vFuni: true },
      }),
      [],
    );
  });

  test("„решено“ при открита критична неизправност е противоречие", () => {
    const p = problemiRapportino({
      tipoIntervento: "MANUTENZIONE_ORDINARIA",
      esito: "RISOLTO",
      controlli: { ...tutte, vParacadute: false },
    });
    assert.ok(p.some((x) => /controlli critici/.test(x)));
  });

  test("критичната неизправност налага спиране; некритичната — не", () => {
    assert.equal(richiedeFermo({ vLimitatoreVelocita: false }), true);
    // Връзката от кабината е критична: без нея блокиран човек не вика помощ.
    assert.equal(richiedeFermo({ vCitofonoAllarme: false }), true);
    assert.equal(richiedeFermo({ vIlluminazioneEmergenza: false }), false);
    assert.equal(richiedeFermo(tutte), false);
  });
});

describe("правна изрядност на уредбата", () => {
  const completo = {
    matricolaComune: "MI-12345",
    comune: "Milano",
    dataComunicazione: new Date("2020-06-01"),
    regime: "DIRETTIVA_2014_33",
    organismoNotificato: "Organismo XY",
  };

  test("пълните данни нямат забележки", () => {
    assert.deepEqual(problemiConformita(completo), []);
  });

  test("липсващият номер от Общината се вижда", () => {
    const p = problemiConformita({ ...completo, matricolaComune: null });
    assert.ok(p.some((x) => /matricola assegnato dal Comune/.test(x)));
  });

  test("от заварените уредби не се иска съобщение по чл. 12", () => {
    const p = problemiConformita({
      regime: "PREESISTENTE",
      organismoNotificato: "ASL",
    });
    assert.deepEqual(p, []);
  });

  test("липсващият проверяващ орган се вижда при всеки режим", () => {
    assert.ok(
      problemiConformita({ regime: "PREESISTENTE" }).some((x) =>
        /verifiche periodiche/.test(x),
      ),
    );
  });
});

// ── Видовете намеса и етикетите на уредбата ─────────────────────────────────

describe("кои намеси влизат във времената за отзив", () => {
  test("само спешните и спасителните", () => {
    // Освобождаването на блокирани хора се мери в минути; смесено със средното
    // по всички визити, показателят става безсмислен.
    assert.equal(contaPerTempiDiRisposta("SOCCORSO"), true);
    assert.equal(contaPerTempiDiRisposta("EMERGENZA"), true);
    for (const t of [
      "MANUTENZIONE_ORDINARIA",
      "VERIFICA_SEMESTRALE",
      "RIPARAZIONE",
      "SOSTITUZIONE_COMPONENTI",
      "",
      "СОCCORSO",
    ])
      assert.equal(contaPerTempiDiRisposta(t), false, t);
  });

  test("пълният списък проверки иска САМО шестмесечната", () => {
    // Чл. 15, ал. 4 D.P.R. 162/1999 говори за периодичната проверка от
    // поддържащия; ремонтът не я замества.
    assert.equal(richiedeControlliCompleti("VERIFICA_SEMESTRALE"), true);
    for (const t of ["MANUTENZIONE_ORDINARIA", "RIPARAZIONE", "EMERGENZA", ""])
      assert.equal(richiedeControlliCompleti(t), false, t);
  });

  test("всеки вид намеса има италиански етикет", () => {
    for (const t of TIPI_INTERVENTO)
      assert.ok((TIPO_INTERVENTO_LABEL[t] ?? "").length > 0, t);
  });
});

describe("етикетите на уредбата", () => {
  test("всеки вид и режим има етикет", () => {
    for (const t of TIPI_IMPIANTO)
      assert.ok((TIPO_IMPIANTO_LABEL[t] ?? "").length > 0, t);
    for (const r of REGIMI_IMPIANTO)
      assert.ok((REGIME_IMPIANTO_LABEL[r] ?? "").length > 0, r);
  });

  test("административното спиране НЕ се чете като обикновено спиране", () => {
    // За оператора разликата е между „ще го оправим" и „не можем да го пуснем".
    assert.match(STATO_IMPIANTO_LABEL.FERMO, /guasto/i);
    assert.match(STATO_IMPIANTO_LABEL.FERMO_AMMINISTRATIVO, /amministrativo/i);
    assert.notEqual(
      STATO_IMPIANTO_LABEL.FERMO,
      STATO_IMPIANTO_LABEL.FERMO_AMMINISTRATIVO,
    );
    for (const s of [
      "ATTIVO",
      "FERMO",
      "MANUTENZIONE",
      "FUORI_SERVIZIO",
      "FERMO_AMMINISTRATIVO",
      "DISMESSO",
    ])
      assert.ok((STATO_IMPIANTO_LABEL[s] ?? "").length > 0, s);
  });
});

test("нормативните срокове са тези от закона, не кръгли числа", () => {
  // 24 месеца за периодичната проверка (чл. 13 D.P.R. 162/1999), 6 месеца за
  // проверката от поддържащия (чл. 15, ал. 4) и 10 дни за съобщението до
  // Общината от декларацията за съответствие (чл. 12). Числата решават кога
  // уредбата става незаконна — затова се заковават тук, а не се помнят.
  assert.equal(MESI_VERIFICA_PERIODICA, 24);
  assert.equal(MESI_VERIFICA_SEMESTRALE, 6);
  assert.equal(GIORNI_COMUNICAZIONE_COMUNE, 10);
});

test("липсващата дата на съобщението до Общината се обявява", () => {
  // Чл. 12 D.P.R. 162/1999: без съобщението уредбата няма матрикола и работи
  // незаконно. Липсва ли датата, ние не можем да докажем, че сме съобщили.
  const p = problemiConformita({
    matricolaComune: "MI-12345",
    comune: "Milano",
    dataComunicazione: null,
    organismoNotificato: "0051",
    dataInstallazione: new Date("2020-01-01T00:00:00Z"),
    regime: "DIRETTIVA_2014_33",
  });
  assert.ok(
    p.some((x) => /comunicazione al Comune/i.test(x)),
    p.join(" | "),
  );
  // А когато е налице — това оплакване го няма.
  const q = problemiConformita({
    matricolaComune: "MI-12345",
    comune: "Milano",
    dataComunicazione: new Date("2020-01-05T00:00:00Z"),
    organismoNotificato: "0051",
    dataInstallazione: new Date("2020-01-01T00:00:00Z"),
    regime: "DIRETTIVA_2014_33",
  });
  assert.equal(q.some((x) => /comunicazione al Comune/i.test(x)), false);
});
