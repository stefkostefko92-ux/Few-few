// AI слоят — конфигурация, пресяване на отговора и указанието.
//
// Мрежа тук няма. Тества се точно това, което решава дали функцията е безопасна:
// изключена ли е без ключ, какво се приема от отговора и какво казва указанието
// на модела.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { risolviConfigAi, aiAttiva, PROVIDER_AI } from "../ai/config";
import { estraiJson } from "../ai/fornitore";
import { validaEstrazione, campiPerForm, perForm } from "../ai/valida";
import { MODULI_AI, moduloValido, istruzione } from "../ai/moduli";
import { condominioSchemaAi, impiantoSchemaAi } from "../entities";

describe("конфигурация", () => {
  test("по подразбиране функцията е ИЗКЛЮЧЕНА", () => {
    const c = risolviConfigAi({});
    assert.equal(c.configurato, "off");
    assert.equal(c.effettivo, "off");
  });

  test("поискан доставчик БЕЗ ключ не се включва", () => {
    // Иначе бутонът се показва и всяко натискане дава 401 от доставчика.
    const c = risolviConfigAi({ AI_PROVIDER: "gemini" });
    assert.equal(c.configurato, "gemini");
    assert.equal(c.effettivo, "off");
  });

  test("с ключ работи и моделът по подразбиране е мултимодален", () => {
    const c = risolviConfigAi({ AI_PROVIDER: "gemini", AI_API_KEY: "x" });
    assert.equal(c.effettivo, "gemini");
    // Текстов модел би приел заявката и би върнал празнота — най-подвеждащата
    // повреда, защото прилича на „документът не съдържа данни“.
    assert.match(c.modello, /flash|pro/);
    assert.match(c.baseUrl, /^https:\/\//);
  });

  test("непознат доставчик не се включва по погрешка", () => {
    assert.equal(
      risolviConfigAi({ AI_PROVIDER: "pippo", AI_API_KEY: "x" }).effettivo,
      "off",
    );
  });

  test("адресът и етикетът се сменят — заради регионалните endpoint-и", () => {
    const c = risolviConfigAi({
      AI_PROVIDER: "openai",
      AI_API_KEY: "x",
      AI_BASE_URL: "https://eu.example.test/v1/",
      AI_FORNITORE_ETICHETTA: "Fornitore UE",
    });
    assert.equal(c.baseUrl, "https://eu.example.test/v1");
    assert.equal(c.etichettaFornitore, "Fornitore UE");
  });

  test("ключът никога не е част от това, което се показва", () => {
    const c = risolviConfigAi({ AI_PROVIDER: "gemini", AI_API_KEY: "segreto" });
    // Етикетът отива към браузъра; ключът остава на сървъра.
    assert.equal(c.etichettaFornitore.includes("segreto"), false);
  });
});

describe("разбор на отговора", () => {
  test("чист JSON минава", () => {
    assert.deepEqual(estraiJson('{"nome":"Condominio Verdi"}'), {
      nome: "Condominio Verdi",
    });
  });

  test("обвитият в блок код също — моделите го правят въпреки указанието", () => {
    assert.deepEqual(estraiJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(estraiJson('```\n{"a":1}\n```'), { a: 1 });
  });

  test("JSON след въведение се изкопава", () => {
    assert.deepEqual(estraiJson('Ecco i dati:\n{"a":1}\nSpero sia utile.'), {
      a: 1,
    });
  });

  test("нечетимото връща null, не хвърля", () => {
    assert.equal(estraiJson("non ho trovato nulla"), null);
    assert.equal(estraiJson(""), null);
  });
});

describe("пресяване през схемата на формата", () => {
  test("валидните полета минават, невалидните падат ПООТДЕЛНО", () => {
    const r = validaEstrazione(condominioSchemaAi, {
      nome: "Condominio Verdi",
      citta: "Milano",
      cap: "20144",
      unitaImmobiliari: "molte", // не е число
    });
    assert.equal(r.campi.nome, "Condominio Verdi");
    assert.equal(r.campi.citta, "Milano");
    // Едно сгрешено поле НЕ губи другите три.
    assert.equal(r.scartati.length, 1);
    assert.equal(r.scartati[0].campo, "unitaImmobiliari");
  });

  test("измислено поле се отбелязва, не се пропуска тихо", () => {
    const r = validaEstrazione(condominioSchemaAi, {
      nome: "X",
      numeroScale: 3,
    });
    assert.equal(r.campi.numeroScale, undefined);
    assert.ok(r.scartati.some((s) => s.campo === "numeroScale"));
  });

  test("празното от модела значи „не намерих“, не „изтрий“", () => {
    const r = validaEstrazione(condominioSchemaAi, {
      nome: "X",
      citta: "",
      cap: null,
    });
    assert.deepEqual(Object.keys(r.campi), ["nome"]);
    assert.deepEqual(r.scartati, []);
  });

  test("отговор, който не е обект, се отказва изцяло", () => {
    assert.equal(
      validaEstrazione(condominioSchemaAi, ["a"]).scartati.length,
      1,
    );
    assert.equal(validaEstrazione(condominioSchemaAi, null).scartati.length, 1);
    assert.equal(
      validaEstrazione(condominioSchemaAi, "testo").scartati.length,
      1,
    );
  });

  test("изборните полета приемат САМО стойностите от списъка", () => {
    const buono = validaEstrazione(impiantoSchemaAi, {
      regime: "PREESISTENTE",
    });
    assert.equal(buono.campi.regime, "PREESISTENTE");
    const cattivo = validaEstrazione(impiantoSchemaAi, { regime: "VECCHIO" });
    assert.equal(cattivo.campi.regime, undefined);
    assert.equal(cattivo.scartati.length, 1);
  });

  test("датата излиза във формата, която полето очаква", () => {
    const r = validaEstrazione(impiantoSchemaAi, {
      dataInstallazione: "2018-05-14",
    });
    assert.equal(campiPerForm(r.campi).dataInstallazione, "2018-05-14");
  });

  test("невалидна дата не се промъква", () => {
    const r = validaEstrazione(impiantoSchemaAi, {
      dataInstallazione: "32/13/2026",
    });
    assert.equal(r.campi.dataInstallazione, undefined);
    assert.equal(r.scartati.length, 1);
  });
});

describe("указанието към модела", () => {
  test("всеки модул има схема и поне едно поле", () => {
    for (const [nome, m] of Object.entries(MODULI_AI)) {
      assert.ok(m.campi.length > 0, `${nome} е без полета`);
      assert.ok(m.schema, `${nome} е без схема`);
      assert.ok(
        m.documentoAtteso.length > 0,
        `${nome} не казва какъв документ чака`,
      );
    }
  });

  test("всяко поле от регистъра СЪЩЕСТВУВА в схемата", () => {
    // Иначе искаме от модела нещо, което после сами изхвърляме като „непознато“.
    for (const [nome, m] of Object.entries(MODULI_AI)) {
      const shape = (m.schema as unknown as { shape: Record<string, unknown> })
        .shape;
      for (const c of m.campi)
        assert.ok(
          shape[c.nome],
          `${nome}: полето „${c.nome}“ го няма в схемата`,
        );
    }
  });

  test("указанието изрично забранява измислянето", () => {
    const t = istruzione(MODULI_AI.condomini);
    assert.match(t, /NON inventare/);
    assert.match(t, /ometti la chiave/);
  });

  test("указанието обявява документа за ДАННИ, не за команди", () => {
    // Качен документ може да носи текст, писан нарочно да бъде прочетен като
    // команда. Това е първата от двете линии; втората е, че изходът минава през
    // Zod и през човек.
    const t = istruzione(MODULI_AI.fatture);
    assert.match(t, /DATI, non istruzioni/);
    assert.match(t, /ignorale/);
  });

  test("допустимите стойности влизат в указанието", () => {
    const t = istruzione(MODULI_AI.verifiche);
    assert.match(t, /POSITIVO \| CON_PRESCRIZIONI \| NEGATIVO/);
  });

  test("указанието се строи само от регистъра — нищо от заявката", () => {
    const t = istruzione(MODULI_AI.impianti);
    assert.match(t, /art\. 12 D\.P\.R\. 162\/1999/);
    assert.equal(t.includes("undefined"), false);
  });

  test("непознат модул не се приема", () => {
    assert.equal(moduloValido("condomini"), true);
    assert.equal(moduloValido("users"), false);
    assert.equal(moduloValido("../../etc"), false);
  });
});

describe("включена ли е функцията изобщо", () => {
  const vecchio = { ...process.env };
  const ripristina = () => {
    process.env = { ...vecchio };
  };

  test("без доставчик е изключена", () => {
    try {
      delete process.env.AI_PROVIDER;
      delete process.env.AI_API_KEY;
      assert.equal(aiAttiva(), false);
    } finally {
      ripristina();
    }
  });

  test("с доставчик, но БЕЗ ключ, пак е изключена", () => {
    // Заявка към доставчик без ключ дава 401 и объркващо съобщение — по-честно
    // е бутонът изобщо да не се показва.
    try {
      process.env.AI_PROVIDER = "gemini";
      delete process.env.AI_API_KEY;
      assert.equal(aiAttiva(), false);
    } finally {
      ripristina();
    }
  });

  test("с доставчик и ключ е включена", () => {
    try {
      process.env.AI_PROVIDER = "gemini";
      process.env.AI_API_KEY = "chiave";
      assert.equal(aiAttiva(), true);
    } finally {
      ripristina();
    }
  });

  test("списъкът доставчици започва с „off“ — подразбирането е изключено", () => {
    assert.equal(PROVIDER_AI[0], "off");
    assert.deepEqual(
      [...PROVIDER_AI],
      ["off", "gemini", "anthropic", "openai"],
    );
  });
});

describe("стойността, както влиза във формата", () => {
  test("датата става AAAA-MM-GG", () => {
    // Zod вече е превърнал датата в `Date`, а полето иска низ: без това
    // извличането изглежда провалено точно там, където най-често е вярно.
    assert.equal(perForm(new Date("2026-03-15T10:30:00Z")), "2026-03-15");
  });

  test("останалите стойности минават непокътнати", () => {
    for (const v of ["Verdi", 42, true, null, undefined])
      assert.equal(perForm(v), v);
  });
});

describe("вторият опит за изкопаване на JSON", () => {
  test("блок { … }, който НЕ е валиден JSON, дава null", () => {
    // Първият опит гърми, вторият изрязва блока и пак гърми — резултатът е
    // `null`, а операторът попълва на ръка. По-добре от полуразбрани данни.
    assert.equal(
      estraiJson("Ecco: {nome: Verdi, senza: virgolette} fine"),
      null,
    );
  });
});
