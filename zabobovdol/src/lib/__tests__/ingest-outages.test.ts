import test from "node:test";
import assert from "node:assert/strict";
import {
  BOBOV_DOL_SETTLEMENTS,
  ERM_MUNICIPALITY,
  bearerMatches,
  buildOutageDrafts,
  draftsFormatProblem,
  findSettlement,
  formatOutageTime,
  formatSofiaInstant,
  isIngestEnabled,
  isStale,
  nextStatus,
  parseErmDateTime,
  parseErmResponse,
  parseStatus,
  shouldAlert,
  sofiaWallNow,
} from "@/lib/ingest-outages-core";
import { buildOutagesRss, escapeXml } from "@/lib/ingest-outages-rss";

// --- Фикстури ---------------------------------------------------------------
//
// REAL_SFO26: записи 1 и 2 от РЕАЛЕН отговор на
//   POST https://info.ermzapad.bg/webint/vok/avplan.php  action=draw&gm_obstina=SFO26
// взет на 23.10.2026 (община Костинброд — единствената с прекъсване в момента
// в Софийска област). Стойностите са дословни; сървърът връща BOM + CRLF отпред
// и много интервали преди последната скоба — пазим и тях.
const REAL_RECORDS_SFO26 =
  '{"1":{"lat":"42.7947163610702","lon":"23.2090319163416","typedist":"\\u043d\\u0435\\u043f\\u043b\\u0430\\u043d\\u0438\\u0440\\u0430\\u043d\\u043e","type_event":"1","begin_event":"23.10.2026 22:14","end_event":"24.10.2026 00:00","city_name":"\\u041a\\u041e\\u0421\\u0422\\u0418\\u041d\\u0411\\u0420\\u041e\\u0414","points":{"1":{"lat":"42.79281","lon":"23.21061"},"cnt":1},"cities":"\\u041a\\u041e\\u0421\\u0422\\u0418\\u041d\\u0411\\u0420\\u041e\\u0414","grid_id":"","ceo":"SO_1569"},' +
  '"2":{"lat":"42.7842467221262","lon":"23.2047210275619","typedist":"\\u043d\\u0435\\u043f\\u043b\\u0430\\u043d\\u0438\\u0440\\u0430\\u043d\\u043e","type_event":"1","begin_event":"23.10.2026 22:14","end_event":"24.10.2026 00:00","city_name":"\\u041a\\u041e\\u0421\\u0422\\u0418\\u041d\\u0411\\u0420\\u041e\\u0414","points":{"1":{"lat":"42.784233","lon":"23.204779"},"2":{"lat":"42.78427","lon":"23.204751"},"3":{"lat":"42.799014","lon":"23.221966"},"4":{"lat":"42.799717","lon":"23.221966"},"5":{"lat":"42.834938","lon":"23.193319"},"cnt":5},"cities":"","grid_id":"","ceo":"SO_1568"}';
const REAL_SFO26 = "﻿\r\n" + REAL_RECORDS_SFO26 + " ".repeat(40) + "}";

// REAL_KNL04_EMPTY: РЕАЛНИЯТ отговор за gm_obstina=KNL04 (Бобов дол) на
// 23.10.2026, когато в общината няма прекъсвания: {"1":{"cities":""}} + 10461
// интервала + „}“.
const REAL_KNL04_EMPTY = "﻿\r\n" + '{"1":{"cities":""}' + " ".repeat(10461) + "}";

