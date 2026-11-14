// agent-cap.test.mjs — 11-ият общ агент в сесия се спира; нашите не се броят.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decide, ourAgents, CAP } from "../../.claude/hooks/agent-cap.mjs";

const ours = ourAgents();
const call = (type, sid = "s1") => ({ session_id: sid, tool_input: { subagent_type: type } });

test("нашите агенти не се броят; 10 общи минават, 11-ият се спира", () => {
  assert.ok(ours.has("kodadjiyata") && ours.size >= 29);
  const state = {};
  for (let i = 0; i < 30; i++) assert.equal(decide(call("kodadjiyata"), state, ours).block, false);
  for (let i = 1; i <= CAP; i++) assert.equal(decide(call(i % 2 ? "general-purpose" : "Explore"), state, ours).block, false, `общ № ${i}`);
  const r = decide(call("fork"), state, ours);
  assert.equal(r.block, true);
  assert.match(r.why, /№ 11/);
});

test("броячът е по сесия; липсващ subagent_type е general-purpose", () => {
  const state = { s1: CAP };
  assert.equal(decide(call("Plan", "s2"), state, ours).block, false, "друга сесия");
  assert.equal(decide({ session_id: "s1", tool_input: {} }, state, ours).block, true);
});

test("куката е закачена за Agent|Task преди пускане", () => {
  const s = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../.claude/settings.json"), "utf8"));
  const g = s.hooks.PreToolUse.find((x) => x.hooks.some((h) => /agent-cap\.mjs/.test(h.command)));
  assert.ok(g, "agent-cap липсва в PreToolUse");
  assert.equal(g.matcher, "Agent|Task");
  assert.equal(s.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS, "10");
  assert.equal(s.env.CLAUDE_CODE_SUBAGENT_EFFORT, "medium");
});
