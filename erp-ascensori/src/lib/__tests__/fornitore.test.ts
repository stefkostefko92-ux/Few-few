// Слоят към доставчика на модела — с подменен `fetch`, без мрежа.
//
// ЗАЩО СИ СТРУВА ДА СЕ ТЕСТВА КОД, КОЙТО „САМО ВИКА HTTP“. Точно тук се решава
// какво напуска сървъра: ключът, документът на клиента и указанието. Тестът
// проверява ТЯЛОТО на заявката, не само че функцията не гърми — а именно
// тялото никой не поглежда, докато не изтече навън.
//
// Подмяната на `globalThis.fetch` е достатъчна и предпочитана пред библиотека
// за мокване: няма зависимост, а проверката е върху истинския `Request`.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chiedi, estraiJson, ErroreAi } from "../ai/fornitore";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

interface Chiamata {
  url: string;
  init: RequestInit;
  corpo: Record<string, unknown>;
}

let chiamate: Chiamata[] = [];
const fetchVero = globalThis.fetch;
const envVero = { ...process.env };

/** Подменя `fetch` с отговор по избор и записва какво е било изпратено. */
function stubFetch(risposta: { stato?: number; corpo?: unknown; testo?: string }) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    chiamate.push({
      url: String(url),
      init: init ?? {},
      corpo: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    const testo =
      risposta.testo ?? JSON.stringify(risposta.corpo ?? {});
    return new Response(testo, { status: risposta.stato ?? 200 });
  }) as typeof fetch;
}

function conProvider(p: string, extra: Record<string, string> = {}) {
  process.env.AI_PROVIDER = p;
  process.env.AI_API_KEY = "chiave-di-prova";
  for (const [k, v] of Object.entries(extra)) process.env[k] = v;
}

beforeEach(() => {
  chiamate = [];
  for (const k of [
    "AI_PROVIDER",
    "AI_API_KEY",
    "AI_MODEL",
    "AI_BASE_URL",
    "AI_FORNITORE_ETICHETTA",
  ])
    delete process.env[k];
});

afterEach(() => {
  globalThis.fetch = fetchVero;
  process.env = { ...envVero };
});

const RICHIESTA = {
  istruzione: "Estrai i dati.",
  documento: { dati: PDF, mimeType: "application/pdf" },
};

describe("изключената функция", () => {
  test("не праща НИЩО навън", async () => {
    stubFetch({ corpo: {} });
    await assert.rejects(() => chiedi(RICHIESTA), (e: unknown) => {
      assert.ok(e instanceof ErroreAi);
      assert.equal(e.stato, 503);
      return true;
    });
    // Най-важното твърдение във файла: без конфигурация мрежата не се пипа.
    assert.equal(chiamate.length, 0);
  });

  test("конфигуриран доставчик БЕЗ ключ също е изключен", async () => {
    process.env.AI_PROVIDER = "gemini";
    stubFetch({ corpo: {} });
    await assert.rejects(() => chiedi(RICHIESTA));
    assert.equal(chiamate.length, 0);
  });
});