// Производна фикстура: СЪЩАТА структура като реалния отговор, но населените
// места са от община Бобов дол (в момента там няма прекъсване, за да вземем
// реален пример). Два трафопоста в Бобов дол с едно и също начало + един в
// Голема Фуча (планирано).
function rec(o: { city: string; type: string; begin: string; end: string; ceo: string }) {
  return {
    lat: "42.35",
    lon: "23.0",
    typedist: o.type,
    type_event: "1",
    begin_event: o.begin,
    end_event: o.end,
    city_name: o.city,
    points: { "1": { lat: "42.35", lon: "23.0" }, cnt: 1 },
    cities: "",
    grid_id: "",
    ceo: o.ceo,
  };
}
const DERIVED_KNL04 =
  "﻿\r\n" +
  JSON.stringify({
    "1": rec({ city: "БОБОВ ДОЛ", type: "непланирано", begin: "23.10.2026 22:14", end: "24.10.2026 00:00", ceo: "KN_0101" }),
    "2": rec({ city: "БОБОВ ДОЛ", type: "непланирано", begin: "23.10.2026 22:14", end: "24.10.2026 02:30", ceo: "KN_0102" }),
    "3": rec({ city: "ГОЛЕМА ФУЧА", type: "планирано", begin: "27.10.2026 09:00", end: "27.10.2026 16:00", ceo: "KN_0201" }),
    "4": rec({ city: "КОСТИНБРОД", type: "планирано", begin: "27.10.2026 09:00", end: "27.10.2026 16:00", ceo: "SO_1" }),
  }).slice(0, -1) +
  " ".repeat(30) +
  "}";

// --- Разпознаване на отговора ------------------------------------------------

test("реалният отговор на ЕРМ (BOM, CRLF, интервали) се разпознава като събития", () => {
  const r = parseErmResponse(REAL_SFO26);
  assert.equal(r.kind, "events");
  if (r.kind !== "events") return;
  assert.equal(r.records.length, 2);
  assert.equal(r.records[0].typedist, "непланирано");
  assert.equal(r.records[0].city_name, "КОСТИНБРОД");
  assert.equal(r.records[0].begin_event, "23.10.2026 22:14");
  assert.equal(r.records[1].ceo, "SO_1568");
});

test("реалният празен отговор за Бобов дол = „няма прекъсвания“, не грешка", () => {
  assert.deepEqual(parseErmResponse(REAL_KNL04_EMPTY), { kind: "empty" });
});

test("„tomuch“ = ограничение на заявките", () => {
  assert.equal(parseErmResponse("tomuch").kind, "rate_limited");
  assert.equal(parseErmResponse("﻿\r\ntomuch  ").kind, "rate_limited");
});

test("непознат формат → unrecognized (нула записа, нищо не се трие)", () => {
  const waf =
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"><html><head><title>Error</title></head><body><H2>Error</H2>This page can\'t be displayed.</body></html>';
  for (const bad of [
    "",
    "   ",
    waf,
    "[]",
    "null",
    '{"a":{"typedist":"планирано"}}',
    JSON.stringify([rec({ city: "БОБОВ ДОЛ", type: "планирано", begin: "23.10.2026 10:00", end: "", ceo: "x" })]),
    // липсва begin_event
    JSON.stringify({ "1": { typedist: "планирано", end_event: "", city_name: "БОБОВ ДОЛ" } }),
    // невалидна дата
    JSON.stringify({ "1": rec({ city: "БОБОВ ДОЛ", type: "планирано", begin: "32.13.2026 25:00", end: "", ceo: "x" }) }),
    // смес от празен маркер и събитие
    JSON.stringify({ "1": { cities: "" }, "2": rec({ city: "БОБОВ ДОЛ", type: "планирано", begin: "23.10.2026 10:00", end: "", ceo: "x" }) }),
  ]) {
    const r = parseErmResponse(bad);
    assert.equal(r.kind, "unrecognized", `трябва да е unrecognized: ${bad.slice(0, 60)}`);
  }
});

test("твърде голям отговор се отказва", () => {
  const huge = "{" + '"1":{"cities":""}' + " ".repeat(3_000_000) + "}";
  assert.equal(parseErmResponse(huge).kind, "unrecognized");
});

// --- Дати: „стенно“ време на София, записано в UTC полетата ------------------
// (същата конвенция като админ панела: сървърът е TZ=UTC и datetime-local се
// пази като UTC; страниците показват UTC полетата.)

