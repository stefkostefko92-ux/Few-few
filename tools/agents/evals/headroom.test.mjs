// headroom.test.mjs — наситени оценки се виждат; смесени не.
import { test } from "node:test";
import assert from "node:assert/strict";
import { headroom } from "./headroom.mjs";

const rec = (specs, pass = true) => ({ checkPass: pass ? 10 : 7, checkTotal: 10, perSpec: specs.map((id) => ({ id, passed: pass ? 5 : 3, total: 5 })) });

test("всичко зелено в няколко записа → няма запас", () => {
  const r = headroom([rec(["a", "b", "c"]), rec(["a", "b", "c"]), rec(["a", "b"])]);
  assert.equal(r.noHeadroom, true);
  assert.deepEqual(r.saturated.sort(), ["a", "b", "c"]);
});

test("spec, който понякога пада, дава запас; един запис не стига за присъда", () => {
  const r = headroom([rec(["a", "b"]), rec(["a", "b"], false)]);
  assert.equal(r.noHeadroom, false);
  assert.equal(headroom([rec(["x"])]).judged, 0);
});