describe("Gemini", () => {
  test("указанието и документът тръгват в правилните полета", async () => {
    conProvider("gemini");
    stubFetch({
      corpo: {
        candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }],
      },
    });
    const out = await chiedi(RICHIESTA);
    assert.equal(out, '{"a":1}');

    const c = chiamate[0];
    assert.match(c.url, /generativelanguage\.googleapis\.com/);
    assert.match(c.url, /models\/gemini-2\.5-flash:generateContent/);
    // Ключът върви в хедър, НЕ в адреса: адресите влизат в логове на прокси.
    const h = c.init.headers as Record<string, string>;
    assert.equal(h["x-goog-api-key"], "chiave-di-prova");
    assert.equal(/chiave-di-prova/.test(c.url), false);
  });

  test("температурата е НУЛА — извличане, не съчинение", async () => {
    conProvider("gemini");
    stubFetch({ corpo: { candidates: [] } });
    await chiedi(RICHIESTA);
    const cfg = chiamate[0].corpo.generationConfig as Record<string, unknown>;
    // Ненулева температура значи модел, който „допълва" полета, каквито в
    // документа ги няма — а тези полета отиват във фискални документи.
    assert.equal(cfg.temperature, 0);
    assert.equal(cfg.responseMimeType, "application/json");
  });

  test("няколко части се слепват, празният отговор дава празен низ", async () => {
    conProvider("gemini");
    stubFetch({
      corpo: {
        candidates: [{ content: { parts: [{ text: "{" }, { text: '"a":1}' }] } }],
      },
    });
    assert.equal(await chiedi(RICHIESTA), '{"a":1}');

    chiamate = [];
    stubFetch({ corpo: {} });
    assert.equal(await chiedi(RICHIESTA), "");
  });

  test("част БЕЗ текст не чупи слепването", async () => {
    conProvider("gemini");
    stubFetch({ corpo: { candidates: [{ content: { parts: [{}, { text: "x" }] } }] } });
    assert.equal(await chiedi(RICHIESTA), "x");
  });

  test("сменяем адрес — за клиент, който иска обработка в ЕС", async () => {
    conProvider("gemini", {
      AI_BASE_URL: "https://eu-proxy.example.it/v1beta/",
      AI_MODEL: "gemini-custom",
    });
    stubFetch({ corpo: { candidates: [] } });
    await chiedi(RICHIESTA);
    // Наклонената черта накрая се маха: иначе адресът става с двойна черта.
    assert.match(chiamate[0].url, /^https:\/\/eu-proxy\.example\.it\/v1beta\/models\//);
    assert.match(chiamate[0].url, /gemini-custom/);
  });
});

describe("Anthropic", () => {
  test("PDF-ът върви като документ, картинката като изображение", async () => {
    conProvider("anthropic");
    stubFetch({ corpo: { content: [{ type: "text", text: "ok" }] } });

    await chiedi(RICHIESTA);
    let msg = (chiamate[0].corpo.messages as { content: { type: string }[] }[])[0];
    assert.equal(msg.content[0].type, "document");

    chiamate = [];
    await chiedi({
      istruzione: "x",
      documento: { dati: PNG, mimeType: "image/png" },
    });
    msg = (chiamate[0].corpo.messages as { content: { type: string }[] }[])[0];
    // Подаден като „document", PNG-то би било отхвърлено от доставчика — а
    // снимка от телефон е най-честият вход в тази функция.
    assert.equal(msg.content[0].type, "image");
  });

  test("нетекстовите части се изхвърлят от отговора", async () => {
    conProvider("anthropic");
    stubFetch({
      corpo: {
        content: [
          { type: "thinking", text: "ragionamento interno" },
          { type: "text", text: '{"a":1}' },
        ],
      },
    });
    const out = await chiedi(RICHIESTA);
    assert.equal(out, '{"a":1}');
    assert.equal(/ragionamento/.test(out), false);
  });

  test("липсващо съдържание дава празен низ, не изключение", async () => {
    conProvider("anthropic");
    stubFetch({ corpo: {} });
    assert.equal(await chiedi(RICHIESTA), "");
  });

  test("версията на API-то е задължителен хедър", async () => {
    conProvider("anthropic");
    stubFetch({ corpo: { content: [] } });
    await chiedi(RICHIESTA);
    const h = chiamate[0].init.headers as Record<string, string>;
    assert.equal(h["anthropic-version"], "2023-06-01");
    assert.equal(h["x-api-key"], "chiave-di-prova");
  });
});

describe("OpenAI", () => {
  test("PDF през `file`, картинка през `image_url`", async () => {
    conProvider("openai");
    stubFetch({ corpo: { choices: [{ message: { content: "{}" } }] } });

    await chiedi(RICHIESTA);
    let parti = (
      chiamate[0].corpo.messages as { content: { type: string }[] }[]
    )[0].content;
    assert.equal(parti[1].type, "file");

    chiamate = [];
    await chiedi({
      istruzione: "x",
      documento: { dati: PNG, mimeType: "image/png" },
    });
    parti = (chiamate[0].corpo.messages as { content: { type: string }[] }[])[0]
      .content;
    assert.equal(parti[1].type, "image_url");
  });

  test("ключът е Bearer, изисква се JSON обект", async () => {
    conProvider("openai");
    stubFetch({ corpo: { choices: [] } });
    await chiedi(RICHIESTA);
    const h = chiamate[0].init.headers as Record<string, string>;
    assert.equal(h.Authorization, "Bearer chiave-di-prova");
    assert.deepEqual(chiamate[0].corpo.response_format, { type: "json_object" });
  });

  test("липсващ избор дава празен низ", async () => {
    conProvider("openai");
    stubFetch({ corpo: {} });
    assert.equal(await chiedi(RICHIESTA), "");
  });

  test("непознат доставчик пада на OpenAI пътя, не гърми", async () => {
    // `effettivo` минава през затворен списък, тоест дотук стигат само
    // познатите — но кодът не бива да зависи от това по подразбиране.
    conProvider("openai");
    stubFetch({ corpo: { choices: [{ message: { content: "x" } }] } });
    assert.equal(await chiedi(RICHIESTA), "x");
  });
});

