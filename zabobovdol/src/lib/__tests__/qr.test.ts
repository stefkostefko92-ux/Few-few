import test from "node:test";
import assert from "node:assert/strict";
import { create } from "qrcode";
import {
  GENERAL_PROMISE,
  isHumanScan,
  parseShortCode,
  posterPromise,
  qrRedirectLocation,
  resolveShortLink,
  safeInternalTarget,
  shortLinkPath,
  shortLinkRedirectHeaders,
  shortLinkWhere,
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

test("safeInternalTarget нормализира целта ПРЕДИ проверката (dot-сегменти, кодиране)", () => {
  for (const bad of [
    // Dot-сегменти, които URL свежда до „//evil.com“ (protocol-relative).
    "/.//evil.com",
    "/..//evil.com",
    "/a/..//evil.com",
    "/././/evil.com",
    // Кодирани точки (URL ги смята за „.“/„..“).
    "/%2e//evil.com",
    "/%2E%2E//evil.com",
    "/%252e//evil.com",
    // Обратни наклонени черти — сурови и кодирани.
    "/\\evil",
    "/\\\\evil.com",
    "/%5Cevil.com",
    "/%5C%5Cevil.com",
    "/%255C%255Cevil.com",
    // Кодирани наклонени черти.
    "%2F%2Fevil",
    "/%2F%2Fevil.com",
    "/%2f/evil.com",
    // Кръг към /p/ или /api/ през dot-сегменти или кодиране.
    "/%2e%2e/p/x",
    "/x/%2E%2E/api/e",
    "/%70/drug",
    "/%2570/drug",
    // Развалено кодиране и скрити контролни знаци.
    "/%E0%A4%A",
    "/ok%00",
    "/ok%0d%0aLocation:%20//evil",
  ]) {
    assert.equal(safeInternalTarget(bad), "/", bad);
  }
  // Безобидните се свеждат до нормалния път.
  assert.equal(safeInternalTarget("/./"), "/");
  assert.equal(safeInternalTarget("/../"), "/");
  assert.equal(safeInternalTarget("/.."), "/");
  assert.equal(safeInternalTarget("/a/./b/../c"), "/a/c");
  assert.equal(safeInternalTarget("/kak-da/./pensiya?x=1#gore"), "/kak-da/pensiya?x=1#gore");
  // Каквото върне, вече е нормализирано (повторното минаване не го мени).
  for (const t of ["/dezhurna-apteka", "/a/./b/../c", "/новини", "/kak-da?x=1#gore"]) {
    const once = safeInternalTarget(t);
    assert.equal(safeInternalTarget(once), once, t);
    assert.ok(once.startsWith("/") && !once.startsWith("//"), once);
  }
});

test("qrRedirectLocation не извежда навън и при dot-сегменти", () => {
  for (const t of ["/.//evil.com", "/..//evil.com", "/a/..//evil.com", "/%2e//evil.com"]) {
    assert.equal(qrRedirectLocation(t, "x"), "/?s=qr-x", t);
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

// --- /p/<код>: route.ts е само връзка с базата; логиката е тук ---

function finder(rows: Record<string, string | undefined>) {
  const calls: string[] = [];
  return {
    calls,
    find: async (code: string) => {
      calls.push(code);
      const target = rows[code];
      return target === undefined ? null : { target };
    },
  };
}

test("resolveShortLink: невалиден код → null, без заявка към базата", async () => {
  const f = finder({});
  for (const raw of ["a/b", "аптека", "", "a".repeat(41), "../admin"]) {
    assert.equal(await resolveShortLink(raw, f.find), null, raw);
  }
  assert.deepEqual(f.calls, []);
});

test("resolveShortLink: непознат/непубликуван код или грешка в базата → null", async () => {
  // Непубликуваните не се връщат от заявката (shortLinkWhere) → finder дава null.
  assert.equal(await resolveShortLink("nyama", finder({}).find), null);
  const broken = async () => {
    throw new Error("няма база");
  };
  assert.equal(await resolveShortLink("apteka", broken), null);
});

test("resolveShortLink: целта от базата минава през safeInternalTarget", async () => {
  const f = finder({
    zlo: "//evil.com",
    js: "javascript:alert(1)",
    bs: "/\\evil.com",
    dot: "/.//evil.com",
    pom: "/pomoshti",
  });
  assert.deepEqual(await resolveShortLink("zlo", f.find), { code: "zlo", target: "/" });
  assert.deepEqual(await resolveShortLink("js", f.find), { code: "js", target: "/" });
  assert.deepEqual(await resolveShortLink("bs", f.find), { code: "bs", target: "/" });
  assert.deepEqual(await resolveShortLink("dot", f.find), { code: "dot", target: "/" });
  const ok = await resolveShortLink(" POM ", f.find);
  assert.deepEqual(ok, { code: "pom", target: "/pomoshti" });
  assert.equal(f.calls.at(-1), "pom", "кодът се търси нормализиран");
  assert.equal(qrRedirectLocation(ok!.target, ok!.code), "/pomoshti?s=qr-pom");
  for (const code of ["zlo", "js", "bs", "dot"]) {
    const l = await resolveShortLink(code, f.find);
    const loc = qrRedirectLocation(l!.target, l!.code);
    assert.equal(loc, `/?s=qr-${code}`);
    assert.ok(!loc.includes("evil"), loc);
  }
});

test("shortLinkWhere търси само публикуваните, без значение от главни букви", () => {
  assert.deepEqual(shortLinkWhere("apteka"), {
    code: { equals: "apteka", mode: "insensitive" },
    published: true,
  });
});

test("пренасочването: относителен Location, no-store, noindex", () => {
  const h = shortLinkRedirectHeaders("/pomoshti?s=qr-pom");
  assert.equal(h.Location, "/pomoshti?s=qr-pom");
  assert.equal(h["Cache-Control"], "no-store");
  assert.match(h["X-Robots-Tag"], /noindex/);
});

test("isHumanScan: ботове, визуализатори и предварително зареждане не се броят", () => {
  const hdr = (h: Record<string, string>) => (n: string) => h[n.toLowerCase()] ?? null;
  const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36";
  assert.equal(isHumanScan(hdr({ "user-agent": UA })), true);
  assert.equal(isHumanScan(hdr({})), false, "без User-Agent");
  assert.equal(isHumanScan(hdr({ "user-agent": "facebookexternalhit/1.1" })), false);
  assert.equal(isHumanScan(hdr({ "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" })), false);
  assert.equal(isHumanScan(hdr({ "user-agent": UA, purpose: "prefetch" })), false);
  assert.equal(isHumanScan(hdr({ "user-agent": UA, "sec-purpose": "prefetch;prerender" })), false);
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
