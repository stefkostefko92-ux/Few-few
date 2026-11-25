// walk-skip.test.mjs — обхождащите инструменти не влизат в работните копия на агентите.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAgentWorktrees } from "./walk-skip.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("само `.claude/worktrees`, не всяка папка worktrees", () => {
  assert.equal(isAgentWorktrees("/repo/.claude", "worktrees"), true);
  assert.equal(isAgentWorktrees("/repo/docs", "worktrees"), false);
  assert.equal(isAgentWorktrees("/repo/.claude", "hooks"), false);
});

test("review-check и discord-lint не виждат копие в .claude/worktrees", () => {
  const dir = mkdtempSync(join(tmpdir(), "walk-"));
  try {
    // Една и съща „находка“ в реално място и в копие на агент: броят на находките не бива да се удвоява.
    const bad = 'const client = new Client({ intents: [GatewayIntentBits.MessageContent] });\nclient.login("x");\n';
    for (const p of ["bot/index.js", ".claude/worktrees/agent-x/bot/index.js"]) { mkdirSync(join(dir, dirname(p)), { recursive: true }); writeFileSync(join(dir, p), bad); }
    for (const tool of ["tools/discord/discord-lint.mjs", "tools/approval/review-check.mjs"]) {
      const r = spawnSync(process.execPath, [join(ROOT, tool), dir], { encoding: "utf8", timeout: 60000 });
      assert.ok(!/\.claude\/worktrees/.test(r.stdout + r.stderr), `${tool} влезе в .claude/worktrees:\n${(r.stdout + r.stderr).slice(0, 600)}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
