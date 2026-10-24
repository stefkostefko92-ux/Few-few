import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRateLimiter } from "@/lib/ratelimit-core";
import {
  OBITUARY_PUBLIC_SELECT,
  RESERVED_OBITUARY_SLUGS,
  obituaryCreateData,
  obituarySlug,
  obituarySlugBase,
  obituarySubmissionSchema,
  publishedObituaryWhere,
  screenObituarySubmission,
} from "@/lib/obituary";

// Подаването на некролог/помен от /pomeni/nov: ред на проверките, лимит,
// модерация (published: false) и какво излиза публично.

// Петък, 23 октомври 2026, 15:00 в София (UTC+3).
const NOW = new Date("2026-10-23T12:00:00Z");

const VALID = {
  kind: "NECROLOGY",
  fullName: "Иван Петров Иванов",
  birthYear: "1945",
  deathDate: "2026-10-21",
  ceremonyDate: "2026-10-24",
  ceremonyTime: "11:00",
  ceremonyPlace: "църквата „Св. Николай“, Бобов дол",
  text: "Почина нашият скъп съпруг, баща и дядо.",
  fromFamily: "От семейството",
  contactName: "Мария Иванова",
  contactPhone: "0888 123 456",
  consent: "on",
};

// Същият лимит като в src/app/pomeni/nov/actions.ts: 3 за 15 минути.
function limiterFor(key = "pomen:203.0.113.7") {
  const rl = createRateLimiter();
  let calls = 0;
  return {
    allow: () => {
      calls++;
      return rl.hit(key, 3, 15 * 60 * 1000, NOW.getTime());
    },
    calls: () => calls,
  };
}

function submit(values: Record<string, string>, allow: () => boolean, website = "") {
  return screenObituarySubmission({ values, website }, allow, NOW);
}

test("лимитът брои само валидните подавания: три грешки, после вярното минава", async () => {
  const l = limiterFor();
  // Близкият поправя грешките една по една (формата показва първата).
  const r1 = await submit({ ...VALID, consent: "" }, l.allow);
  const r2 = await submit({ ...VALID, text: "За връзка: 0888 123 456" }, l.allow);
  const r3 = await submit({ ...VALID, ceremonyTime: "25:00" }, l.allow);
  for (const r of [r1, r2, r3]) assert.equal(r.status, "invalid");
  assert.equal(l.calls(), 0, "невалидните не стигат до лимита");

  const ok = await submit(VALID, l.allow);
  assert.equal(ok.status, "ok");
  assert.equal(l.calls(), 1);
});

test("лимитът пак спира четвъртото ВАЛИДНО подаване", async () => {
  const l = limiterFor();
  for (let i = 0; i < 3; i++) assert.equal((await submit(VALID, l.allow)).status, "ok");
  assert.equal((await submit(VALID, l.allow)).status, "limited");
});

test("honeypot е първата проверка: нищо друго не се пуска, лимитът не се брои", async () => {
  const l = limiterFor();
  const r = await submit(VALID, l.allow, "http://spam.example");
  assert.equal(r.status, "honeypot");
  assert.equal(l.calls(), 0);
  // Дори с невалидни данни — пак honeypot (ботът не научава нищо за проверките).
  assert.equal((await submit({ consent: "" }, l.allow, "x")).status, "honeypot");
});

test("невалидното връща съобщението и полето за фокус", async () => {
  const r = await submit({ ...VALID, contactPhone: "" }, () => true);
  assert.equal(r.status, "invalid");
  if (r.status !== "invalid") return;
  assert.equal(r.field, "contactPhone");
  assert.ok(r.error.length > 0);
});

test("създаденото от формата е published: false (чака модерация)", async () => {
  const r = await submit(VALID, () => true);
  assert.equal(r.status, "ok");
  if (r.status !== "ok") return;
  const data = obituaryCreateData(r.data, "ivan-petrov-ivanov-2026");
  assert.equal(data.published, false);
  assert.equal(data.slug, "ivan-petrov-ivanov-2026");
  assert.equal(data.consent, true);
  assert.equal(data.photoUrl, "", "снимка добавя само редакторът");
  assert.equal(data.contactName, "Мария Иванова");
  assert.equal(data.contactPhone, "0888 123 456");
  assert.equal(data.ceremonyAt?.getTime(), Date.UTC(2026, 9, 24, 11, 0));
});

test("публичното четене: само публикуваните и без данните на подателя", () => {
  const keys = Object.keys(OBITUARY_PUBLIC_SELECT);
  for (const k of keys) assert.ok(!/^contact|^consent$|^published$/.test(k), k);
  assert.ok(keys.includes("fullName") && keys.includes("slug"));

  assert.deepEqual(publishedObituaryWhere(), { published: true });
  assert.deepEqual(publishedObituaryWhere({ kind: "MEMORIAL" }), { kind: "MEMORIAL", published: true });
  assert.deepEqual(publishedObituaryWhere({ kind: null }), { published: true });
  assert.deepEqual(publishedObituaryWhere({ slug: "ivan-petrov" }), { slug: "ivan-petrov", published: true });
});

test("slug: „nov“ е запазен — /pomeni/nov е формата", () => {
  const base = obituarySlugBase("Нов", null);
  assert.equal(base, "nov");
  assert.equal(obituarySlug(base, []), "nov-2");
  assert.equal(obituarySlug(base, ["nov-2"]), "nov-3");
  assert.equal(obituarySlug("ivan-petrov", ["ivan-petrov"]), "ivan-petrov-2");
  assert.equal(obituarySlug("ivan-petrov", []), "ivan-petrov");
});

test("всеки статичен път под /pomeni/ е в RESERVED_OBITUARY_SLUGS", () => {
  const dir = join(process.cwd(), "src/app/pomeni");
  const statics = readdirSync(dir).filter(
    (n) => statSync(join(dir, n)).isDirectory() && !n.startsWith("[") && !n.startsWith("("),
  );
  assert.ok(statics.length > 0);
  for (const s of statics) assert.ok(RESERVED_OBITUARY_SLUGS.includes(s), `/pomeni/${s} липсва в запазените`);
});

test("схемата пак отказва попълнен honeypot (втора линия)", () => {
  const r = obituarySubmissionSchema(NOW).safeParse({ ...VALID, website: "x" });
  assert.equal(r.success, false);
});