test("дата от ЕРМ → стенно време на София в UTC полета", () => {
  assert.equal(parseErmDateTime("23.10.2026 22:14")?.toISOString(), "2026-10-23T22:14:00.000Z");
  assert.equal(parseErmDateTime("24.10.2026 00:00:00")?.toISOString(), "2026-10-24T00:00:00.000Z");
  assert.equal(parseErmDateTime(" 1.2.2027 7:05 ")?.toISOString(), "2027-02-01T07:05:00.000Z");
  assert.equal(parseErmDateTime(""), null);
  assert.equal(parseErmDateTime("31.02.2026 10:00"), null);
  assert.equal(parseErmDateTime("2026-10-23 10:00"), null);
  assert.equal(parseErmDateTime("23.10.2026"), null);
});

test("„сега“ по стенен часовник на София (лятно и зимно време)", () => {
  // 23.10.2026 е лятно време (до 25.10) → UTC+3
  assert.equal(sofiaWallNow(new Date("2026-10-23T19:00:00Z")).toISOString(), "2026-10-23T22:00:00.000Z");
  // януари → UTC+2
  assert.equal(sofiaWallNow(new Date("2026-01-05T08:00:00Z")).toISOString(), "2026-01-05T10:00:00.000Z");
});

// --- Населени места -----------------------------------------------------------

test("18-те населени места на община Бобов дол (ЕКАТТЕ, НСИ)", () => {
  assert.equal(ERM_MUNICIPALITY, "KNL04");
  assert.equal(BOBOV_DOL_SETTLEMENTS.length, 18);
  assert.equal(new Set(BOBOV_DOL_SETTLEMENTS.map((s) => s.ekatte)).size, 18);
  assert.equal(findSettlement("БОБОВ ДОЛ")?.ekatte, "04501");
  assert.equal(findSettlement("гр. Бобов дол")?.label, "гр. Бобов дол");
  assert.equal(findSettlement(" с.  голема   фуча ")?.label, "с. Голема Фуча");
  assert.equal(findSettlement("МАЛА ФУЧА")?.ekatte, "46262");
  assert.equal(findSettlement("ГОЛЯМ ВЪРБОВНИК")?.ekatte, "15457");
  assert.equal(findSettlement("КОСТИНБРОД"), null);
  assert.equal(findSettlement("БОБОВ"), null);
  assert.equal(findSettlement(""), null);
});

// --- От записи към прекъсвания ---------------------------------------------

test("реалният отговор от Костинброд не дава нито едно прекъсване за Бобов дол", () => {
  const r = parseErmResponse(REAL_SFO26);
  assert.equal(r.kind, "events");
  if (r.kind !== "events") return;
  const out = buildOutageDrafts(r.records);
  assert.equal(out.drafts.length, 0);
  assert.equal(out.otherArea, 2);
  assert.deepEqual(out.otherAreaNames, ["КОСТИНБРОД"]);
});

