// guard-config.test.mjs — ConfigChange: отслабването по средата на сесия се блокира, затягането минава.
//   node --test tools/hooks/guard-config.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decide, weakening } from "../../.claude/hooks/guard-config.mjs";

const SETTINGS = join(dirname(fileURLToPath(import.meta.url)), "../../.claude/settings.json");
const base = JSON.parse(readFileSync(SETTINGS, "utf8"));
const clone = () => JSON.parse(JSON.stringify(base));
const run = (source, next, head = base) =>
  decide({ source, file_path: "/x/.claude/settings.json" }, { readFile: () => (typeof next === "string" ? next : JSON.stringify(next)), headOf: () => JSON.stringify(head) });

test("project_settings: махнато deny правило → блок", () => {
  const s = clone();
  s.permissions.deny = s.permissions.deny.filter((r) => r !== "Edit(.env)");
  assert.match(run("project_settings", s), /deny/);
});

test("project_settings: махнат guard-exfil или свален onFailure: block → блок", () => {
  const a = clone();
  a.hooks.PreToolUse = a.hooks.PreToolUse.filter((g) => !g.hooks.some((h) => /guard-exfil/.test(h.command)));
  assert.match(run("project_settings", a), /кука/);
  const b = clone();
  for (const g of b.hooks.PreToolUse) for (const h of g.hooks) if (/guard-dangerous/.test(h.command)) delete h.onFailure;
  assert.match(run("project_settings", b), /onFailure/);
  const c = clone();
  c.hooks.PreToolUse.find((g) => g.hooks.some((h) => /guard-exfil/.test(h.command))).matcher = "Bash";
  assert.match(run("project_settings", c), /кука/, "стесненият matcher е отслабване");
});

test("project_settings: разширен matcher (Bash → Bash|Monitor) е затягане и минава", () => {
  const head = clone();
  const g = head.hooks.PreToolUse.find((x) => x.hooks.some((h) => /guard-exfil/.test(h.command)));
  g.matcher = g.matcher.split("|").filter((a) => a !== "Monitor").join("|");
  assert.equal(run("project_settings", base, head), null);
});

test("project_settings: изключена ограда, disableAllHooks, неразбираем JSON → блок", () => {
  // Оградата не е включена при нас (в облака заключва и всеки .json запис); правилото важи, ако HEAD я има.
  const fenced = clone();
  fenced.permissions.blockWritesOutsideWorkingDirectories = true;
  const a = clone();
  a.permissions.blockWritesOutsideWorkingDirectories = false;
  assert.match(run("project_settings", a, fenced), /ограда/);
  const b = clone();
  b.disableAllHooks = true;
  assert.match(run("project_settings", b), /disableAllHooks/);
  assert.match(run("project_settings", "{ не е json"), /JSON/);
});

test("project_settings: затягане минава (ново deny правило, нова кука, нова env)", () => {
  const s = clone();
  s.permissions.deny.push("Read(**/.next/**)");
  s.env = { ...s.env, CLAUDE_CODE_SUBAGENT_EFFORT: "medium" };
  s.hooks.Stop = [...(s.hooks.Stop || []), { hooks: [{ type: "command", command: "node x.mjs" }] }];
  assert.equal(run("project_settings", s), null);
  assert.equal(run("project_settings", base), null, "непроменените настройки минават");
});

test("local/user: блок само при disableAllHooks; skills винаги; policy никога", () => {
  assert.equal(run("local_settings", { permissions: { allow: ["Bash(npm test)"] } }), null);
  assert.match(run("local_settings", { disableAllHooks: true }), /disableAllHooks/);
  assert.match(run("user_settings", { disableAllHooks: true }), /disableAllHooks/);
  assert.match(decide({ source: "skills", file_path: "/x/.claude/skills/a/SKILL.md" }), /следващата сесия/);
  assert.equal(decide({ source: "policy_settings", file_path: "/etc/x.json" }, { readFile: () => "{}" }), null);
});

test("без HEAD версия (нов файл) — само абсолютните правила", () => {
  assert.equal(weakening("project_settings", { permissions: {} }, null), null);
  assert.match(weakening("project_settings", { disableAllHooks: true }, null), /disableAllHooks/);
});

test("куката е закачена за ConfigChange с onFailure: block", () => {
  const g = base.hooks.ConfigChange?.[0]?.hooks?.[0];
  assert.match(g?.command || "", /guard-config\.mjs/);
  assert.equal(g.onFailure, "block");
});
