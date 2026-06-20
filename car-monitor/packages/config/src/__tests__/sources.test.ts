import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceEnabled } from "../index.ts";

test("sourceEnabled: по подразбиране изключен", () => {
  assert.equal(sourceEnabled("mobile_bg", {}), false);
  assert.equal(sourceEnabled("cars_bg", {}), false);
});

test("sourceEnabled: env override SOURCE_<ID>", () => {
  assert.equal(sourceEnabled("mobile_bg", { SOURCE_MOBILE_BG: "1" }), true);
  assert.equal(sourceEnabled("mobile_bg", { SOURCE_MOBILE_BG: "true" }), true);
  assert.equal(sourceEnabled("mobile_bg", { SOURCE_MOBILE_BG: "0" }), false);
  assert.equal(sourceEnabled("cars_bg", { SOURCE_CARS_BG: "1" }), true);
});

test("sourceEnabled: непознат източник => false", () => {
  assert.equal(sourceEnabled("unknown", {}), false);
});
