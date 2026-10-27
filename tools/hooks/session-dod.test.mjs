import { test } from "node:test";
import assert from "node:assert/strict";
import { checkClean, liveGateDue } from "../../.claude/hooks/session-dod.mjs";

test("чисто дърво или само untracked → не блокира", () => {
  assert.equal(checkClean(["?? scratch.txt", ""]).ok, true);
  assert.equal(checkClean([" M CLAUDE.md"]).ok, false);
});

test("пипнат агентски слой без нов жив печат → сесията не е готова", () => {
  const layer = [".claude/agents/seo.md", ".claude/hooks/dod-check.mjs", ".claude/settings.json"];
  assert.deepEqual(liveGateDue({ touched: ["CSPos/a.ts", ".claude/agents/seo.md"], layer, stampHash: "old", currentHash: "new" }), [".claude/agents/seo.md"]);
  assert.deepEqual(liveGateDue({ touched: [".claude/agents/seo.md"], layer, stampHash: undefined, currentHash: "new" }), [".claude/agents/seo.md"]);
});

test("печатът съвпада или слоят не е пипан → не връща сесията", () => {
  const layer = [".claude/agents/seo.md"];
  assert.deepEqual(liveGateDue({ touched: [".claude/agents/seo.md"], layer, stampHash: "h", currentHash: "h" }), []);
  assert.deepEqual(liveGateDue({ touched: ["CSPos/a.ts", ".claude/agents/_memory/seo.md"], layer, stampHash: "old", currentHash: "new" }), []);
});