test("групиране по населено място + начало; най-късен край; само общината", () => {
  const r = parseErmResponse(DERIVED_KNL04);
  assert.equal(r.kind, "events");
  if (r.kind !== "events") return;
  const { drafts, otherArea } = buildOutageDrafts(r.records);
  assert.equal(otherArea, 1);
  assert.equal(drafts.length, 2);

  const bd = drafts.find((d) => d.area === "гр. Бобов дол");
  assert.ok(bd);
  assert.equal(bd.planned, false);
  assert.equal(bd.utility, "ELECTRICITY");
  assert.equal(bd.stations, 2);
  assert.equal(bd.startAt.toISOString(), "2026-10-23T22:14:00.000Z");
  assert.equal(bd.endAt?.toISOString(), "2026-10-24T02:30:00.000Z");
  assert.equal(bd.externalId, "erm:KNL04:04501:u:202610232214");
  assert.equal(bd.slug, "erm-04501-u-202610232214");
  assert.equal(bd.source, "ЕРМ Запад");
  assert.match(bd.sourceUrl, /^https:\/\/ermzapad\.bg\//);

  const gf = drafts.find((d) => d.area === "с. Голема Фуча");
  assert.ok(gf);
  assert.equal(gf.planned, true);
  assert.equal(gf.externalId, "erm:KNL04:15446:p:202610270900");
});

test("ключът за дедупликация е стабилен: нов край не прави нов запис", () => {
  const a = parseErmResponse(DERIVED_KNL04);
  const later = DERIVED_KNL04.replace("24.10.2026 02:30", "24.10.2026 05:00");
  const b = parseErmResponse(later);
  assert.ok(a.kind === "events" && b.kind === "events");
  if (a.kind !== "events" || b.kind !== "events") return;
  const ida = buildOutageDrafts(a.records).drafts.map((d) => d.externalId).sort();
  const idb = buildOutageDrafts(b.records).drafts.map((d) => d.externalId).sort();
  assert.deepEqual(ida, idb);
  const endB = buildOutageDrafts(b.records).drafts.find((d) => d.area === "гр. Бобов дол")?.endAt;
  assert.equal(endB?.toISOString(), "2026-10-24T05:00:00.000Z");
});

test("непознат тип събитие се пропуска (и се брои), не се гадае", () => {
  const txt = JSON.stringify({
    "1": rec({ city: "БОБОВ ДОЛ", type: "БНП", begin: "23.10.2026 10:00", end: "", ceo: "x" }),
  });
  const r = parseErmResponse(txt);
  assert.equal(r.kind, "events");
  if (r.kind !== "events") return;
  const out = buildOutageDrafts(r.records);
  assert.equal(out.drafts.length, 0);
  assert.equal(out.unknownType, 1);
});

test("празен край → endAt null", () => {
  const txt = JSON.stringify({
    "1": rec({ city: "ШАТРОВО", type: "непланирано", begin: "23.10.2026 10:00", end: "", ceo: "x" }),
  });
  const r = parseErmResponse(txt);
  assert.equal(r.kind, "events");
  if (r.kind !== "events") return;
  const [d] = buildOutageDrafts(r.records).drafts;
  assert.equal(d.endAt, null);
  assert.equal(d.area, "с. Шатрово");
});

test("„гр.“/„с.“ без интервал след точката пак се разпознава", () => {
  assert.equal(findSettlement("ГР.БОБОВ ДОЛ")?.ekatte, "04501");
  assert.equal(findSettlement("с.Голема Фуча")?.label, "с. Голема Фуча");
  assert.equal(findSettlement("СЕЛО ШАТРОВО")?.label, "с. Шатрово");
});

// Смяна на формата при ЕРМ (друг етикет на типа или друго изписване на мястото)
// НЕ бива да затваря текущите прекъсвания като „възстановени“: заявката е само
// за общината, затова непознат тип/място = непознат формат → вносът спира.
test("непознат тип или място при заявка за общината → грешка, нищо не се затваря", () => {
  const changed = (o: { city?: string; type?: string }) => {
    const r = parseErmResponse(
      JSON.stringify({
        "1": rec({ city: "БОБОВ ДОЛ", type: "непланирано", begin: "23.10.2026 10:00", end: "", ceo: "a" }),
        "2": rec({
          city: o.city ?? "ГОЛЕМА ФУЧА",
          type: o.type ?? "планирано",
          begin: "27.10.2026 09:00",
          end: "27.10.2026 16:00",
          ceo: "b",
        }),
      }),
    );
    assert.equal(r.kind, "events");
    if (r.kind !== "events") throw new Error("очаквани събития");
    return { found: r.records.length, built: buildOutageDrafts(r.records) };
  };

  // Нов етикет на типа: записът не става чернова → без проверката щеше да
  // липсва от „видени“ и съществуващото прекъсване щеше да се затвори.
  const t = changed({ type: "Планирано прекъсване" });
  assert.equal(t.built.unknownType, 1);
  const tp = draftsFormatProblem(t.found, t.built);
  assert.ok(tp);
  assert.match(tp, /непознат тип/);

  // Място, което не е от общината (или ново изписване, което не познаваме).
  const a = changed({ city: "ГР БОБОВДОЛ" });
  assert.equal(a.built.otherArea, 1);
  const ap = draftsFormatProblem(a.found, a.built);
  assert.ok(ap);
  assert.match(ap, /непознато място \(ГР БОБОВДОЛ\)/);

  // Производната фикстура съдържа запис от Костинброд → също спира.
  const d = parseErmResponse(DERIVED_KNL04);
  if (d.kind !== "events") throw new Error("очаквани събития");
  assert.ok(draftsFormatProblem(d.records.length, buildOutageDrafts(d.records)));

  // Всичко познато → продължава нормално.
  const ok = changed({});
  assert.equal(ok.built.drafts.length, 2);
  assert.equal(draftsFormatProblem(ok.found, ok.built), null);
  // Празен отговор („няма прекъсвания“) не е проблем.
  assert.equal(draftsFormatProblem(0, buildOutageDrafts([])), null);
});

// --- Флаг и достъп ------------------------------------------------------------

test("вносът е изключен, освен при ERM_INGEST_ENABLED=1", () => {
  assert.equal(isIngestEnabled("1"), true);
  for (const v of [undefined, "", "0", "true", "yes", " 1", "1 "]) assert.equal(isIngestEnabled(v), false);
});

test("Bearer токен: точно съвпадение, постоянно време, без токен = отказ", () => {
  const secret = "x".repeat(40);
  assert.equal(bearerMatches(`Bearer ${secret}`, secret), true);
  assert.equal(bearerMatches(`bearer ${secret}`, secret), true);
  assert.equal(bearerMatches(`Bearer ${secret}x`, secret), false);
  assert.equal(bearerMatches(`Bearer ${"y".repeat(40)}`, secret), false);
  assert.equal(bearerMatches(secret, secret), false);
  assert.equal(bearerMatches(null, secret), false);
  assert.equal(bearerMatches("Bearer ", ""), false);
  assert.equal(bearerMatches(`Bearer ${secret}`, undefined), false);
  assert.equal(bearerMatches(`Bearer ${secret}`, ""), false);
});

// --- Състояние на вноса (за „Последна проверка“ и тревога) --------------------

test("състояние: успех нулира поредицата, две грешки подред → тревога веднъж", () => {
  const t0 = new Date("2026-10-23T10:00:00Z");
  let s = parseStatus(null);
  assert.equal(s.failStreak, 0);
  assert.equal(s.lastOkAt, null);

  s = nextStatus(s, { ok: true, counts: { found: 3, created: 1, updated: 0, closed: 0 } }, t0);
  assert.equal(s.lastOkAt, t0.toISOString());
  assert.equal(s.failStreak, 0);

  const t1 = new Date("2026-10-23T12:00:00Z");
  s = nextStatus(s, { ok: false, error: "HTTP 503" }, t1);
  assert.equal(s.failStreak, 1);
  assert.equal(shouldAlert(s), false);
  assert.equal(s.lastOkAt, t0.toISOString());

  s = nextStatus(s, { ok: false, error: "HTTP 503" }, new Date("2026-10-23T14:00:00Z"));
  assert.equal(s.failStreak, 2);
  assert.equal(shouldAlert(s), true);

  s = nextStatus(s, { ok: false, error: "HTTP 503" }, new Date("2026-10-23T16:00:00Z"));
  assert.equal(shouldAlert(s), false);

  // пренос през JSON (пази се в SiteSetting)
  const back = parseStatus(JSON.stringify(s));
  assert.deepEqual(back, s);
  assert.deepEqual(parseStatus("{не е json"), parseStatus(null));
  assert.deepEqual(parseStatus('{"failStreak":"много"}'), parseStatus(null));
});

test("остаряла проверка: над прага или никога", () => {
  const now = new Date("2026-10-23T20:00:00Z");
  assert.equal(isStale(null, now), true);
  assert.equal(isStale("2026-10-23T19:00:00.000Z", now), false);
  assert.equal(isStale("2026-10-23T13:00:00.000Z", now), true);
  assert.equal(isStale("не е дата", now), true);
});

// --- RSS ----------------------------------------------------------------------

test("escapeXml екранира всички пет знака и маха забранени управляващи", () => {
  assert.equal(escapeXml(`<a href="x">Том & 'Джери'</a>`), "&lt;a href=&quot;x&quot;&gt;Том &amp; &apos;Джери&apos;&lt;/a&gt;");
  assert.equal(escapeXml("a\u0000b\u0008c\u000Bd"), "abcd");
  assert.equal(escapeXml("ред\nнов\tтаб"), "ред\nнов\tтаб");
});

test("RSS: валидна структура, екранирано съдържание, ?s=rss в линковете", () => {
  const xml = buildOutagesRss(
    [
      {
        slug: "erm-04501-u-202610232214",
        utility: "ELECTRICITY",
        area: "гр. Бобов дол & <script>alert(1)</script>",
        startAt: new Date("2026-10-23T22:14:00Z"),
        endAt: new Date("2026-10-24T02:30:00Z"),
        planned: false,
        note: "Подробности ]]> и още",
        source: "ЕРМ Запад",
        sourceUrl: "https://ermzapad.bg/bg/za-klienta/prekusvania/",
        updatedAt: new Date("2026-10-23T19:20:00Z"),
      },
      {
        slug: "voda-1",
        utility: "WATER",
        area: "",
        startAt: null,
        endAt: null,
        planned: true,
        note: "",
        source: "",
        sourceUrl: "",
        updatedAt: new Date("2026-10-22T08:00:00Z"),
      },
    ],
    { siteUrl: "https://zabobovdol.carbonstealth.eu", siteName: "За Бобов дол", now: new Date("2026-10-23T19:30:00Z") },
  );
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.match(xml, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(xml, /<atom:link href="https:\/\/zabobovdol\.carbonstealth\.eu\/prekysvaniya\/rss\.xml" rel="self" type="application\/rss\+xml"\s*\/>/);
  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
  assert.equal((xml.match(/<\/item>/g) ?? []).length, 2);
  assert.match(xml, /<link>https:\/\/zabobovdol\.carbonstealth\.eu\/prekysvaniya\?s=rss<\/link>/);
  assert.match(xml, /<link>https:\/\/zabobovdol\.carbonstealth\.eu\/prekysvaniya\?s=rss#erm-04501-u-202610232214<\/link>/);
  assert.match(xml, /<guid isPermaLink="false">zabobovdol-outage-erm-04501-u-202610232214<\/guid>/);
  assert.match(xml, /<pubDate>Fri, 23 Oct 2026 19:20:00 GMT<\/pubDate>/);
  assert.match(xml, /<lastBuildDate>Fri, 23 Oct 2026 19:30:00 GMT<\/lastBuildDate>/);
  // нищо неекранирано
  assert.ok(!xml.includes("<script>"));
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml), "голо & в XML");
  assert.ok(!xml.includes("]]>"));
  // човешки текст на прост език
  assert.match(xml, /Спира токът \(авария\)/);
  assert.match(xml, /Спира водата \(планово\)/);
  assert.match(xml, /От 23 октомври в 22:14 до 24 октомври в 02:30\./);
  assert.match(xml, /Източник: ЕРМ Запад/);
  assert.ok(!xml.includes("<description></description>"));
});

test("изписване на часовете: стенно време и истински момент", () => {
  assert.equal(formatOutageTime(new Date("2026-10-23T22:14:00Z")), "23 октомври в 22:14");
  assert.equal(formatOutageTime(null), "");
  // 19:20Z на 23.10.2026 (лятно време) = 22:20 в София
  assert.equal(formatSofiaInstant(new Date("2026-10-23T19:20:00Z")), "23 октомври в 22:20");
  assert.equal(formatSofiaInstant(new Date("2026-01-05T08:05:00Z")), "5 януари в 10:05");
});
