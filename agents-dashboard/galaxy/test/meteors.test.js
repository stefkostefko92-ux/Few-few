import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnMeteor, stepAndDrawMeteors } from "../src/meteors.js";
import { mulberry32 } from "../src/hash.js";

test("spawnMeteor с фиксиран rand е детерминистичен", () => {
  const a = spawnMeteor(800, 600, mulberry32(5));
  const b = spawnMeteor(800, 600, mulberry32(5));
  assert.deepEqual(a, b);
});
test("spawnMeteor тръгва над екрана и се движи надолу-настрани", () => {
  const m = spawnMeteor(800, 600, mulberry32(1));
  assert.ok(m.y < 0);
  assert.ok(m.vy > 0);
  assert.equal(m.life, 1);
});

function fakeCtx() {
  const calls = [];
  return {
    calls,
    globalCompositeOperation: "",
    lineCap: "",
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: "",
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    beginPath: () => calls.push("beginPath"),
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => calls.push("stroke"),
    arc: () => {},
    fill: () => calls.push("fill"),
  };
}

test("stepAndDrawMeteors премахва метеори с изчерпан живот", () => {
  const meteors = [{ x: 10, y: 10, vx: 0, vy: 0, life: 0.001, len: 8 }];
  stepAndDrawMeteors(fakeCtx(), meteors, 800, 600);
  assert.equal(meteors.length, 0);
});
test("stepAndDrawMeteors премахва метеори извън екрана", () => {
  const meteors = [{ x: -1000, y: 10, vx: 0, vy: 1, life: 1, len: 8 }];
  stepAndDrawMeteors(fakeCtx(), meteors, 800, 600);
  assert.equal(meteors.length, 0);
});
test("stepAndDrawMeteors пази жив метеор в кадъра", () => {
  const meteors = [{ x: 400, y: 300, vx: 1, vy: 1, life: 1, len: 8 }];
  stepAndDrawMeteors(fakeCtx(), meteors, 800, 600);
  assert.equal(meteors.length, 1);
});
