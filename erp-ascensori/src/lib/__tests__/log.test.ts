// Структурираният лог: какво излиза и какво НЕ излиза.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import {
  rottaModello,
  SEGMENTI_NOTI,
  filtra,
  descriviErrore,
  log,
} from "../log";

// РЕЧНИКЪТ НЕ БИВА ДА ОСТАРЯВА МЪЛЧАЛИВО.
//
// `rottaModello` заменя всеки НЕПОЗНАТ сегмент с `[id]` — това затваря етикета
// на метриката срещу анонимен вход. Цената е, че нов маршрут без ред в речника
// излиза като `[id]` и изчезва от таблото, без нищо да гръмне. Затова списъкът
// се сверява с файловата система: тестът пада при нова папка в `src/app/api`.
describe("речникът на маршрутите", () => {
  test("покрива всяка реална папка в src/app/api", () => {
    const radice = new URL("../../app/api/", import.meta.url);
    const trovati = new Set<string>();
    const scendi = (u: URL) => {
      for (const e of readdirSync(u, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        // `[id]`, `[rigaId]` и подобните са ДИНАМИЧНИ по определение.
        if (!e.name.startsWith("[")) trovati.add(e.name);
        scendi(new URL(`${e.name}/`, u));
      }
    };
    scendi(radice);
    const mancanti = [...trovati].filter((n) => !SEGMENTI_NOTI.has(n));
    assert.deepEqual(
      mancanti,
      [],
      `нови сегменти без ред в SEGMENTI_NOTI (иначе изчезват от метриките като „[id]"): ${mancanti.join(", ")}`,
    );
  });

  test("непознат сегмент НЕ ражда етикет, колкото и различен да е", () => {
    const uniche = new Set(
      Array.from({ length: 500 }, (_, i) =>
        rottaModello(`/api/fatture/x${i}/ddt`),
      ),
    );
    assert.equal(uniche.size, 1);
    assert.equal([...uniche][0], "/api/fatture/[id]/ddt");
  });
});

// ФИЛТЪРЪТ Е ЗАЩИТА, НЕ ФОРМАТИРАНЕ. През него минава всичко, което влиза в
// лога; поле извън списъка е поле, което утре ще е нечие име в чужд SIEM.
describe("allowlist на лога", () => {
  test("непознато поле НЕ излиза, колкото и да прилича на нужно", () => {
    const fuori = filtra({
      rotta: "/api/fatture/[id]",
      stato: 500,
      email: "mario@esempio.it",
      password: "segreta",
      codiceFiscale: "RSSMRA80A01H501U",
      corpo: { importo: 100 },
    });
    assert.deepEqual(Object.keys(fuori).sort(), ["rotta", "stato"]);
    assert.equal(JSON.stringify(fuori).includes("esempio.it"), false);
  });

  test("`undefined` изчезва, `null` остава", () => {
    // Разликата има значение: `null` е измерена липса, `undefined` е нищо.
    const r = filtra({ stato: null, durata_ms: undefined, msg: "prova" });
    assert.deepEqual(r, { stato: null, msg: "prova" });
  });

  test("сложна стойност се свежда до низ, не се сериализира дълбоко", () => {
    // Обект в лога е път, по който вложено поле се промъква покрай списъка.
    const r = filtra({ msg: { a: { b: "segreto" } } });
    assert.equal(typeof r.msg, "string");
    assert.equal(String(r.msg).includes("segreto"), false);
  });
});

describe("описанието на грешката", () => {
  test("носи ТИП и код, никога съобщението", () => {
    // Съобщенията на Prisma съдържат аргументите на заявката — тоест тялото.
    const e = Object.assign(
      new TypeError("email mario@esempio.it non valido"),
      {
        code: "P2002",
      },
    );
    const d = descriviErrore(e);
    assert.deepEqual(d, { err_tipo: "TypeError", err_codice: "P2002" });
    assert.equal(JSON.stringify(d).includes("esempio.it"), false);
  });

  test("не гърми при нещо, което не е грешка", () => {
    assert.deepEqual(descriviErrore("боклук"), {
      err_tipo: "string",
      err_codice: "",
    });
    assert.deepEqual(descriviErrore(null), {
      err_tipo: "object",
      err_codice: "",
    });
  });
});

describe("изходът", () => {
  test("грешките отиват на stderr, останалото на stdout", () => {
    const veroLog = console.log;
    const veroErr = console.error;
    const out: string[] = [];
    const err: string[] = [];
    console.log = (t: string) => out.push(t);
    console.error = (t: string) => err.push(t);
    try {
      log.info("tutto bene", { stato: 200 });
      log.warn("attenzione", { stato: 429 });
      log.error("rotto", { stato: 500 });
    } finally {
      console.log = veroLog;
      console.error = veroErr;
    }
    assert.equal(out.length, 2);
    assert.equal(err.length, 1);
    const riga = JSON.parse(err[0]) as Record<string, unknown>;
    assert.equal(riga.livello, "error");
    assert.equal(riga.msg, "rotto");
    assert.equal(typeof riga.ts, "string");
  });
});
