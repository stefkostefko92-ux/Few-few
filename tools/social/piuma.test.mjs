import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";
import { request, sign, summarizeLearned } from "./piuma.mjs";

test("подписът е HMAC-SHA256 над канонична форма с хеш на тялото", () => {
  const input = { timestamp: "1700000000", nonce: "abcabcabcabcabcabc", method: "post", path: "/agent/v1/drafts", body: '{"a":1}' };
  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  const expected = createHmac("sha256", "secret").update(["1700000000", input.nonce, "POST", input.path, bodyHash].join("\n")).digest("hex");
  assert.equal(sign("secret", input), expected);
});

test("request слага четирите заглавия и подписва точно изпратеното тяло", async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const cfg = { url: "https://piuma.example.com", keyId: "key1", secret: "pk_secret" };
  const out = await request(cfg, "POST", "/agent/v1/drafts", { caption: "здравей" }, fetchImpl);
  assert.deepEqual(out, { ok: true });
  assert.equal(captured.url, "https://piuma.example.com/agent/v1/drafts");
  const h = captured.init.headers;
  assert.equal(h["x-piuma-key-id"], "key1");
  assert.match(h["x-piuma-timestamp"], /^\d{10}$/);
  assert.match(h["x-piuma-nonce"], /^[A-Za-z0-9_-]{16,}$/);
  const expected = sign("pk_secret", {
    timestamp: h["x-piuma-timestamp"], nonce: h["x-piuma-nonce"], method: "POST", path: "/agent/v1/drafts", body: captured.init.body,
  });
  assert.equal(h["x-piuma-signature"], expected);
  assert.ok(!JSON.stringify(h).includes("pk_secret"), "тайната не трябва да е в заглавията");
});

test("грешка от сървъра става Error със статус", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: "Невалиден подпис." }), { status: 401 });
  await assert.rejects(
    () => request({ url: "https://x.example", keyId: "k", secret: "s" }, "GET", "/agent/v1/brands", undefined, fetchImpl),
    (e) => e.status === 401 && /Невалиден подпис/.test(e.message),
  );
});

const finding = (confidence, reason, best, buckets) => ({ confidence, reason, best, buckets });

test("резюмето обявява извод само при `ready` и винаги показва бройките", () => {
  const out = summarizeLearned(
    {
      sample: 14,
      timezone: "Europe/Sofia",
      timing: finding("ready", "ok", "evening", [
        { value: "evening", posts: 8, medianRate: 9.1 },
        { value: "morning", posts: 6, medianRate: 4.2 },
      ]),
      format: finding("early", "too-few", null, [
        { value: "REELS", posts: 5, medianRate: 7.9 },
        { value: "IMAGE", posts: 9, medianRate: 6.1 },
      ]),
      topic: finding("none", "no-posts", null, []),
    },
    { slug: "piuma", managed: true },
  );
  assert.match(out, /Кога: вечер \(19–23\)\s+← извод/);
  // Кофата с най-висока медиана, но 5 поста, НЕ бива да се чете като находка: точно
  // това е разликата между „още е рано" и „няма разлика".
  assert.doesNotMatch(out, /Формат:.*← извод/);
  assert.match(out, /Формат: още няма извод/);
  assert.match(out, /REELS — 7\.9% медиана, 5 поста/);
  assert.match(out, /Тема: още няма извод \(няма публикувани постове с метрики\)/);
  assert.match(out, /часовник: Europe\/Sofia/);
});

test("липсващ блок `learned` се казва, не се мълчи", () => {
  assert.match(summarizeLearned(undefined, { slug: "x" }), /по-стар от това CLI/);
});
