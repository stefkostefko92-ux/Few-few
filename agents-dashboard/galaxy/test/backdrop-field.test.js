import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDustField, buildAmbientNebulae } from "../src/backdrop-field.js";

test("buildDustField е детерминистичен по seed", () => {
  const a = buildDustField(7, 50), b = buildDustField(7, 50);
  assert.deepEqual(a, b);
});
test("buildDustField различни seed-ове → различно поле", () => {
  const a = buildDustField(1, 20), b = buildDustField(2, 20);
  assert.notDeepEqual(a, b);
});
test("buildDustField връща валидни диапазони (nx/ny в [-1,1], r>0)", () => {
  for (const s of buildDustField(3, 40)) {
    assert.ok(s.nx >= -1 && s.nx <= 1);
    assert.ok(s.ny >= -1 && s.ny <= 1);
    assert.ok(s.r > 0);
  }
});

test("buildAmbientNebulae връща фиксиран, стабилен набор", () => {
  const a = buildAmbientNebulae(), b = buildAmbientNebulae();
  assert.deepEqual(a, b);
  assert.ok(a.length >= 3);
});
