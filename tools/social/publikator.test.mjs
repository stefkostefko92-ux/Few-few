import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";
import { request, sign } from "./publikator.mjs";

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
  const cfg = { url: "https://publikator.example.com", keyId: "key1", secret: "pk_secret" };
  const out = await request(cfg, "POST", "/agent/v1/drafts", { caption: "здравей" }, fetchImpl);
  assert.deepEqual(out, { ok: true });
  assert.equal(captured.url, "https://publikator.example.com/agent/v1/drafts");
  const h = captured.init.headers;
  assert.equal(h["x-publikator-key-id"], "key1");
  assert.match(h["x-publikator-timestamp"], /^\d{10}$/);
  assert.match(h["x-publikator-nonce"], /^[A-Za-z0-9_-]{16,}$/);
  const expected = sign("pk_secret", {
    timestamp: h["x-publikator-timestamp"], nonce: h["x-publikator-nonce"], method: "POST", path: "/agent/v1/drafts", body: captured.init.body,
  });
  assert.equal(h["x-publikator-signature"], expected);
  assert.ok(!JSON.stringify(h).includes("pk_secret"), "тайната не трябва да е в заглавията");
});

test("грешка от сървъра става Error със статус", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: "Невалиден подпис." }), { status: 401 });
  await assert.rejects(
    () => request({ url: "https://x.example", keyId: "k", secret: "s" }, "GET", "/agent/v1/brands", undefined, fetchImpl),
    (e) => e.status === 401 && /Невалиден подпис/.test(e.message),
  );
});
