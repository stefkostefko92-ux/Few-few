// Тестове на бекенда на формата (срещу компилирания dist/). Пощата е двойник — нищо не излиза навън.
import { test } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { createApp } from "../dist/app.js";
import { fixedWindowLimiter } from "../dist/rate-limit.js";
import { loadConfig } from "../dist/config.js";

const ORIGIN = "https://liftcom.it";
const NOW = 1_800_000_000_000;

function setup({ fail = false, limiter } = {}) {
  const sent = [];
  const mailer = {
    async send(msg) {
      if (fail) throw new Error("rete");
      sent.push(msg);
    },
  };
  const app = createApp({ mailer, logger: pino({ level: "silent" }), allowedOrigin: ORIGIN, now: () => NOW, ...(limiter ? { limiter } : {}) });
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({ base, sent, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

const valida = (over = {}) => ({
  nome: "Maria Rossi",
  email: "maria@example.com",
  telefono: "+39 02 1234567",
  ruolo: "amministratore",
  comune: "Milano",
  servizio: "controllo",
  messaggio: "Ammodernamento concluso, vorremmo un controllo prima del saldo.",
  privacy: "si",
  sito_web: "",
  t: String(NOW - 60_000),
  ...over,
});

const postJson = (base, body, headers = {}) =>
  fetch(`${base}/api/richiesta`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });

test("заявка с валидни данни (JSON) → 200 и едно писмо с replyTo към подателя", async () => {
  const s = await setup();
  try {
    const res = await postJson(s.base, valida());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(s.sent.length, 1);
    assert.equal(s.sent[0].replyTo.email, "maria@example.com");
    assert.match(s.sent[0].subject, /Controllo qualità dei lavori – Milano/);
    assert.match(s.sent[0].text, /Ammodernamento concluso/);
  } finally {
    await s.close();
  }
});

test("форма без JS (urlencoded) → 303 към /contatti/grazie/", async () => {
  const s = await setup();
  try {
    const res = await fetch(`${s.base}/api/richiesta`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN },
      body: new URLSearchParams(valida({ t: "" })).toString(),
    });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/contatti/grazie/");
    assert.equal(s.sent.length, 1);
  } finally {
    await s.close();
  }
});

test("невалиден имейл → 400 с името на полето, без писмо", async () => {
  const s = await setup();
  try {
    const res = await postJson(s.base, valida({ email: "non-una-email" }));
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.deepEqual(data.fields, ["email"]);
    assert.equal(s.sent.length, 0);
  } finally {
    await s.close();
  }
});

test("без отметка за информацията → 400", async () => {
  const s = await setup();
  try {
    const body = valida();
    delete body.privacy;
    const res = await postJson(s.base, body);
    assert.equal(res.status, 400);
    assert.equal(s.sent.length, 0);
  } finally {
    await s.close();
  }
});

test("попълнен капан (sito_web) → „успех“ за бота, но писмо не тръгва", async () => {
  const s = await setup();
  try {
    const res = await postJson(s.base, valida({ sito_web: "http://spam.example" }));
    assert.equal(res.status, 200);
    assert.equal(s.sent.length, 0);
  } finally {
    await s.close();
  }
});

test("изпратено под 3 s след зареждане → не тръгва", async () => {
  const s = await setup();
  try {
    const res = await postJson(s.base, valida({ t: String(NOW - 500) }));
    assert.equal(res.status, 200);
    assert.equal(s.sent.length, 0);
  } finally {
    await s.close();
  }
});

test("чужд Origin → 403", async () => {
  const s = await setup();
  try {
    const res = await postJson(s.base, valida(), { origin: "https://evil.example" });
    assert.equal(res.status, 403);
    assert.equal(s.sent.length, 0);
  } finally {
    await s.close();
  }
});

test("лимит: шестата заявка от същия IP в прозореца → 429", async () => {
  const s = await setup({ limiter: fixedWindowLimiter(5, 60_000) });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await postJson(s.base, valida())).status, 200);
    assert.equal((await postJson(s.base, valida())).status, 429);
    assert.equal(s.sent.length, 5);
  } finally {
    await s.close();
  }
});

test("доставчикът на поща не отговаря → 502 с телефон за връзка", async () => {
  const s = await setup({ fail: true });
  try {
    const res = await postJson(s.base, valida());
    assert.equal(res.status, 502);
    assert.match((await res.json()).message, /\+39 379 296 9699/);
  } finally {
    await s.close();
  }
});

test("твърде голямо тяло → 413", async () => {
  const s = await setup();
  try {
    const res = await postJson(s.base, valida({ messaggio: "x".repeat(20_000) }));
    assert.equal(res.status, 413);
    assert.equal(s.sent.length, 0);
  } finally {
    await s.close();
  }
});

test("управляващи символи в текста → 400", async () => {
  const s = await setup();
  try {
    const res = await postJson(s.base, valida({ nome: "Mario\u0007Rossi" }));
    assert.equal(res.status, 400);
  } finally {
    await s.close();
  }
});

test("темата на писмото е един ред (без CR/LF от потребителя)", async () => {
  const s = await setup();
  try {
    await postJson(s.base, valida({ comune: "Milano\r\nBcc: x@example.com" }));
    assert.equal(s.sent.length, 1);
    assert.doesNotMatch(s.sent[0].subject, /[\r\n]/);
  } finally {
    await s.close();
  }
});

test("GET /health → 200", async () => {
  const s = await setup();
  try {
    const res = await fetch(`${s.base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  } finally {
    await s.close();
  }
});

test("лимитерът не расте безкрайно: при пълен речник с активни ключове отказва", () => {
  const l = fixedWindowLimiter(5, 60_000, 2);
  assert.equal(l.hit("a", 0), true);
  assert.equal(l.hit("b", 0), true);
  assert.equal(l.hit("c", 0), false);
  assert.equal(l.hit("c", 60_001), true);
});

test("конфигурация без ключ за Brevo → грешка при старт", () => {
  assert.throws(() => loadConfig({ MAIL_FROM: "a@example.com", MAIL_TO: "b@example.com" }), /BREVO_API_KEY/);
});
