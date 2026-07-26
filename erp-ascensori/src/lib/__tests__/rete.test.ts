// Вратата навън: какво минава и какво не.
//
// Тестът е за СИГУРНОСТ, не за поведение: всеки ред тук отговаря на конкретен
// начин, по който проверка на ИМЕТО се заобикаля. Затова случаите са
// изброени поименно, а не генерирани — нападателят също ги изброява.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  ipInterno,
  hostInterno,
  lookupSicuro,
  valutaIndirizzi,
  postEsterno,
  ErroreIndirizzoInterno,
} from "../rete";

describe("литерален адрес", () => {
  test("вътрешните диапазони по IPv4 не минават", () => {
    for (const ip of [
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.1",
      "192.168.1.1",
      "0.0.0.0",
      "169.254.169.254", // метаданните на облака — целта на всяко SSRF
      "100.64.0.1", // CGNAT
      "192.0.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ])
      assert.equal(ipInterno(ip), true, ip);
  });

  test("публичните минават", () => {
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "172.15.0.1", // до частния диапазон, но извън него
      "172.32.0.1", // след него
      "192.167.0.1",
      "100.63.0.1",
      "100.128.0.1",
      "223.255.255.255",
      "2a00:1450:4001::1",
    ])
      assert.equal(ipInterno(ip), false, ip);
  });

  // ТОВА Е БАЙПАСЪТ, КОЙТО ПРОВЕРКАТА НА НИЗ ПРОПУСКА. `new URL()` дава
  // hostname `[::ffff:a9fe:a9fe]` — не съвпада с никакъв IPv4 шаблон, а на
  // двойния стек рутира точно към `169.254.169.254`.
  test("IPv4, облечен в IPv6, е СЪЩИЯТ адрес", () => {
    for (const ip of [
      "::ffff:169.254.169.254",
      "[::ffff:169.254.169.254]",
      "::ffff:a9fe:a9fe",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:10.0.0.1",
    ])
      assert.equal(ipInterno(ip), true, ip);
    assert.equal(ipInterno("::ffff:8.8.8.8"), false);
    assert.equal(ipInterno("::ffff:808:808"), false);
    // Опашка, която не е нито IPv4, нито две шестнайсетични групи: fail-closed.
    assert.equal(ipInterno("::ffff:zzzz"), true);
    assert.equal(ipInterno("::ffff:1:2:3"), true);
  });

  test("останалите вътрешни IPv6 обхвати", () => {
    for (const ip of [
      "::",
      "::1",
      "[::1]",
      "fe80::1",
      "fe80::1%eth0", // зоната не участва в преценката
      "fd00::1",
      "fc00::abcd",
      "ff02::1",
      "100::1",
    ])
      assert.equal(ipInterno(ip), true, ip);
  });

  test("това, което не е адрес, НЕ се брои за публично", () => {
    // Fail-closed: непознат формат минава за вътрешен, не за външен.
    for (const v of ["", "   ", "999.1.1.1", "1.2.3", "1.2.3.4.5", "abc"])
      assert.equal(ipInterno(v), true, JSON.stringify(v));
  });
});

describe("хост по име", () => {
  test("имената, които никога не сочат навън", () => {
    for (const h of [
      "localhost",
      "LOCALHOST",
      "app.localhost",
      "db.internal",
      "printer.local",
      "router.home.arpa",
      "postgres", // без точка — резолвира се от вътрешния DNS/hosts
      "db",
      "",
    ])
      assert.equal(hostInterno(h), true, h);
  });

  test("публично име минава — то се проверява при СВЪРЗВАНЕТО", () => {
    for (const h of [
      "esempio.it",
      "hooks.esempio.it",
      "erp.carbonstealth.eu",
      "esempio.it.", // с крайна точка (абсолютно име)
    ])
      assert.equal(hostInterno(h), false, h);
  });

  test("литерален вътрешен адрес се хваща и по име", () => {
    assert.equal(hostInterno("169.254.169.254"), true);
    assert.equal(hostInterno("[::ffff:169.254.169.254]"), true);
    assert.equal(hostInterno("8.8.8.8"), false);
  });
});

