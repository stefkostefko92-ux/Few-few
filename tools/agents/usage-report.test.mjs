// usage-report.test.mjs — съветващата проверка за усилие: реално тичало срещу дефиницията.
import { test } from "node:test";
import assert from "node:assert/strict";
import { effortDrift, definedEfforts } from "./usage-report.mjs";

const rec = (agent, effort, ts = "2026-11-02T08:00", extra = {}) => ({ id: `${agent}-${ts}-${effort}`, agent, effort, ts, ...extra });

test("разминаване: агент на high във frontmatter, а тичал на medium → хванато с брой и стойност", () => {
  const d = effortDrift([rec("prodavacha", "medium"), rec("prodavacha", "high"), rec("kodadjiyata", "medium")],
    { prodavacha: "high", kodadjiyata: "medium" });
  assert.deepEqual(d.map((x) => [x.agent, x.off, x.runs, x.seen]), [["prodavacha", 1, 2, { medium: 1 }]]);
});

test("пускане отпреди смяната на дефиницията, живи проверки и записи без effort не са разминаване", () => {
  const recs = [rec("kodadjiyata", "high", "2026-10-30T10:00"), rec("kodadjiyata", "high", "2026-11-02T08:00", { eval: "s-pamet" }),
    { id: "x", agent: "kodadjiyata", ts: "2026-11-02T08:00" }, rec("kodadjiyata", "medium", "2026-11-01T09:00")];
  assert.deepEqual(effortDrift(recs, { kodadjiyata: "medium" }, { sinceBy: { kodadjiyata: "2026-10-31T11:10" } }), []);
});

test("дефинициите: всеки наш агент с effort се чете от frontmatter", () => {
  const d = definedEfforts();
  assert.equal(d.kodadjiyata, "medium");
  assert.equal(d.prodavacha, "high");
  assert.ok(Object.keys(d).length >= 29);
});
