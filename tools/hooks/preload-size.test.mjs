// preload-size.test.mjs — пази ДОСТАВКАТА на инжектирания контекст, не само съдържанието му.
//
// Инцидент (открит 2026-10-27, проба на живо с агент seo): от Claude Code 2.1.89 стойност на
// `additionalContext` над 10 000 знака не влиза в контекста — харнесът я записва във файл и подава само
// пътя + първите 2 000 знака. memory-preload връщаше ~25 000 знака в ЕДНА стойност → всеки наш агент
// виждаше началото на доктрината за сигурност и нищо друго (без процедура, HANDOFF, карта, памет).
// Тестовете проверяваха съдържанието на изхода на куката и бяха зелени — никой не проверяваше какво
// ДОСТИГА до агента. Тук се гейтва договорът с харнеса: всяка регистрирана стойност е под тавана.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { CONTEXT_CHAR_LIMIT, PARTS, capText } from "../../.claude/hooks/memory-preload.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(ROOT, ".claude", "hooks", "memory-preload.mjs");
const HARNESS_LIMIT = 10_000; // https://code.claude.com/docs/en/hooks.md#add-context-for-claude

/** Агентите = дефиниция в .claude/agents/ + памет в _memory/ (същото условие, при което куката инжектира). */
const AGENTS = readdirSync(join(ROOT, ".claude", "agents"))
  .filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md")
  .map((f) => f.slice(0, -3))
  .filter((id) => existsSync(join(ROOT, ".claude", "agents", "_memory", `${id}.md`)));

function run(part, agent) {
  const r = spawnSync(process.execPath, [HOOK, ...(part ? [`--part=${part}`] : [])], {
    input: JSON.stringify({ hook_event_name: "SubagentStart", agent_type: agent, agent_id: "t1", prompt: "прегледай промените" }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, AGENT_MEMORY_SYNC: "0" },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `memory-preload --part=${part} (${agent}) излезе с ${r.status}: ${r.stderr}`);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput?.additionalContext || "" : "";
}

test("таванът е под прага на харнеса", () => {
  assert.ok(CONTEXT_CHAR_LIMIT < HARNESS_LIMIT);
});

test("settings.json вика memory-preload САМО на части и покрива всяка част точно веднъж", () => {
  const s = JSON.parse(readFileSync(join(ROOT, ".claude", "settings.json"), "utf8"));
  const cmds = (s.hooks?.SubagentStart || []).flatMap((g) => g.hooks || []).map((h) => String(h.command || ""))
    .filter((c) => c.includes("memory-preload.mjs"));
  assert.ok(cmds.length, "memory-preload не е регистриран на SubagentStart");
  const parts = cmds.map((c) => (c.match(/--part=([a-z]+)/) || [])[1]);
  assert.ok(parts.every(Boolean), `извикване без --part връща всичко в една стойност над тавана: ${cmds.join(" | ")}`);
  assert.deepEqual([...parts].sort(), [...PARTS].sort(), "всяка част трябва да е регистрирана точно веднъж");
});

test("статичните части се побират ЦЕЛИ — без отрязване (растеж на доктрината/процедурата пада тук)", () => {
  for (const part of ["doctrine", "procedure"]) {
    const ctx = run(part, AGENTS[0]);
    assert.ok(ctx.length > 500, `${part}: празна`);
    assert.ok(!ctx.includes("[отрязано на"), `${part}: ${ctx.length} знака — над тавана ${CONTEXT_CHAR_LIMIT}; съкрати текста`);
  }
});

test(`агентската част е под тавана за всеки от ${AGENTS.length} агента и носи картата и схемата`, () => {
  assert.ok(AGENTS.length >= 20, `очаквах целия флот, намерих ${AGENTS.length}`);
  for (const a of AGENTS) {
    const ctx = run("agent", a);
    assert.ok(ctx.length <= CONTEXT_CHAR_LIMIT, `${a}: ${ctx.length} знака > ${CONTEXT_CHAR_LIMIT}`);
    assert.match(ctx, new RegExp(`agent: ${a}\\b`), `${a}: липсва схемата на learn с id-то`);
  }
});

test("частите заедно носят всичко, което агентът трябва да види", () => {
  const all = PARTS.map((p) => run(p, "kodadjiyata")).join("\n");
  for (const marker of [/ДОКТРИНА ЗА СИГУРНОСТ/, /ОБЩА ПРОЦЕДУРА/, /СПОДЕЛЕНИ ПОУКИ/, /Изход\/артефакт:/, /Следваща стъпка:/, /Проверена памет на „kodadjiyata"/, /agent: kodadjiyata/]) {
    assert.match(all, marker, `липсва ${marker} в доставения контекст`);
  }
});

test("capText реже с явна бележка и път, никога над тавана", () => {
  const long = "а".repeat(CONTEXT_CHAR_LIMIT + 5000);
  const out = capText(long, "x/y.md");
  assert.ok(out.length <= CONTEXT_CHAR_LIMIT);
  assert.match(out, /отрязано на \d+ знака .* x\/y\.md/);
  assert.equal(capText("кратко", "x"), "кратко");
});
