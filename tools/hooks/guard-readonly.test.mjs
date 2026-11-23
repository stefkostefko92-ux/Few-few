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

test("съди се по думите на обвивката: път, кавички, блокове, обвивки, sh -c (проба 08.11.2026, 2)", () => {
  for (const c of [
    "/usr/bin/sed -i x a.ts", "\\sed -i x a.ts", '"sed" -i x a.ts', "/usr/bin/git commit -m x", "g''it commit -m x",
    "{ sed -i x a; }", "if true; then sed -i x a; fi", "while read f; do rm \"$f\"; done < list",
    "timeout -s KILL 30 sed -i x a", "ionice -c3 sed -i x a", "chrt 1 sed -i x a", "taskset -c 0-3 git push",
    "doas sed -i x a", "busybox sed -i x a", "builtin command rm a", "setsid rm a.ts",
    "bash -c 'sed -i x a.ts'", "sh -c \"git commit -m x\"", "echo $(rm a.ts)", "x=`git reset --hard`",
    "echo $(/usr/bin/rm a.ts)", "x=`\\sed -i y a.ts`",
    "find . -name '*.bak' -delete", "find src -exec rm {} +", "rm \"src/a b.ts\"", "ionice -c 2 -n 7 env X=1 npm install y",
  ]) assert.ok(mutationReason(c), `трябва да се хване: ${c}`);
  for (const c of [
    "grep -rn \"rm -rf\" src", "echo 'git commit'", "rg -n 'sed -i' .", "git log --format='%s rm x' -n 5",
    "timeout -s KILL 30 rg foo", "ionice -c3 grep -r x .", "/usr/bin/git status", "bash -c 'git diff --stat'",
    "find . -name '*.ts' -print", "busybox wc -l a", "FOO=1 rm /tmp/x", "sh -c 'cp a /tmp/b'",
  ]) assert.equal(mutationReason(c), "", `не бива да се хване: ${c}`);
});

test("присвояване или обвивка пред командата не я крие (проба 08.11.2026)", () => {
  for (const c of [
    "LC_ALL=C sed -i s/a/b/ a.ts", "env LC_ALL=C sed -i s/a/b/ a.ts", 'A="x y" git commit -m x', "env -u X git add -A",
    "timeout 30 sed -i s/a/b/ a.ts", "nice -n 5 git push", "command rm a.ts", "xargs -I{} rm {}", "nohup npm install x",
    "time git commit -m x", "stdbuf -oL sed -i x a", "FOO=1 rm -f src/a.ts", "sudo -u bob git reset --hard", "cd x && FOO=1 touch y",
  ]) assert.ok(mutationReason(c), `трябва да се хване: ${c}`);
  for (const c of ["LC_ALL=C grep -rn foo src", "timeout 30 rg foo", "env FOO=1 node --test tools", "time git status", "FOO=1 rm /tmp/x"])
    assert.equal(mutationReason(c), "", `не бива да се хване: ${c}`);
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

// Регресия 2026-11-15 (учебна сесия 7 на Прониквача): цел в кавички — `cp "…/tool-results/x.pdf" "<scratch>/dl/"` —
// се спираше, защото кавичките оставаха в аргумента и пътят не започваше със scratchpad-а. Кавичките се махат;
// неразгърната променлива в кавички и „..“ остават спрени.
test("файлови команди: цел в кавички към scratchpad/tmp минава, към репото — не", () => {
  const sc = "/tmp/claude-0/x/scratchpad";
  for (const c of [`cp "/root/.claude/projects/p/tool-results/x.pdf" "${sc}/dl/"`, `cp a.pdf '/tmp/dl/a.pdf'`])
    assert.equal(mutationReason(c, { scratch: sc }), "", c);
  for (const c of [`cp /tmp/a "src/a.ts"`, `cp a "$TARGET"`, `cp a "${sc}/../../../home/x"`])
    assert.match(mutationReason(c, { scratch: sc }), /пише\/трие/, c);
});

// Разбивача, 23.11.2026 (фалшив позитив): `D=<scratch>/al; cat > $D/probe.mjs` се спираше — пазачът не разгъва
// променливи. Разгъва се САМО недвусмислено: точно едно буквално присвояване на горно ниво преди употребата, без друго
// свързване на името (read, for, +=, unset, declare…), не в единични кавички. Всичко друго остава спряно.
test("променлива с буквален временен път от същата команда се разгъва; двусмислената остава спряна", () => {
  const sc = "/tmp/claude-0/x/scratchpad";
  for (const c of [
    `D=${sc}/al; mkdir -p $D; cat > $D/probe.mjs <<'EOF'\nconsole.log(1)\nEOF`,
    `export D="${sc}/al"; cp README.md "$D/"`,
    "D=/tmp/x && echo hi > ${D}/out.txt",
    `OUT=${sc}/r.json; node tools/agents/oversee.mjs > $OUT`,
    `D=${sc}; D=${sc}; touch $D/a`,
  ]) assert.equal(mutationReason(c, { scratch: sc }), "", c);
  for (const c of [
    "cat > $D/x; D=/tmp/y",
    "D=/tmp/a; D=src; cat > $D/x",
    "D=/tmp/a; read D; cat > $D/x",
    "D=/tmp/a; D+=x; cat > $D/x",
    "(D=/tmp/a); cat > $D/x",
    "{ D=/tmp/a; }; cat > $D/x",
    "D=$(pwd); cat > $D/x",
    "D=`pwd`; cat > $D/x",
    "D=src; cat > $D/x",
    "D=/tmp/a; for D in src lib; do cat > $D/x; done",
    "D=/tmp/a; unset D; cat > $D/x",
    "D=/tmp/a; declare D=src; cat > $D/x",
    "D=/tmp/a; sh -c 'cat > $D/x'",
    "D=/tmp/../repo; cat > $D/x",
    "DD=/tmp/a; cat > $D/x",
  ]) assert.notEqual(mutationReason(c, { scratch: sc }), "", c);
});

test("съобщението при неразгъната променлива подсказва пълния път", () => {
  assert.match(mutationReason("cat > $X/f.txt", { scratch: "/s/pad" }), /пълния път/);
});

// Съществуваща дупка, хваната при поправката на променливите (23.11.2026): `sh -c 'cat > src/x'` минаваше — codeView
// неутрализира съдържанието на единични кавички (`>` → `_`), а вътрешният низ на sh -c се четеше от този изглед.
// guard-dangerous и guard-self четат низа от суровата команда; guard-readonly вече също.
test("пренасочване вътре в sh -c '…' се вижда; heredoc към python остава данни", () => {
  for (const c of ["sh -c 'cat > src/x'", "bash -lc 'echo hi >> README.md'", "sh -c 'tee src/a.txt < /dev/null'"])
    assert.notEqual(mutationReason(c, { scratch: "/s/pad" }), "", c);
  for (const c of ["bash -lc 'echo hi > /tmp/x'", "python3 - <<'EOF'\nprint(\"sh -c 'cat > src/x'\")\nEOF", "sh -c 'node --test tools/hooks/guard-readonly.test.mjs'"])
    assert.equal(mutationReason(c, { scratch: "/s/pad" }), "", c);
});
