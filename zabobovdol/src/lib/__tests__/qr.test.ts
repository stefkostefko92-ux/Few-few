import test from "node:test";
import assert from "node:assert/strict";
import { create } from "qrcode";
import {
  GENERAL_PROMISE,
  parseShortCode,
  posterPromise,
  qrRedirectLocation,
  safeInternalTarget,
  shortLinkPath,
  targetPath,
} from "@/lib/qr";
import { qrPath } from "@/lib/qr-svg";
import { normalizeSource } from "@/lib/stats-core";

test("parseShortCode приема само малки латински букви, цифри и тире", () => {
  assert.equal(parseShortCode("apteka-centar"), "apteka-centar");
  assert.equal(parseShortCode("  Apteka-1 "), "apteka-1");
  assert.equal(parseShortCode(["poshta", "drugo"]), "poshta");
  assert.equal(parseShortCode("аптека"), null);
  assert.equal(parseShortCode("a b"), null);
  assert.equal(parseShortCode("a/b"), null);
  assert.equal(parseShortCode("a".repeat(41)), null);
  assert.equal(parseShortCode(""), null);
  assert.equal(parseShortCode(undefined), null);
  assert.equal(parseShortCode(42), null);
});

test("кодът дава маркер, който статистиката приема (qr-<код>)", () => {
  const code = parseShortCode("a".repeat(40))!;
  assert.equal(normalizeSource(`qr-${code}`, null, null), `qr-${code}`);
  assert.equal(normalizeSource("qr-apteka-1", null, null), "qr-apteka-1");
});

test("safeInternalTarget пуска само вътрешни пътища", () => {
  assert.equal(safeInternalTarget("/dezhurna-apteka"), "/dezhurna-apteka");
  assert.equal(safeInternalTarget(" /uslugi \n"), "/uslugi");
  assert.equal(safeInternalTarget("/kak-da?x=1#gore"), "/kak-da?x=1#gore");
  assert.equal(safeInternalTarget("/"), "/");
});

test("safeInternalTarget спира отвореното пренасочване и кръговете", () => {
  for (const bad of [
    "//evil.example",
    "https://evil.example/",
    "http:/evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/\\evil.example",
    "/\\/evil.example",
    "/ok\\..\\x",
    "/\tevil",
    "/a b",
    "/ok\nLocation: //evil",
    "/p/drug-kod",
    "/P/drug-kod",
    "/p",
    "/a/../p/x",
    "/api/e",
    "/" + "a".repeat(400),
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeInternalTarget(bad), "/", String(bad));
  }
});

test("qrRedirectLocation добавя ?s=qr-<код> и остава относителен", () => {
  assert.equal(qrRedirectLocation("/dezhurna-apteka", "apteka"), "/dezhurna-apteka?s=qr-apteka");
  assert.equal(qrRedirectLocation("/kak-da?x=1#gore", "a"), "/kak-da?x=1&s=qr-a#gore");
  assert.equal(qrRedirectLocation("/izmami?s=share", "poshta"), "/izmami?s=qr-poshta");
  assert.equal(qrRedirectLocation("//evil.example", "x"), "/?s=qr-x");
  assert.equal(qrRedirectLocation("https://evil.example", "x"), "/?s=qr-x");
  // Кирилица в пътя се кодира (Location е само ASCII), но остава вътрешен път.
  const cyr = qrRedirectLocation("/новини", "x");
  assert.ok(cyr.startsWith("/%D0%BD"), cyr);
  for (const t of ["/a", "//b", "/\\c", "https://d"]) {
    const loc = qrRedirectLocation(t, "k");
    assert.ok(loc.startsWith("/") && !loc.startsWith("//"), loc);
  }
});

test("targetPath и shortLinkPath", () => {
  assert.equal(targetPath("/kak-da/x?y=1#z"), "/kak-da/x");
  assert.equal(targetPath("//evil"), "/");
  assert.equal(shortLinkPath("apteka"), "/p/apteka");
});

test("posterPromise дава конкретно обещание според целта", () => {
  assert.equal(posterPromise("/dezhurna-apteka"), "Дежурната аптека днес — с един поглед");
  assert.equal(posterPromise("/dezhurna-apteka?x=1"), "Дежурната аптека днес — с един поглед");
  assert.match(posterPromise("/kak-da/pensiya"), /Как да/);
  assert.equal(posterPromise("/izmamix"), GENERAL_PROMISE);
  assert.equal(posterPromise("/neshto-drugo"), GENERAL_PROMISE);
  assert.equal(posterPromise("//evil.example"), GENERAL_PROMISE);
});

test("qrPath рисува кода на сървъра: размер, тихо поле и ъглови маркери", () => {
  const text = "https://zabobovdol.carbonstealth.eu/p/apteka-centar";
  const n = create(text, { errorCorrectionLevel: "Q" }).modules.size;
  const r = qrPath(text);
  assert.equal(r.size, n + 8);
  // Горният ред на ъгловия маркер горе вляво: 7 тъмни модула от (4,4).
  assert.ok(r.d.startsWith("M4 4h7v1h-7z"), r.d.slice(0, 20));
  // Детерминистично — един и същ адрес, един и същ код.
  assert.equal(qrPath(text).d, r.d);
  assert.notEqual(qrPath(text + "x").d, r.d);
  assert.equal(qrPath(text, { margin: 2 }).size, n + 4);
});

test("qrPath покрива точно тъмните модули", () => {
  const text = "https://zabobovdol.carbonstealth.eu/?s=print";
  const qr = create(text, { errorCorrectionLevel: "Q" });
  const dark = Array.from(qr.modules.data).filter(Boolean).length;
  const runs = [...qrPath(text).d.matchAll(/h(\d+)v1/g)].reduce((s, m) => s + Number(m[1]), 0);
  assert.equal(runs, dark);
});
