// api/server.test.mjs — гейтът на контактния API: валидация, honeypot, лимит, HTTP договор (мокнат send).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { validate, rateLimiter, buildEmail, sendViaBrevo, createApp } from "./server.mjs";

const GOOD = { name: "Иван Петров", email: "ivan@example.com", company: "Пример ЕООД", demo: "avtoservis", message: "Харесва ми демото на автосервиза, искам оферта.", lang: "bg", consent: true, website: "" };

test("validate: коректен вход минава, полетата са подрязани", () => {
  const v = validate({ ...GOOD, name: "  Иван Петров  " });
  assert.equal(v.ok, true);
  assert.equal(v.data.name, "Иван Петров");
  assert.equal(v.data.bot, false);
});

test("validate: всяко нарушено поле се докладва по име", () => {
  const v = validate({ name: "И", email: "не-имейл", message: "кратко", lang: "xx", consent: false, demo: "Bad Slug!" });
  assert.equal(v.ok, false);
  for (const f of ["name", "email", "message", "consent", "demo"]) assert.ok(v.errors.includes(f), f);
  assert.equal(validate({ ...GOOD, message: "x".repeat(2001) }).ok, false);
  assert.equal(validate(null).ok, false);
  assert.equal(validate({ ...GOOD, lang: "xx" }).data?.lang, "bg");
});

test("validate: honeypot маркира бот, консент приема формите на формата (on/true)", () => {
  assert.equal(validate({ ...GOOD, website: "http://spam" }).data.bot, true);
  assert.equal(validate({ ...GOOD, consent: "on" }).ok, true);
  assert.equal(validate({ ...GOOD, consent: "yes" }).ok, false);
});

test("rateLimiter: 5 в прозорец, после блок, след прозореца пак", () => {
  let t = 0;
  const allow = rateLimiter({ limit: 5, windowMs: 1000, now: () => t });
  for (let i = 0; i < 5; i++) assert.equal(allow("a"), true);
  assert.equal(allow("a"), false);
  assert.equal(allow("b"), true);
  t = 1001;
  assert.equal(allow("a"), true);
});

test("buildEmail: reply-to е подателят, получателят е от env", () => {
  const m = buildEmail(validate(GOOD).data, { CONTACT_TO: "to@example.com", CONTACT_FROM: "from@example.com" });
  assert.equal(m.to[0].email, "to@example.com");
  assert.equal(m.sender.email, "from@example.com");
  assert.equal(m.replyTo.email, GOOD.email);
  assert.ok(m.subject.includes("Иван Петров") && m.subject.includes("avtoservis"));
  assert.ok(m.textContent.includes(GOOD.message));
});

test("sendViaBrevo: хедър api-key, JSON тяло, грешка при не-201 и при липсващ ключ", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { status: 201 }; };
  await sendViaBrevo({ subject: "x" }, { apiKey: "k", fetchImpl, url: "https://example.invalid/mail" });
  assert.equal(calls[0].url, "https://example.invalid/mail");
  assert.equal(calls[0].init.headers["api-key"], "k");
  assert.equal(JSON.parse(calls[0].init.body).subject, "x");
  await assert.rejects(sendViaBrevo({}, { apiKey: "k", fetchImpl: async () => ({ status: 401 }) }), /401/);
  await assert.rejects(sendViaBrevo({}, { apiKey: "", fetchImpl }), /missing/);
});

async function withServer(opts, fn) {
  const server = createServer(createApp(opts));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise((r) => server.close(r)); }
}

const post = (base, body, headers = { "content-type": "application/json" }) => fetch(`${base}/api/contact`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

test("HTTP: health, 404, 405, 415, невалиден JSON", async () => {
  await withServer({ send: async () => {} }, async (base) => {
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
    assert.equal((await fetch(`${base}/api/contact`)).status, 405);
    assert.equal((await post(base, "x", { "content-type": "text/plain" })).status, 415);
    assert.equal((await post(base, "{bad")).status, 400);
  });
});

test("HTTP: успешно изпращане → 200 и send получава валидираните данни; 400 с полетата при грешка", async () => {
  const sent = [];
  await withServer({ send: async (d) => { sent.push(d); } }, async (base) => {
    const r = await post(base, GOOD);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(sent[0].email, GOOD.email);
    const bad = await post(base, { ...GOOD, consent: false });
    assert.equal(bad.status, 400);
    assert.deepEqual((await bad.json()).errors, ["consent"]);
    assert.equal(sent.length, 1);
  });
});

test("HTTP: honeypot връща 200 без изпращане; 502 когато доставчикът откаже; 429 при лимит", async () => {
  const sent = [];
  await withServer({ send: async () => { sent.push(1); }, allow: () => true }, async (base) => {
    assert.equal((await post(base, { ...GOOD, website: "spam" })).status, 200);
    assert.equal(sent.length, 0);
  });
  await withServer({ send: async () => { throw new Error("Brevo HTTP 500"); } }, async (base) => {
    const r = await post(base, GOOD);
    assert.equal(r.status, 502);
    assert.equal((await r.json()).error, "send");
  });
  await withServer({ send: async () => {}, allow: () => false }, async (base) => {
    assert.equal((await post(base, GOOD)).status, 429);
  });
});

test("HTTP: формата без JavaScript (urlencoded) получава HTML на своя език", async () => {
  await withServer({ send: async () => {} }, async (base) => {
    const body = new URLSearchParams({ ...GOOD, consent: "on" }).toString();
    const r = await post(base, body, { "content-type": "application/x-www-form-urlencoded" });
    assert.equal(r.status, 200);
    const t = await r.text();
    assert.ok(t.includes('<html lang="bg">') && t.includes("Получихме"));
    const bad = await post(base, new URLSearchParams({ ...GOOD, lang: "it", message: "x" }).toString(), { "content-type": "application/x-www-form-urlencoded" });
    assert.equal(bad.status, 400);
    assert.ok((await bad.text()).includes("<li>message</li>"));
  });
});

test("HTTP: тяло над 16 KB → 413", async () => {
  await withServer({ send: async () => {} }, async (base) => {
    const r = await post(base, { ...GOOD, message: "x".repeat(20000) }).catch(() => null);
    if (r) assert.equal(r.status, 413); // при затворена връзка fetch може да хвърли — и двете са отказ
  });
});
