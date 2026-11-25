import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFreshness,
  freshnessText,
  monthsAgo,
  daysAgo,
  type FreshnessInput,
} from "@/lib/freshness-core";

const NOW = new Date("2026-10-23T08:00:00Z");

function healthy(): FreshnessInput {
  return {
    now: NOW,
    news: {
      imported: 3,
      published: 2,
      lastImportedAt: daysAgo(NOW, 1),
      lastPublishedAt: daysAgo(NOW, 1),
      pending: 1,
      oldestPendingAt: daysAgo(NOW, 1),
    },
    pharmacy: { today: 1, lastDate: NOW },
    scams: { total: 4, lastChangeAt: daysAgo(NOW, 20) },
    outages: { total: 2, lastChangeAt: daysAgo(NOW, 5) },
    services: { total: 23, neverVerified: 0, stale: 0, examples: [] },
  };
}

const codes = (i: FreshnessInput) => evaluateFreshness(i).problems.map((p) => p.code);

test("всичко свежо → ok:true без проблеми", () => {
  const r = evaluateFreshness(healthy());
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
  assert.equal(r.checkedAt, NOW.toISOString());
});

test("новини: 0 внесени и 0 публикувани за 7 дни → два отделни проблема", () => {
  const i = healthy();
  i.news = { ...i.news, imported: 0, published: 0, lastImportedAt: new Date("2026-06-20T10:00:00Z") };
  const r = evaluateFreshness(i);
  assert.equal(r.ok, false);
  assert.deepEqual(r.problems.map((p) => p.code), ["news_not_imported", "news_not_published"]);
  assert.match(r.problems[0].message, /20 юни 2026/);
});

test("новини: чакат одобрение повече от 3 дни → проблем; по-малко → не", () => {
  const i = healthy();
  i.news = { ...i.news, pending: 5, oldestPendingAt: daysAgo(NOW, 4) };
  assert.deepEqual(codes(i), ["news_waiting_approval"]);
  i.news = { ...i.news, oldestPendingAt: daysAgo(NOW, 2) };
  assert.deepEqual(codes(i), []);
});

test("дежурна аптека: няма за днес → спешен проблем", () => {
  const i = healthy();
  i.pharmacy = { today: 0, lastDate: null };
  const r = evaluateFreshness(i);
  assert.equal(r.problems[0].code, "pharmacy_today_missing");
  assert.equal(r.problems[0].severity, "critical");
  assert.match(r.problems[0].message, /никога/);
});

test("измами и прекъсвания: без промяна над прага (или никога) → проблем", () => {
  const i = healthy();
  i.scams = { total: 4, lastChangeAt: daysAgo(NOW, 91) };
  i.outages = { total: 0, lastChangeAt: null };
  assert.deepEqual(codes(i), ["scams_stale", "outages_stale"]);
  i.scams = { total: 4, lastChangeAt: daysAgo(NOW, 89) };
  i.outages = { total: 1, lastChangeAt: daysAgo(NOW, 29) };
  assert.deepEqual(codes(i), []);
});

test("услуги: непроверени или проверени преди >6 месеца → проблем с примери", () => {
  const i = healthy();
  i.services = { total: 23, neverVerified: 20, stale: 1, examples: ["Кметство", "Поща"] };
  const r = evaluateFreshness(i);
  assert.deepEqual(r.problems.map((p) => p.code), ["services_unverified"]);
  assert.match(r.problems[0].message, /21 от 23/);
  assert.match(r.problems[0].message, /\(20 никога\)/);
  assert.match(r.problems[0].message, /Кметство, Поща…/);
});

test("monthsAgo: календарни месеци, краят на месеца не прелива", () => {
  assert.equal(monthsAgo(new Date("2026-10-23T08:00:00Z"), 6).toISOString(), "2026-04-23T08:00:00.000Z");
  assert.equal(monthsAgo(new Date("2026-08-31T00:00:00Z"), 6).toISOString(), "2026-02-28T00:00:00.000Z");
  assert.equal(monthsAgo(new Date("2026-03-31T00:00:00Z"), 1).toISOString(), "2026-02-28T00:00:00.000Z");
});

test("freshnessText: кратко обобщение за лог/имейл", () => {
  assert.match(freshnessText(evaluateFreshness(healthy())), /всичко е наред/);
  const i = healthy();
  i.pharmacy = { today: 0, lastDate: null };
  const t = freshnessText(evaluateFreshness(i));
  assert.match(t, /^Свежест: 1 проблема/);
  assert.match(t, /\[СПЕШНО\] Няма въведена дежурна аптека/);
});
