import { test } from "node:test";
import assert from "node:assert/strict";
import {
  outageNotice,
  postNotice,
  scamNotice,
  sendOnce,
  type Notice,
  type NotifySteps,
  type OutageRow,
} from "../push-notify-core";

const NOTICE: Notice = { topic: "news", payload: { title: "Т", body: "Б", url: "/novini/x?s=push" } };

// Малка „база“ в паметта: един ред с notifiedAt и атомарен updateMany, както
// го прави Prisma (where … notifiedAt: null → count 0/1).
function fakeRow(published = true) {
  const row = { published, notifiedAt: null as Date | null };
  const sent: Notice[] = [];
  const steps = (configured: boolean | "throw", notice: Notice | null = NOTICE): NotifySteps => ({
    load: async () => (row.published && !row.notifiedAt ? notice : null),
    claim: async (at) => {
      // Пауза, за да се преплетат паралелните извиквания.
      await new Promise((r) => setTimeout(r, 1));
      if (!row.published || row.notifiedAt) return false;
      row.notifiedAt = at;
      return true;
    },
    send: async (n) => {
      if (configured === "throw") throw new Error("мрежа");
      if (configured) sent.push(n);
      return { configured };
    },
    release: async (at) => {
      if (row.notifiedAt === at) row.notifiedAt = null;
    },
  });
  return { row, sent, steps };
}

test("sendOnce: публикуван и неизвестен → праща веднъж и отбелязва", async () => {
  const f = fakeRow();
  assert.equal(await sendOnce(f.steps(true)), "sent");
  assert.equal(f.sent.length, 1);
  assert.ok(f.row.notifiedAt instanceof Date);
});

test("sendOnce: второ извикване за вече известен запис → нищо", async () => {
  const f = fakeRow();
  await sendOnce(f.steps(true));
  assert.equal(await sendOnce(f.steps(true)), "skipped");
  assert.equal(f.sent.length, 1);
});

test("sendOnce: две ЕДНОВРЕМЕННИ извиквания → едно известие (атомарна заявка)", async () => {
  const f = fakeRow();
  const res = await Promise.all([sendOnce(f.steps(true)), sendOnce(f.steps(true)), sendOnce(f.steps(true))]);
  assert.equal(f.sent.length, 1);
  assert.deepEqual(res.slice().sort(), ["sent", "taken", "taken"]);
});

test("sendOnce: известията не са настроени → заявката се връща (notifiedAt = null)", async () => {
  const f = fakeRow();
  assert.equal(await sendOnce(f.steps(false)), "released");
  assert.equal(f.row.notifiedAt, null);
  // По-късно, когато VAPID е настроен, известието тръгва.
  assert.equal(await sendOnce(f.steps(true)), "sent");
  assert.equal(f.sent.length, 1);
});

test("sendOnce: изпращането хвърля → не хвърля навън и връща заявката", async () => {
  const f = fakeRow();
  assert.equal(await sendOnce(f.steps("throw")), "released");
  assert.equal(f.row.notifiedAt, null);
});

test("sendOnce: непубликуван запис или „нищо за пращане“ → без заявка и без известие", async () => {
  const hidden = fakeRow(false);
  assert.equal(await sendOnce(hidden.steps(true)), "skipped");
  assert.equal(hidden.row.notifiedAt, null);
  const none = fakeRow();
  assert.equal(await sendOnce(none.steps(true, null)), "skipped");
  assert.equal(none.row.notifiedAt, null);
  assert.equal(none.sent.length, 0);
});

test("sendOnce: връщането не пипа чужда (по-нова) заявка", async () => {
  const f = fakeRow();
  const steps = f.steps(false);
  const other = new Date(Date.now() + 5000);
  const s: NotifySteps = {
    ...steps,
    send: async () => {
      f.row.notifiedAt = other; // друг процес е заявил записа междувременно
      return { configured: false };
    },
  };
  await sendOnce(s);
  assert.equal(f.row.notifiedAt, other);
});

test("sendOnce: грешка при четене → не хвърля", async () => {
  const s: NotifySteps = {
    load: async () => {
      throw new Error("база");
    },
    claim: async () => true,
    send: async () => ({ configured: true }),
    release: async () => {},
  };
  assert.equal(await sendOnce(s), "skipped");
});

const outage = (o: Partial<OutageRow> = {}): OutageRow => ({
  published: true,
  notifiedAt: null,
  utility: "POWER",
  planned: true,
  area: "Голям Върбовник",
  startAt: null,
  endAt: null,
  ...o,
});

test("outageNotice: endAt е стенно време на София — свършило преди час не се известява", () => {
  // 2026-10-23 19:00 UTC = 22:00 в София (EEST, UTC+3).
  const now = new Date("2026-10-23T19:00:00Z");
  // Свършило в 21:00 стенно време (преди час) — в UTC полетата е 21:00Z,
  // т.е. „в бъдещето“ спрямо Date.now() (19:00Z). Правилно: минало.
  assert.equal(outageNotice(outage({ endAt: new Date("2026-10-23T21:00:00Z") }), now), null);
  // Свършва в 23:00 стенно време (след час) — още е актуално.
  assert.ok(outageNotice(outage({ endAt: new Date("2026-10-23T23:00:00Z") }), now));
  // Без край — актуално.
  assert.ok(outageNotice(outage(), now));
});

test("outageNotice: часът в текста е стенното време, без второ отместване", () => {
  const n = outageNotice(outage({ startAt: new Date("2026-10-24T09:30:00Z"), planned: false }), new Date("2026-10-23T19:00:00Z"));
  assert.ok(n);
  assert.equal(n.topic, "outages");
  assert.equal(n.payload.title, "Спира токът (авария)");
  assert.equal(n.payload.body, "Голям Върбовник от 24 октомври в 09:30");
  assert.equal(outageNotice(outage({ utility: "WATER" }))?.payload.title, "Спира водата");
});

test("notice: непубликуван или вече известен → null; темите и адресите са верни", () => {
  assert.equal(outageNotice(outage({ published: false })), null);
  assert.equal(outageNotice(outage({ notifiedAt: new Date() })), null);
  assert.equal(outageNotice(null), null);

  const scam = { published: true, notifiedAt: null, title: "Фалшив служител на ЕРМ", summary: "" };
  assert.equal(scamNotice({ ...scam, notifiedAt: new Date() }), null);
  assert.equal(scamNotice({ ...scam, published: false }), null);
  const s = scamNotice(scam);
  assert.equal(s?.topic, "scams");
  assert.equal(s?.payload.url, "/izmami?s=push");
  assert.match(s?.payload.body ?? "", /Нова измама/);

  const post = { published: true, notifiedAt: null, title: "Т".repeat(200), excerpt: "", source: "", slug: "abc" };
  assert.equal(postNotice({ ...post, notifiedAt: new Date() }), null);
  const p = postNotice(post);
  assert.equal(p?.topic, "news");
  assert.equal(p?.payload.url, "/novini/abc?s=push");
  assert.equal(p?.payload.title.length, 90);
  assert.equal(p?.payload.body, "Нова новина");
});
