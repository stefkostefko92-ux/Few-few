// Бисквитката „в коя фирма работи MASTER": приема се само своята, в своята сесия.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTESTO_COOKIE,
  valoreContesto,
  leggiValoreContesto,
} from "@/lib/contesto-firma";

const K = "k".repeat(32);
const T = "11111111-2222-4333-8444-555555555555";

test("кръгът: подписаната стойност се чете обратно", () => {
  assert.equal(CONTESTO_COOKIE, "ea_azienda");
  const v = valoreContesto(K, "u1", "s1", T);
  assert.equal(leggiValoreContesto(K, "u1", "s1", v), T);
});

test("друг потребител, друга сесия, друг ключ — не", () => {
  const v = valoreContesto(K, "u1", "s1", T);
  assert.equal(leggiValoreContesto(K, "u2", "s1", v), null);
  assert.equal(leggiValoreContesto(K, "u1", "s2", v), null);
  assert.equal(leggiValoreContesto("x".repeat(32), "u1", "s1", v), null);
  assert.equal(leggiValoreContesto(K, "u1", undefined, v), null);
});

test("подменена фирма, липсващ подпис, боклук — не", () => {
  const v = valoreContesto(K, "u1", "s1", T);
  const altra = "99999999-2222-4333-8444-555555555555";
  assert.equal(
    leggiValoreContesto(K, "u1", "s1", altra + v.slice(T.length)),
    null,
  );
  assert.equal(leggiValoreContesto(K, "u1", "s1", T), null);
  assert.equal(leggiValoreContesto(K, "u1", "s1", `${T}.`), null);
  assert.equal(leggiValoreContesto(K, "u1", "s1", "non-uuid.abc"), null);
  assert.equal(leggiValoreContesto(K, "u1", "s1", undefined), null);
});
