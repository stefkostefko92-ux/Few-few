// guard-engagement.test.mjs — мостът хук↔ограда през харнеса (exit 2 = блок).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync as genKey, sign as edSign } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decide, inputFor } from "../../.claude/hooks/guard-engagement.mjs";
import { canonicalize } from "../security/engagement.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(ROOT, ".claude", "hooks", "guard-engagement.mjs");
const run = (tool_name, tool_input, env = {}) => spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name, tool_input }),
  env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env }, encoding: "utf8",
});

test("нормална работа минава (exit 0)", () => {
  assert.equal(run("Bash", { command: "curl -s https://github.com/a/b" }).status, 0);
  assert.equal(run("Bash", { command: "npm ci && node x.js" }).status, 0);
  assert.equal(run("WebFetch", { url: "https://carbonstealth.eu/" }).status, 0);
});

test("тежка артилерия/DoS срещу чужд хост без ангажимент — блок (exit 2)", () => {
  const r = run("Bash", { command: "nmap -p- acme.example" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /guard-engagement/);
  assert.match(r.stderr, /319а|615-ter/);
  assert.equal(run("Bash", { command: "hping3 --flood acme.example" }).status, 2);
});

test("офанзивно срещу наш хост минава (exit 0)", () => {
  assert.equal(run("Bash", { command: "nmap -p- localhost" }).status, 0);
});

test("с подписан активен ангажимент: в обхват allow, извън обхват блок", () => {
  const kp = genKey("ed25519");
  const dir = mkdtempSync(join(tmpdir(), "eng-hook-"));
  try {
    const now = new Date();
    const win = { not_before: new Date(now - 3600e3).toISOString(), not_after: new Date(+now + 3600e3).toISOString() };
    const obj = {
      engagement_id: "cs-test", status: "active",
      client_legal_identity: { name: "ACME" }, authorizing_signatory: { name: "x", role: "CTO", authority_proof: "p" },
      authorization_ref: { doc_hash: "sha256:x" }, scope_allowlist: { hosts: ["acme.example"], cidr: [] },
      out_of_scope: { paths: ["/admin"] }, time_window: win, limits: { rate_rps: 5 }, governing_law: "BG",
    };
    const signature = edSign(null, Buffer.from(canonicalize(obj)), kp.privateKey).toString("base64");
    writeFileSync(join(dir, "e.json"), JSON.stringify({ ...obj, signature }));
    const pub = kp.publicKey.export({ type: "spki", format: "pem" });
    const env = { SECURITY_ENGAGEMENTS_DIR: dir, ENGAGEMENT_PUBKEY: pub };
    assert.equal(run("Bash", { command: "nmap -sV acme.example" }, env).status, 0, "в обхват");
    assert.equal(run("Bash", { command: "nmap other.example" }, env).status, 2, "извън обхват");
    assert.equal(run("Bash", { command: "curl https://other.example/" }, env).status, 2, "чужд хост по време на ангажимент");
    assert.equal(run("WebFetch", { url: "https://acme.example/admin/x" }, env).status, 2, "изключен път");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("нечетим вход не чупи работата (exit 0)", () => {
  const r = spawnSync(process.execPath, [HOOK], { input: "{ боклук", env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }, encoding: "utf8" });
  assert.equal(r.status, 0);
});

test("decide (чисто): извън обхват → блок, нормалното → null", () => {
  assert.equal(decide("Bash", { command: "ls -la" }, []), null);
  assert.ok(decide("Bash", { command: "sqlmap -u https://x.example/a" }, []));
  assert.deepEqual(inputFor("Bash", { command: "x" }), { tool: "Bash", command: "x", url: "" });
});