describe("резолвирането пази при свързването", () => {
  test("публично име се резолвира и минава", (_t, done) => {
    lookupSicuro("localhost.esempio.invalid", {}, (err) => {
      // Несъществуващо име дава грешка от DNS — важното е, че НЕ е нашата.
      assert.ok(err);
      assert.notEqual(err.name, "ErroreIndirizzoInterno");
      done();
    });
  });

  test("името „localhost“ се резолвира навътре и се ОТКАЗВА", (_t, done) => {
    lookupSicuro("localhost", { family: 4 }, (err) => {
      assert.ok(err instanceof ErroreIndirizzoInterno, String(err));
      assert.equal((err as NodeJS.ErrnoException).code, "EACCES");
      done();
    });
  });

  test("опциите се предават: `all` връща масив", (_t, done) => {
    lookupSicuro("localhost", { all: true, family: 4 }, (err) => {
      // Пак отказ — важното е, че формата на опциите не го заобикаля.
      assert.ok(err instanceof ErroreIndirizzoInterno);
      done();
    });
  });

  test("числото се приема като семейство (подписът на dns.lookup)", (_t, done) => {
    lookupSicuro("localhost", 4, (err) => {
      assert.ok(err instanceof ErroreIndirizzoInterno);
      done();
    });
  });

  // РЕШЕНИЕТО, взето отделно от резолвирането — тук е цялото правило.
  test("публични адреси минават; един вътрешен между тях спира всичко", () => {
    const pub = [
      { address: "8.8.8.8", family: 4 },
      { address: "2a00:1450:4001::1", family: 6 },
    ];
    assert.equal(valutaIndirizzi("esempio.it", pub), null);

    // Подписът на rebinding: част публични, част навътре. Не се филтрира —
    // отказва се, защото името вече е доказало, че сочи и навътре.
    const misto = [...pub, { address: "169.254.169.254", family: 4 }];
    const e = valutaIndirizzi("esempio.it", misto);
    assert.ok(e instanceof ErroreIndirizzoInterno);
    assert.equal((e as NodeJS.ErrnoException).code, "EACCES");

    // Празен отговор не е „разрешено": fail-closed.
    const vuoto = valutaIndirizzi("esempio.it", []);
    assert.equal(vuoto?.code, "ENOTFOUND");
  });
});

describe("изходящият POST", () => {
  test("HTTP не минава: известието носи бизнес данни", async () => {
    await assert.rejects(
      postEsterno("http://esempio.it/hook", {
        intestazioni: {},
        corpo: "{}",
        timeoutMs: 100,
      }),
      /HTTPS/,
    );
  });

  test("невалиден адрес не минава", async () => {
    await assert.rejects(
      postEsterno("non-un-url", {
        intestazioni: {},
        corpo: "{}",
        timeoutMs: 100,
      }),
      /URL non valido/,
    );
  });

  // Истинската защита: дори адресът да е записан отдавна, свързването не
  // тръгва към вътрешна мрежа.
  test("вътрешен адрес се отказва ПРЕДИ да се отвори сокет", async () => {
    const server = createServer((_req, res) => res.end("ok"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const porta = (server.address() as { port: number }).port;
    try {
      await assert.rejects(
        postEsterno(`https://127.0.0.1:${porta}/hook`, {
          intestazioni: {},
          corpo: "{}",
          timeoutMs: 500,
        }),
        (e: Error) => e instanceof ErroreIndirizzoInterno,
      );
      // И по име, което сочи навътре — това е случаят, който проверка на низа
      // не вижда изобщо.
      await assert.rejects(
        postEsterno(`https://localhost:${porta}/hook`, {
          intestazioni: {},
          corpo: "{}",
          timeoutMs: 500,
        }),
        (e: Error) => e instanceof ErroreIndirizzoInterno,
      );
    } finally {
      server.close();
    }
  });
});
