import test from "node:test";
import assert from "node:assert/strict";
import { createSession, verifySession } from "@/lib/admin-auth";

// Сесията на админа е единствената автентикация в продукта — тестваме, че
// подписът реално пази и че при къса тайна се отказва (fail-closed).
// admin-auth чете SESSION_SECRET ЛЕНИВО (вътре в secret()), затова стига да я
// зададем тук, преди първия тест.
process.env.SESSION_SECRET = "x".repeat(48);

test("сесия: валиден токен връща потребителя", async () => {
  const token = await createSession("stefan");
  assert.equal(await verifySession(token), "stefan");
});

test("сесия: липсващ токен → null", async () => {
  assert.equal(await verifySession(undefined), null);
  assert.equal(await verifySession(""), null);
});

test("сесия: подправен подпис → null", async () => {
  const token = await createSession("stefan");
  const bad = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
  assert.equal(await verifySession(bad), null);
});

test("сесия: чужд алгоритъм/боклук → null, не хвърля", async () => {
  assert.equal(await verifySession("eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9."), null);
  assert.equal(await verifySession("не-е-jwt"), null);
});

test("сесия: къса SESSION_SECRET → отказ (fail-closed), не пуска", async () => {
  const old = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "кратка";
  // createSession хвърля явно…
  await assert.rejects(() => createSession("stefan"));
  // …а verifySession гълта грешката и връща null → middleware отказва достъп.
  assert.equal(await verifySession("каквото-и-да-е"), null);
  process.env.SESSION_SECRET = old;
});
