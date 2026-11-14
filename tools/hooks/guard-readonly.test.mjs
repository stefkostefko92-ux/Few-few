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

// Хванато на 28.10.2026 два пъти (Разбивача): „>“ в тялото на heredoc за python/node е код или данни,
// не пренасочване — четяща проба беше блокирана. Тяло, подадено на обвивка, остава команда.
test("heredoc: тялото към интерпретатор или cat не е пренасочване; към обвивка — е", () => {
  assert.equal(mutationReason("python3 -I - <<'EOF'\nimport sys\nif ord('a') > 127: print(1)\nEOF"), "", "python heredoc");
  assert.equal(mutationReason("cat <<'EOF' | node x.mjs\na > b\nEOF"), "", "данни за node");
  assert.ok(mutationReason("bash <<'EOF'\necho x > out.txt\nEOF"), "тяло към bash е команда");
  assert.ok(mutationReason("cat > out.txt <<'EOF'\nhi\nEOF"), "пренасочването е на командния ред");
  assert.ok(mutationReason("python3 - <<'EOF' > out.txt\nprint(1)\nEOF"), "пренасочване след маркера");
});

test("куката блокира ревюър (exit 2), пуска агент с Write/Edit и главната сесия (exit 0)", () => {
  const r = run("kodadjiyata", "sed -i 's/a/b/' src/a.ts");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ревюър без Write\/Edit/);
  assert.equal(run("ai-djiyata", "sed -i 's/a/b/' src/a.ts").status, 0, "агент с Edit — не е работа на тази кука");
  assert.equal(run(undefined, "sed -i 's/a/b/' src/a.ts").status, 0, "главната сесия (без agent_type) — пропуска");
  assert.equal(run("kodadjiyata", "git diff HEAD~1").status, 0, "четене минава");
});

// Регресия 2026-11-02 (четвърто проучване): от 2.1.314 Bash куките тичат и за Monitor. Ревюър, който пише
// през Monitor команда, се спира като през Bash; Monitor без команда (WebSocket) не е запис.
test("Monitor: командата на ревюъра се съди като Bash; без команда минава", () => {
  assert.equal(run("kodadjiyata", "sed -i 's/a/b/' src/a.ts", { tool_name: "Monitor" }).status, 2);
  assert.equal(run("kodadjiyata", "tail -f build.log", { tool_name: "Monitor" }).status, 0);
  assert.equal(run("kodadjiyata", undefined, { tool_name: "Monitor", tool_input: { ws: { url: "wss://x" } } }).status, 0);
});

// Регресия 2026-11-02 (пилот за усилие): cp/touch/rm към /tmp и scratchpad-а се спираха винаги, а съобщението
// казваше „временни файлове пиши в scratchpad-а“ — Разбивача не можеше да подготви PoC. Сега временна цел минава;
// всичко, което пипа репото (вкл. през „..“, mv от репото, ln към репото), остава спряно.
test("файлови команди: временна цел минава, репото — не", () => {
  const sc = "/tmp/claude-0/x/scratchpad";
  for (const c of ["cp src/a.ts /tmp/x.ts", `cp linketto/src/x.ts ${sc}/route.ts`, "touch /tmp/a", "rm -f /tmp/a /tmp/b", "rsync -av src/ /tmp/s/", "chmod +x /tmp/run.sh"])
    assert.equal(mutationReason(c, { scratch: sc }), "", c);
  for (const c of ["cp /tmp/a src/a.ts", "mv src/a /tmp/a", "rm -rf /tmp/../home/user/Few-few/src", "ln -s /home/user/Few-few /tmp/r",
    "cp a /tmp/x && rm src/b", "cp -t /tmp src/a", "touch src/new.ts", `cp a ${sc}/../../../home/x`, "chmod +x src/run.sh", "rm"])
    assert.match(mutationReason(c, { scratch: sc }), /пише\/трие/, c);
});
