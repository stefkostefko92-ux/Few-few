import { test } from "node:test";
import assert from "node:assert/strict";
import { hash21, hash22, mulberry32, separateLabels } from "../src/hash.js";

test("hash21 е детерминистичен и в [0,1)", () => {
  const a = hash21(1.234, 5.678), b = hash21(1.234, 5.678);
  assert.equal(a, b);
  assert.ok(a >= 0 && a < 1);
});
test("hash21 разпределя различни входове различно (не константа)", () => {
  const vals = new Set();
  for (let i = 0; i < 50; i++) vals.add(hash21(i * 0.37, i * 1.91).toFixed(6));
  assert.ok(vals.size > 40, "твърде много колизии — hash-ът се държи като плочки");
});
test("hash22 връща два независими компонента", () => {
  const [x, y] = hash22(3, 4);
  assert.notEqual(x, y);
});
test("mulberry32 е детерминистичен по seed", () => {
  const r1 = mulberry32(42), r2 = mulberry32(42);
  const seq1 = [r1(), r1(), r1()], seq2 = [r2(), r2(), r2()];
  assert.deepEqual(seq1, seq2);
});
test("mulberry32 различни seed-ове дават различни последователности", () => {
  const a = mulberry32(1)(), b = mulberry32(2)();
  assert.notEqual(a, b);
});

test("separateLabels раздалечава застъпени етикети", () => {
  const items = [{ x: 100, y: 100, r: 20 }, { x: 105, y: 100, r: 20 }];
  const out = separateLabels(items, 30, 4);
  const dist = Math.hypot(out[1].x - out[0].x, out[1].y - out[0].y);
  assert.ok(dist >= 20 + 20 + 4 - 0.5, `очаквах >= 44, получих ${dist}`);
});
test("separateLabels не мърда вече раздалечени точки", () => {
  const items = [{ x: 0, y: 0, r: 5 }, { x: 500, y: 500, r: 5 }];
  const out = separateLabels(items, 10, 4);
  assert.equal(out[0].x, 0);
  assert.equal(out[1].x, 500);
});
test("separateLabels е детерминистичен", () => {
  const items = [{ x: 10, y: 10, r: 8 }, { x: 12, y: 10, r: 8 }, { x: 11, y: 12, r: 8 }];
  const a = separateLabels(items.map((i) => ({ ...i })));
  const b = separateLabels(items.map((i) => ({ ...i })));
  assert.deepEqual(a, b);
});
