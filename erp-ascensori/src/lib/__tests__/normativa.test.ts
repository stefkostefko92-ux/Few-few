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
} from "../normativa/verifiche";

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
