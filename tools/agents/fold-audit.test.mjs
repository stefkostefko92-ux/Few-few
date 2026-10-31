// fold-audit.test.mjs — двойка, която си предава почти всичко, е кандидат за сливане; хъбът не се брои.
import { test } from "node:test";
import assert from "node:assert/strict";
import { coupling } from "./fold-audit.mjs";

const h = (from, to) => ({ t: "handoff", from, to });
const u = (agent, n) => Array.from({ length: n }, () => ({ agent }));

test("тясно свързана двойка е кандидат; рядка двойка и хъбът AI-джията не са", () => {
  const flows = [...Array(6).fill(h("kodadjiyata", "izpitatelya")), h("izpitatelya", "kodadjiyata"), h("seo", "letopisetsa"), ...Array(9).fill(h("ai-djiyata", "seo"))];
  const usage = [...u("kodadjiyata", 20), ...u("izpitatelya", 10), ...u("seo", 15), ...u("letopisetsa", 12), ...u("ai-djiyata", 30)];
  const r = coupling(flows, usage);
  const top = r.rows[0];
  assert.equal(top.pair, "izpitatelya ↔ kodadjiyata");
  assert.equal(top.handoffs, 7);
  assert.equal(top.candidate, true);
  assert.ok(!r.rows.find((x) => x.pair.includes("ai-djiyata")), "хъбът е оркестрация, не съвместен контекст");
  assert.equal(r.rows.find((x) => x.pair === "letopisetsa ↔ seo").candidate, false);
});
