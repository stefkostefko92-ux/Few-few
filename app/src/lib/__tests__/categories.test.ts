import test from "node:test";
import assert from "node:assert/strict";
import { labelFor, SERVICE_CATEGORY_LABELS } from "@/lib/categories";

test("labelFor връща човешкия етикет за известен ключ", () => {
  assert.equal(labelFor(SERVICE_CATEGORY_LABELS, "HEALTH"), "Здраве");
  assert.equal(labelFor(SERVICE_CATEGORY_LABELS, "SOCIAL"), "Социални услуги");
});

test("labelFor е устойчив при липсваща/празна стойност", () => {
  assert.equal(labelFor(SERVICE_CATEGORY_LABELS, null), "—");
  assert.equal(labelFor(SERVICE_CATEGORY_LABELS, undefined), "—");
  // непознат ключ се връща както е (не чупи рендера)
  assert.equal(labelFor(SERVICE_CATEGORY_LABELS, "UNKNOWN"), "UNKNOWN");
});