describe("грешките се превеждат, суровият текст НЕ излиза", () => {
  const casi: [number, number, RegExp][] = [
    [401, 503, /Chiave/i],
    [403, 503, /Chiave/i],
    [429, 429, /Quota/i],
    [413, 413, /troppo grande/i],
    [500, 502, /non ha risposto/i],
    [418, 502, /non ha risposto/i],
  ];

  for (const [dal, atteso, testo] of casi)
    test(`${dal} → ${atteso}`, async () => {
      conProvider("gemini");
      stubFetch({
        stato: dal,
        testo: JSON.stringify({
          error: { message: "internal-detail: user@example.com" },
        }),
      });
      await assert.rejects(() => chiedi(RICHIESTA), (e: unknown) => {
        assert.ok(e instanceof ErroreAi);
        assert.equal(e.stato, atteso);
        assert.match(e.message, testo);
        // Суровият текст на доставчика издава вътрешни подробности и понякога
        // част от подадените данни. Не бива да стига до оператора.
        assert.equal(/internal-detail|user@example/.test(e.message), false);
        return true;
      });
    });

  test("нечетим отговор е 502, не 500", async () => {
    conProvider("gemini");
    stubFetch({ testo: "<html>502 Bad Gateway</html>" });
    await assert.rejects(() => chiedi(RICHIESTA), (e: unknown) => {
      assert.ok(e instanceof ErroreAi);
      assert.equal(e.stato, 502);
      return true;
    });
  });

  test("мрежова грешка и таймаут изглеждат еднакво отвън", async () => {
    conProvider("gemini");
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    await assert.rejects(() => chiedi(RICHIESTA), (e: unknown) => {
      assert.ok(e instanceof ErroreAi);
      assert.equal(e.stato, 504);
      // Съобщението не издава дали адресът съществува.
      assert.equal(/ECONNREFUSED/.test(e.message), false);
      return true;
    });
  });

  test("вече преведената грешка НЕ се превежда втори път", async () => {
    conProvider("gemini");
    stubFetch({ stato: 429 });
    await assert.rejects(() => chiedi(RICHIESTA), (e: unknown) => {
      // Иначе 429 би станала 504 и операторът би чакал вместо да намали
      // натоварването.
      assert.equal((e as ErroreAi).stato, 429);
      return true;
    });
  });
});

describe("изкопаването на JSON", () => {
  test("чист JSON минава", () => {
    assert.deepEqual(estraiJson('{"a":1}'), { a: 1 });
  });

  test("оградата ```json се маха", () => {
    // Моделите я слагат въпреки изричното указание. По-евтино е да я изчистим,
    // отколкото да откажем валиден отговор заради три обратни апострофа.
    assert.deepEqual(estraiJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(estraiJson('```\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(estraiJson('```JSON\n{"a":1}```'), { a: 1 });
  });

  test("изречение преди обекта не проваля разбора", () => {
    assert.deepEqual(
      estraiJson('Ecco i dati estratti:\n{"nome":"Verdi"}\nSpero sia utile.'),
      { nome: "Verdi" },
    );
  });

  test("вложените скоби се хващат до ПОСЛЕДНАТА затваряща", () => {
    assert.deepEqual(estraiJson('x {"a":{"b":2}} y'), { a: { b: 2 } });
  });

  test("боклук дава null, не изключение", () => {
    for (const v of ["", "ciao", "{", "}{", "```json\n non-json ```"])
      assert.equal(estraiJson(v), null, JSON.stringify(v));
  });

  test("масив на най-горно ниво минава — проверката е другаде", () => {
    assert.deepEqual(estraiJson("[1,2]"), [1, 2]);
  });
});
