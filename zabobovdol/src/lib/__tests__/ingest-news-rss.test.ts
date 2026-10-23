import test from "node:test";
import assert from "node:assert/strict";
import { buildNewsRss, escapeXml, newsDate, RSS_LIMIT, type FeedPost } from "@/lib/ingest-news-rss";

const SITE = { siteUrl: "https://zabobovdol.carbonstealth.eu", siteName: "За Бобов дол" };

function post(i: number, extra: Partial<FeedPost> = {}): FeedPost {
  return {
    slug: `novina-${i}`,
    title: `Новина ${i}`,
    excerpt: `Резюме ${i}`,
    source: "Община Бобов дол",
    sourceDate: null,
    publishedAt: new Date(Date.UTC(2026, 9, 1 + (i % 20), 9)),
    createdAt: new Date(Date.UTC(2026, 8, 1)),
    ...extra,
  };
}

test("escapeXml екранира петте знака и маха забранените управляващи знаци", () => {
  assert.equal(escapeXml(`a&b<c>"d"'e'`), "a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
  assert.equal(escapeXml("x\u0000y\u0008z\u000Bw"), "xyzw");
  assert.equal(escapeXml("ред\tнов\nред"), "ред\tнов\nред");
});

test("newsDate: от източника → публикувана → създадена", () => {
  const c = new Date("2026-01-01T00:00:00Z");
  const p = new Date("2026-02-01T00:00:00Z");
  const s = new Date("2026-03-01T00:00:00Z");
  assert.equal(newsDate({ sourceDate: s, publishedAt: p, createdAt: c }), s);
  assert.equal(newsDate({ sourceDate: null, publishedAt: p, createdAt: c }), p);
  assert.equal(newsDate({ sourceDate: null, publishedAt: null, createdAt: c }), c);
});

test("RSS 2.0: канал, връзки с ?s=rss, guid без маркер, екранирани стойности", () => {
  const xml = buildNewsRss(
    [post(1, { title: `Ток & вода <спират> „утре“`, excerpt: "**Важно**: [виж](https://x.bg) тук" })],
    SITE,
  );
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0"/);
  assert.match(xml, /<atom:link href="https:\/\/zabobovdol\.carbonstealth\.eu\/novini\/rss\.xml" rel="self"/);
  assert.match(xml, /<title>Ток &amp; вода &lt;спират&gt; „утре“<\/title>/);
  assert.match(xml, /<link>https:\/\/zabobovdol\.carbonstealth\.eu\/novini\/novina-1\?s=rss<\/link>/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/zabobovdol\.carbonstealth\.eu\/novini\/novina-1<\/guid>/);
  assert.match(xml, /<description>Важно : виж тук<\/description>/);
  assert.match(xml, /<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/);
  assert.match(xml, /<category>Община Бобов дол<\/category>/);
  assert.ok(!/<[^>]*<|&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml.replace(/<\?xml[^>]*\?>/, "")), "сурово & или < в стойност");
});

test("RSS: най-много последните 30; празен списък пак е валиден канал", () => {
  const many = Array.from({ length: 45 }, (_, i) => post(i));
  const xml = buildNewsRss(many, SITE);
  assert.equal((xml.match(/<item>/g) ?? []).length, RSS_LIMIT);
  const empty = buildNewsRss([], { ...SITE, now: new Date("2026-10-23T08:00:00Z") });
  assert.match(empty, /<channel>[\s\S]*<lastBuildDate>Fri, 23 Oct 2026 08:00:00 GMT<\/lastBuildDate>[\s\S]*<\/channel>/);
  assert.equal((empty.match(/<item>/g) ?? []).length, 0);
});
