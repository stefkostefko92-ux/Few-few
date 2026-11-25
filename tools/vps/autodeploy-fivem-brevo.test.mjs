// autodeploy-fivem-brevo.test.mjs — FiveM праща имейли само през Brevo (собственикът, 25.11.2026).
//
// Преглед на PR #489 (VPS-аджията, Правния — Medium): на живия сървър .env носи RESEND_API_KEY.
// Нов код без BREVO_API_KEY спира ТИХО уведомленията по чл. 16/17 DSA, а health остава зелен.
// Затова без ключ FiveM НЕ се обновява: върви предишният release, който още праща писма.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = readFileSync(join(root, "deploy", "autodeploy.sh"), "utf8");
const fn = (name) => {
  const m = script.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `функцията ${name} съществува`);
  return m[0];
};

test("fivem_has_brevo_key: само непразен ключ; празен, в празни кавички или само RESEND — не", () => {
  const dir = mkdtempSync(join(tmpdir(), "fvb-"));
  try {
    const cases = [
      ["BREVO_API_KEY=xkeysib-abc\n", 0],
      ['BREVO_API_KEY="xkeysib-abc"\n', 0],
      ["X=1\nBREVO_API_KEY=xkeysib-abc\nY=2\n", 0],
      ["BREVO_API_KEY=\n", 1],
      ['BREVO_API_KEY=""\n', 1],
      ["BREVO_API_KEY=''\n", 1],
      ["RESEND_API_KEY=re_abc\n", 1],
      ["#BREVO_API_KEY=xkeysib-abc\n", 1],
    ];
    for (const [body, want] of cases) {
      const f = join(dir, ".env");
      writeFileSync(f, body);
      const r = spawnSync("bash", ["-c", `${fn("fivem_has_brevo_key")}\nfivem_has_brevo_key "${f}"`]);
      assert.equal(r.status, want, JSON.stringify(body));
    }
    const r = spawnSync("bash", ["-c", `${fn("fivem_has_brevo_key")}\nfivem_has_brevo_key "${join(dir, "nyama")}"`]);
    assert.equal(r.status, 1, "липсващ .env");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("deploy_fivem спира ПРЕДИ да пипне release-а и контейнерите, ако няма ключ за Brevo", () => {
  const body = fn("deploy_fivem");
  const guard = body.indexOf("fivem_has_brevo_key");
  assert.ok(guard > 0, "проверката е в deploy_fivem");
  for (const after of ['ln -sfnT "$FIVEM_STATE_DIR/.env"', "bash scripts/deploy.sh"]) {
    const i = body.indexOf(after);
    assert.ok(i > guard, `${after} е след проверката`);
  }
  assert.match(body.slice(guard, guard + 600), /deploy_failed=1; return/, "отказът се отчита като провал, не като успех");
});
