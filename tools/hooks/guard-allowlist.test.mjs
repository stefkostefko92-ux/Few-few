// guard-allowlist.test.mjs — агент с Bash по позволен списък пуска САМО изброените команди (наложено, не поискано).
// Решение на собственика (23.11.2026): Преводача получава Bash само за детерминистичните i18n проверки.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOW, allowReason } from "../../.claude/hooks/guard-allowlist.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(ROOT, ".claude", "hooks", "guard-allowlist.mjs");
const SCRATCH = "/tmp/claude-0/proj/sess/scratchpad";
const run = (agent_type, command, extra = {}) => spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", agent_type, tool_input: { command }, scratchpad_dir: SCRATCH, ...extra }),
  env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }, encoding: "utf8",
});

test("Преводача е в позволения списък; списъкът живее в куката (под guard-self), не в дефиницията", () => {
  assert.ok(ALLOW.prevodach, "prevodach има позволен списък");
  assert.ok(!ALLOW.kodadjiyata);
});

test("позволени: трите i18n скрипта с изброени файлове; изход само към /tmp или scratchpad-а", () => {
  for (const c of [
    "node tools/i18n/check-parity.mjs linketto/messages/bg.json linketto/messages/en.json linketto/messages/it.json",
    "node tools/i18n/glossary-check.mjs it medqr/locales/it.json",
    "node tools/i18n/pseudo.mjs medqr/locales/en.json > /tmp/pseudo.json",
    `node tools/i18n/pseudo.mjs medqr/locales/en.json > ${SCRATCH}/pseudo.json`,
    "  node tools/i18n/check-parity.mjs a.json b.json  ",
  ]) assert.equal(allowReason("prevodach", c, { scratch: SCRATCH }), "", c);
});

test("отказани: всичко извън списъка, верижни команди, субституции, кавички, пътища навън и пренасочване в репото", () => {
  for (const c of [
    "curl https://example.com",
    "rm -rf linketto/messages",
    "node -e \"require('fs').writeFileSync('x','y')\"",
    "node --import ./x.mjs tools/i18n/check-parity.mjs a.json",
    "node tools/agents/oversee.mjs",
    "node tools/i18n/../agents/oversee.mjs",
    "node tools/i18n/nyama.mjs a.json",
    "node tools/i18n/check-parity.mjs a.json; rm -rf x",
    "node tools/i18n/check-parity.mjs a.json && curl x",
    "node tools/i18n/check-parity.mjs a.json | sh",
    "node tools/i18n/check-parity.mjs $(cat list)",
    "node tools/i18n/check-parity.mjs `cat list`",
    "node tools/i18n/check-parity.mjs \"a b.json\"",
    "node tools/i18n/check-parity.mjs ../../etc/passwd",
    "node tools/i18n/check-parity.mjs ~/.ssh/id_rsa",
    "node tools/i18n/check-parity.mjs linketto/messages/*.json",
    "node tools/i18n/pseudo.mjs en.json > linketto/messages/en.json",
    "node tools/i18n/pseudo.mjs en.json > /tmp/../repo/x.json",
    "node tools/i18n/pseudo.mjs en.json >> /tmp/x.json 2>&1",
    "LC_ALL=C node tools/i18n/check-parity.mjs a.json",
    "npx prettier --write linketto/messages/en.json",
    "cd linketto && node ../tools/i18n/check-parity.mjs a.json",
    "node tools/i18n/check-parity.mjs a.json\nrm -rf x",
    "node tools/i18n/check-parity.mjs --eval=x a.json",
    "",
  ]) assert.notEqual(allowReason("prevodach", c, { scratch: SCRATCH }), "", JSON.stringify(c));
});

test("CLI: Преводача — позволеното минава (0), останалото спира (2) с причина; другите агенти не се засягат", () => {
  assert.equal(run("prevodach", "node tools/i18n/check-parity.mjs a.json b.json").status, 0);
  const r = run("prevodach", "curl https://example.com");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /guard-allowlist/);
  assert.match(r.stderr, /check-parity/, "причината казва какво Е позволено");
  assert.equal(run("kodadjiyata", "curl https://example.com").status, 0, "не е в списъка → тази кука не съди");
  assert.equal(run("", "curl https://example.com").status, 0, "главната сесия не се съди тук");
});

test("CLI: PowerShell и Monitor за агент от списъка се съдят по същото правило; счупен вход спира", () => {
  assert.equal(run("prevodach", "Get-Content x", { tool_name: "PowerShell" }).status, 2);
  assert.equal(run("prevodach", "node tools/i18n/check-parity.mjs a.json", { tool_name: "Monitor" }).status, 0);
  const bad = spawnSync(process.execPath, [HOOK], { input: "{не е json", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }, encoding: "utf8" });
  assert.equal(bad.status, 0, "без payload няма агент — нищо за съдене");
  assert.equal(run("prevodach", undefined, { tool_input: {} }).status, 2, "агент от списъка без команда → спира");
});

// Разбивача, 23.11.2026 (N2): аргументът можеше да е файл с тайни (скрит сегмент, .pem, credentials.json), а pseudo.mjs
// изписва целия файл в контекста на агент с WebFetch. Аргументите са само локали: код на език или видим .json без
// тайно име.
test("аргументите са само локали: код на език или видим .json без тайно име", () => {
  for (const c of [
    "node tools/i18n/check-parity.mjs linketto/messages/bg.json linketto/messages/en.json",
    "node tools/i18n/glossary-check.mjs it medqr/locales/it.json",
    "node tools/i18n/pseudo.mjs adblock/_locales/en/messages.json > /tmp/p.json",
  ]) assert.equal(allowReason("prevodach", c, { scratch: SCRATCH }), "", c);
  for (const c of [
    "node tools/i18n/pseudo.mjs linketto/.env",
    "node tools/i18n/pseudo.mjs linketto/.env.production",
    "node tools/i18n/pseudo.mjs .config/x.json",
    "node tools/i18n/pseudo.mjs vps/credentials.json",
    "node tools/i18n/pseudo.mjs firebase-adminsdk-x.json",
    "node tools/i18n/pseudo.mjs certs/server.pem",
    "node tools/i18n/pseudo.mjs secrets.json",
    "node tools/i18n/pseudo.mjs deploy/service-account.json",
    "node tools/i18n/pseudo.mjs api-token.json",
    "node tools/i18n/pseudo.mjs private-key.json",
    "node tools/i18n/pseudo.mjs linketto/messages/en.txt",
    "node tools/i18n/glossary-check.mjs de medqr/locales/de.json",
  ]) assert.notEqual(allowReason("prevodach", c, { scratch: SCRATCH }), "", c);
});
