import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { costruisciCsp, generaNonce, nomeHeaderCsp,
  soloRapporto,
} from "../csp";
import { leggiRapporto, DIRETTIVE_NOTE } from "../csp-rapporto";

function direttive(csp: string): Map<string, string> {
  return new Map(
    csp.split(";").map((p) => {
      const t = p.trim();
      const i = t.indexOf(" ");
      return i === -1
        ? ([t, ""] as [string, string])
        : ([t.slice(0, i), t.slice(i + 1)] as [string, string]);
    }),
  );
}

describe("политиката", () => {
  const d = direttive(costruisciCsp({ nonce: "AAAA" }));

  test("nonce-ът стига до script-src", () => {
    assert.match(d.get("script-src") ?? "", /'nonce-AAAA'/);
  });

  test("НЯМА 'unsafe-inline' за скриптове — това е целият смисъл", () => {
    // Ако някой някога го добави, за да „оправи" счупена страница, тестът пада
    // тук, а не в докладите на клиента шест месеца по-късно.
    assert.equal(/unsafe-inline/.test(d.get("script-src") ?? ""), false);
  });

  test("НЯМА 'unsafe-eval' в производство", () => {
    assert.equal(/unsafe-eval/.test(d.get("script-src") ?? ""), false);
    assert.match(
      direttive(costruisciCsp({ nonce: "A", sviluppo: true })).get(
        "script-src",
      ) ?? "",
      /'unsafe-eval'/,
    );
  });

  test("'strict-dynamic' обезсилва списъка с адреси", () => {
    // `https:` е там САМО за стари браузъри. При CSP3 `strict-dynamic` го
    // изхвърля — двете заедно дават строгост и съвместимост едновременно.
    assert.match(d.get("script-src") ?? "", /'strict-dynamic'/);
  });

  test("разхлабването на стиловете е само за АТРИБУТИ", () => {
    assert.equal(d.get("style-src-elem"), "'self'");
    assert.equal(d.get("style-src-attr"), "'unsafe-inline'");
    // Общото `style-src` не се задава: то би пренаписало и двете.
    assert.equal(d.has("style-src"), false);
  });

  test("трите неща, които спират кражбата на форма и на основа", () => {
    assert.equal(d.get("form-action"), "'self'");
    assert.equal(d.get("base-uri"), "'none'");
    assert.equal(d.get("frame-ancestors"), "'none'");
  });

  test("подписът на клиента иска data: за картинки, нищо повече", () => {
    assert.equal(d.get("img-src"), "'self' data:");
  });

  test("браузърът няма работа навън: доставчиците на AI се викат от сървъра", () => {
    assert.equal(d.get("connect-src"), "'self'");
  });

  test("докладите отиват на наш маршрут", () => {
    assert.equal(d.get("report-uri"), "/api/csp-report");
  });

  test("upgrade-insecure-requests само в производство", () => {
    assert.equal(d.has("upgrade-insecure-requests"), true);
    assert.equal(
      direttive(costruisciCsp({ nonce: "A", sviluppo: true })).has(
        "upgrade-insecure-requests",
      ),
      false,
    );
  });
});

describe("поетапно въвеждане", () => {
  test("режимът само за наблюдение сменя ХЕДЪРА, не политиката", () => {
    assert.equal(
      nomeHeaderCsp({ CSP_REPORT_ONLY: "1" }),
      "Content-Security-Policy-Report-Only",
    );
    assert.equal(nomeHeaderCsp({}), "Content-Security-Policy");
    // Нищо друго не се мени: иначе наблюдаваното не е това, което ще влезе.
    assert.equal(
      costruisciCsp({ nonce: "A" }),
      costruisciCsp({ nonce: "A" }),
    );
  });
});

describe("nonce", () => {
  test("не се повтаря", () => {
    const visti = new Set(Array.from({ length: 500 }, generaNonce));
    assert.equal(visti.size, 500);
  });

  test("е достатъчно дълъг и не чупи хедъра", () => {
    const n = generaNonce();
    assert.ok(n.length >= 22, n);
    // base64 без нов ред, кавички и точка и запетая — иначе излиза от
    // директивата и политиката става друга.
    assert.match(n, /^[A-Za-z0-9+/=]+$/);
  });
});

describe("докладът от браузъра е външен вход", () => {
  test("старият формат се разбира", () => {
    assert.deepEqual(
      leggiRapporto({
        "csp-report": {
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/x.js?token=segreto",
        },
      }),
      [{ direttiva: "script-src-elem", origine: "https://evil.example" }],
    );
  });

  test("новият формат (масив) също", () => {
    assert.deepEqual(
      leggiRapporto([
        {
          type: "csp-violation",
          body: { effectiveDirective: "img-src", blockedURL: "data" },
        },
      ]),
      [{ direttiva: "img-src", origine: "data" }],
    );
  });

  test("ПЪТЯТ на блокирания адрес НЕ излиза — остава само произходът", () => {
    const [v] = leggiRapporto({
      "csp-report": {
        "violated-directive": "connect-src",
        "blocked-uri": "https://x.it/api/fatture/9f3a?chiave=abc",
      },
    });
    assert.equal(v.origine, "https://x.it");
    assert.equal(/fatture|chiave|abc/.test(JSON.stringify(v)), false);
  });

  test("измислена директива НЕ става етикет на метрика", () => {
    // Иначе всеки минувач може да ражда времеви редици, докато свърши паметта.
    const [v] = leggiRapporto({
      "csp-report": { "violated-directive": "a".repeat(5000) },
    });
    assert.equal(v.direttiva, "altro");
    assert.equal(v.origine, "altro");
  });

  test("боклук не гърми", () => {
    for (const c of [null, undefined, 42, "stringa", [], {}, { "csp-report": 1 }])
      assert.ok(Array.isArray(leggiRapporto(c)));
  });
});

describe("произходът на блокирания ресурс", () => {
  test("текст, който НЕ е адрес, дава „altro“ вместо да гърми", () => {
    // Стойността идва от браузър на непознат посетител. `new URL` хвърля, а
    // маршрутът за доклади трябва да преглъща всичко и да отговаря еднакво.
    for (const v of ["ciao mondo", "http://", "://x", "]["])
      assert.deepEqual(
        leggiRapporto({ "csp-report": { "violated-directive": "img-src", "blocked-uri": v } }),
        [{ direttiva: "img-src", origine: "altro" }],
        v,
      );
  });

  test("схема без хост става самата схема", () => {
    assert.equal(
      leggiRapporto({
        "csp-report": { "violated-directive": "img-src", "blocked-uri": "data:image/png;base64,AA" },
      })[0].origine,
      "data",
    );
  });

  test("всяка директива от политиката ни е в затворения списък", () => {
    // Иначе собственото ни нарушение би се отчело като „altro" и броячът не би
    // казал по коя директива е сработило.
    for (const d of [
      "script-src",
      "style-src-elem",
      "style-src-attr",
      "img-src",
      "connect-src",
      "form-action",
      "frame-ancestors",
    ])
      assert.ok(DIRETTIVE_NOTE.has(d), d);
  });
});

test("режимът само за наблюдение се чете от обкръжението", () => {
  // Стойност, различна от точно „1", НЕ включва наблюдението: политика, която
  // мълчаливо спира да блокира заради печатна грешка, е по-лоша от липсваща.
  assert.equal(soloRapporto({ CSP_REPORT_ONLY: "1" }), true);
  for (const v of ["0", "true", "si", "", undefined])
    assert.equal(soloRapporto({ CSP_REPORT_ONLY: v }), false, String(v));
  assert.equal(soloRapporto({}), false);
});
