import { test } from "node:test";
import assert from "node:assert/strict";
import { kindOf, productsOf, agentsFor, decide, triage, parsePrs, rankProducts, STALE_DAYS } from "./pr-triage.mjs";

test("видът идва от пътищата: документи · зависимости · код", () => {
  assert.equal(kindOf([]), "empty");
  assert.equal(kindOf(["docs/research/x.md", "panev/README.md"]), "docs");
  assert.equal(kindOf(["medqr/package.json", "medqr/package-lock.json", "medqr/CHANGELOG.md"]), "deps");
  assert.equal(kindOf(["medqr/package.json", "medqr/src/server.js"]), "code");
});

test("продуктите са папките от първо ниво, без файловете в корена", () => {
  assert.deepEqual(productsOf(["CSPos/src/a.ts", "README.md", "CSPos/b.ts", "deploy/x.sh"]), ["CSPos", "deploy"]);
});

test("код → Кодаджията винаги + собственикът на домейна; документи → никой", () => {
  assert.deepEqual(agentsFor("code", ["CSPos"]), ["kodadjiyata", "kasadjiyata"]);
  assert.deepEqual(agentsFor("deps", ["linketto"]), ["kodadjiyata"]);
  assert.deepEqual(agentsFor("code", ["Ivan"]), ["kodadjiyata"]);
  assert.deepEqual(agentsFor("docs", ["CSPos"]), []);
});

test("застарял PR не се преглежда, а вече прегледаният на същата версия — не втори път", () => {
  assert.equal(decide({ kind: "code", products: ["CSPos"], ageDays: STALE_DAYS + 1 }).agents.length, 0);
  assert.match(decide({ kind: "code", products: ["CSPos"], ageDays: STALE_DAYS + 1 }).why, /застарял/);
  assert.deepEqual(decide({ kind: "code", products: ["CSPos"], ageDays: 2, reviewed: ["kodadjiyata"] }).agents, ["kasadjiyata"]);
  assert.match(decide({ kind: "code", products: ["CSPos"], ageDays: 2, reviewed: ["kodadjiyata", "kasadjiyata"] }).why, /вече прегледан/);
});

test("triage: git грешка не спира плана, дневникът се чете по sha", () => {
  const info = (ref) => {
    if (ref === "broken") throw new Error("unknown revision");
    return { files: ["panev/server.js"], ageDays: 3, sha: "abc" };
  };
  const plan = triage([{ number: 1, title: "x", head: { ref: "ok" } }, { number: 2, title: "y", head: { ref: "broken" } }], info, { abc: ["kodadjiyata"] });
  assert.deepEqual(plan[0].agents, ["prodavacha"]);
  assert.equal(plan[1].agents.length, 0);
  assert.match(plan[1].error, /unknown revision/);
});

test("входът е TSV или JSON от GitHub", () => {
  assert.deepEqual(parsePrs("12\tclaude/x\tЗаглавие\n"), [{ number: 12, title: "Заглавие", head: { ref: "claude/x" } }]);
  assert.equal(parsePrs('[{"number":3,"title":"t","head":{"ref":"r"}}]')[0].head.ref, "r");
});

test("tools/ се разпределя по подпапка; паметта на агентите е данни", () => {
  assert.deepEqual(productsOf(["tools/betting/golad.mjs", "tools/agents/x.mjs"]), ["tools/agents", "tools/betting"]);
  assert.deepEqual(agentsFor("code", ["tools/betting", "tools/agents"]), ["kodadjiyata", "goladjiyata", "ai-djiyata"]);
  assert.equal(kindOf([".claude/agents/_memory/_flows.jsonl", "agents-dashboard/agents.json"]), "docs");
});

test("най-много двама собственици на домейн — най-засегнатите продукти първи", () => {
  const files = ["zabobovdol/a.ts", "zabobovdol/b.ts", "zabobovdol/c.ts", "Gaming/x.ts", "Gaming/y.ts", "Nexus/z.ts", "Nexus/README.md", "Nexus/w.md"];
  assert.deepEqual(rankProducts(files), ["zabobovdol", "Gaming", "Nexus"]);
  assert.deepEqual(agentsFor("code", rankProducts(files)), ["kodadjiyata", "seo", "prodavacha"]);
});
