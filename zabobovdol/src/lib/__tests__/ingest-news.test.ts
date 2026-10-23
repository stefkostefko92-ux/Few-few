import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseHtmlListing,
  parseListing,
  resolveLinkPattern,
  isNewsLink,
  canonicalLink,
  DEFAULT_NEWS_URL,
} from "@/lib/ingest-news-parse";

// Фикстура: менюто е с ИСТИНСКИТЕ адреси, внесени погрешно на живо; списъкът с
// новини е синтетичен (порталът на общината не отговаряше) — виж коментара в нея.
const HTML = readFileSync(
  join(process.cwd(), "src/lib/__tests__/fixtures/ingest-news-egov.html"),
  "utf8",
);
const BASE = DEFAULT_NEWS_URL;
const NOW = new Date("2026-10-23T08:00:00Z");
const opts = { linkPattern: resolveLinkPattern(undefined), now: NOW };
const ymd = (d?: Date) => (d ? d.toISOString().slice(0, 10) : "");

test("HTML списък: внасят се САМО новините, не страниците от менюто", () => {
  const items = parseHtmlListing(HTML, BASE, opts);
  assert.deepEqual(
    items.map((i) => i.link),
    [
      "https://bobovdol.egov.bg/wps/portal/municipality-bobovdol/actual/news/primer-remont-na-ulichnoto-osvetlenie",
      "https://bobovdol.egov.bg/wps/portal/municipality-bobovdol/actual/news/primer-zasedanie-na-obshtinskiya-savet",
      "https://bobovdol.egov.bg/wps/portal/municipality-bobovdol/actual/news/primer-grafik-za-smetosabirane",
    ],
  );
  for (const it of items) {
    assert.ok(!/\/(municipality|administration)\//.test(it.link.split("municipality-bobovdol")[1]), it.link);
  }
});

test("HTML списък: заглавие, дата (задължителна) и кратко резюме", () => {
  const items = parseHtmlListing(HTML, BASE, opts);
  assert.equal(items[0].title, "Пример: ремонт на уличното осветление в централната част");
  assert.equal(items[1].title, "Пример: заседание на Общинския съвет & дневен ред");
  assert.deepEqual(items.map((i) => ymd(i.date)), ["2026-10-21", "2026-10-16", "2026-10-09"]);
  assert.match(items[0].summary, /Примерно резюме на първата новина/);
  // новината без дата не влиза
  assert.ok(!items.some((i) => i.link.includes("primer-novina-bez-data")));
});

test("HTML списък: страниране (!ut/p/…), самият списък и чужди домейни не са новини", () => {
  const links = parseHtmlListing(HTML, BASE, opts).map((i) => i.link);
  assert.ok(!links.some((l) => l.includes("!ut/p/")));
  assert.ok(!links.some((l) => /\/actual\/news\/?$/.test(l)));
  assert.ok(!links.some((l) => new URL(l).host !== "bobovdol.egov.bg"));
});

test("fail closed: шаблон без съвпадения → нито един запис + отчет защо", () => {
  const r = parseListing(HTML, BASE, { ...opts, linkPattern: resolveLinkPattern("/nyama-takav-razdel/") });
  assert.equal(r.items.length, 0);
  assert.equal(r.matched, 0);
  assert.ok(r.anchors > 20);
  // само менюто (без списъка с новини) → нищо
  const menuOnly = HTML.replace(/<main[\s\S]*<\/main>/, "");
  assert.equal(parseHtmlListing(menuOnly, BASE, opts).length, 0);
});

test("отчетът брои съвпаденията без дата", () => {
  const r = parseListing(HTML, BASE, opts);
  assert.equal(r.kind, "html");
  assert.equal(r.items.length, 3);
  assert.equal(r.withoutDate, 1);
});

test("дата СЛЕД заглавието: всяка новина взима своята, не тази на предишната", () => {
  const row = (slug: string, d: string) =>
    `<li><a href="/wps/portal/municipality-bobovdol/actual/news/${slug}">Пример: новина ${slug} за проверка</a><span>${d}</span></li>`;
  const html = `<ul>${row("a", "20.10.2026")}${row("b", "15.10.2026")}${row("c", "10.10.2026")}</ul>`;
  const items = parseHtmlListing(html, BASE, opts);
  assert.deepEqual(
    items.map((i) => [i.link.split("/").pop(), ymd(i.date)]),
    [
      ["a", "2026-10-20"],
      ["b", "2026-10-15"],
      ["c", "2026-10-10"],
    ],
  );
});

test("датата: дд.мм.гггг, с име на месеца; невалидна или далеч в бъдещето → няма дата", () => {
  const row = (date: string) =>
    `<div>${date}</div><a href="/wps/portal/municipality-bobovdol/actual/news/x-y">Пример: новина с дата за проверка</a>`;
  const one = (date: string) => parseHtmlListing(row(date), BASE, opts)[0];
  assert.equal(ymd(one("05.03.2026")?.date), "2026-03-05");
  assert.equal(ymd(one("1 декември 2025 г.")?.date), "2025-12-01");
  assert.equal(one("31.02.2026"), undefined);
  assert.equal(one("01.01.2030"), undefined);
  assert.equal(one("без дата"), undefined);
});

test("шаблонът е конфигурируем; невалиден шаблон хвърля (вносът спира)", () => {
  const p = resolveLinkPattern(String.raw`/actual/military-report-office/[^/?#!]+`);
  const items = parseHtmlListing(
    `<span>17.10.2025</span><a href="/wps/portal/municipality-bobovdol/actual/military-report-office/obiava-zapoved">Обява за вакантни длъжности</a>`,
    BASE,
    { linkPattern: p, now: NOW },
  );
  assert.equal(items.length, 1);
  assert.throws(() => resolveLinkPattern("(незатворена"));
  assert.throws(() => resolveLinkPattern("a".repeat(400)));
});

test("isNewsLink и canonicalLink", () => {
  const p = resolveLinkPattern("");
  assert.ok(isNewsLink("https://bobovdol.egov.bg/wps/portal/municipality-bobovdol/actual/news/abc", p));
  assert.ok(!isNewsLink("https://bobovdol.egov.bg/wps/portal/municipality-bobovdol/actual/news", p));
  assert.ok(!isNewsLink("https://bobovdol.egov.bg/wps/portal/municipality-bobovdol/municipality/history", p));
  assert.ok(!isNewsLink("", p));
  assert.equal(
    canonicalLink("https://bobovdol.egov.bg/wps/portal/municipality-bobovdol/actual/news/abc/?utm_source=fb#top"),
    "https://bobovdol.egov.bg/wps/portal/municipality-bobovdol/actual/news/abc",
  );
});

test("RSS/Atom канал: записи без дата отпадат", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>Новина с дата</title><link>https://bobovdol.egov.bg/n/1</link><pubDate>Tue, 20 Oct 2026 09:00:00 GMT</pubDate><description><![CDATA[<p>Резюме</p>]]></description></item>
    <item><title>Новина без дата</title><link>https://bobovdol.egov.bg/n/2</link></item>
  </channel></rss>`;
  const r = parseListing(xml, BASE, opts);
  assert.equal(r.kind, "feed");
  assert.deepEqual(r.items.map((i) => i.title), ["Новина с дата"]);
  assert.equal(r.items[0].summary, "Резюме");
  assert.equal(r.withoutDate, 1);
});
