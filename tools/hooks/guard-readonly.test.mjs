// guard-readonly.test.mjs — ревюърите без Write/Edit не пишат и през Bash (наложено, не поискано).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mutationReason, isReadOnlyAgent } from "../../.claude/hooks/guard-readonly.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(ROOT, ".claude", "hooks", "guard-readonly.mjs");
const run = (agent_type, command, extra = {}) => spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", agent_type, tool_input: { command }, ...extra }),
  env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }, encoding: "utf8",
});

test("ревюърите се откриват от дефиницията (Bash без Write/Edit), не от списък", () => {
  for (const a of ["kodadjiyata", "kachestveniyat", "razbivacha"]) assert.ok(isReadOnlyAgent(a, ROOT), `${a} е ревюър`);
  for (const a of ["ai-djiyata", "seo", "pravniyat-razbirach", "", "../x", "nyama-takav"]) assert.ok(!isReadOnlyAgent(a, ROOT), `${a} не е`);
});

test("командите, които пишат, се хващат", () => {
  for (const c of [
    "git commit -m x", "git push origin main", "git checkout -- src/a.ts", "git stash", "git add -A", "git -C wt reset --hard",
    "sed -i 's/a/b/' src/a.ts", "perl -pi -e 's/a/b/' x.js", "rm -f src/a.ts", "mv a.ts b.ts", "touch new.ts",
    "echo x > src/a.ts", "printf x >> README.md", "cat a | tee src/b.ts", "npx prettier --write .", "npx eslint . --fix",
    "npm install lodash", "npm i", "npm audit fix", "pnpm add zod", "cd linketto && npm uninstall x", "git apply patch.diff",
    "true; rm -rf build",
  ]) assert.ok(mutationReason(c), `трябва да се хване: ${c}`);
});

test("четене, тестове и временни файлове минават", () => {
  for (const c of [
    "git diff origin/main...HEAD", "git log --oneline -5", "git status --short", "git show HEAD:src/a.ts", "git config --get user.name",
    "grep -rn foo src", "npm test", "npm ci", "pnpm install --frozen-lockfile", "node --test tools", "npm run lint 2>&1 | tail -20",
    "npm test > /tmp/out.txt 2>&1", "node x.mjs 2>/dev/null", "echo '> не е пренасочване' ", 'grep -n "a > b" src/x.ts',
    "git apply --check patch.diff", "cat x >&2", "diff <(sort a) <(sort b)",
  ]) assert.equal(mutationReason(c), "", `не бива да се хване: ${c}`);
  assert.equal(mutationReason("echo x > /s/pad/f.txt", { scratch: "/s/pad" }), "", "scratchpad-ът е позволен");
});

test("куката блокира ревюър (exit 2), пуска агент с Write/Edit и главната сесия (exit 0)", () => {
  const r = run("kodadjiyata", "sed -i 's/a/b/' src/a.ts");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ревюър без Write\/Edit/);
  assert.equal(run("ai-djiyata", "sed -i 's/a/b/' src/a.ts").status, 0, "агент с Edit — не е работа на тази кука");
  assert.equal(run(undefined, "sed -i 's/a/b/' src/a.ts").status, 0, "главната сесия (без agent_type) — пропуска");
  assert.equal(run("kodadjiyata", "git diff HEAD~1").status, 0, "четене минава");
});
