// autodeploy-brevo-smtp.test.mjs — продуктите със SMTP пращат само през Brevo (собственикът, 25.11.2026).
//
// Защо има пазач в деплоя: на сървъра .env на продукта изрично сочи стария доставчик (Register.it,
// Aruba). Новият код назовава Brevo в политиката за поверителност; обновен без сменен .env, сайтът би
// казвал „Brevo“, а пращал през стария — неверен текст по чл. 13 ОРЗД. Затова продуктът се обновява
// едва когато SMTP_HOST в .env е smtp-relay.brevo.com (първо смени .env, после деплой).
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

test("smtp_is_brevo: само SMTP_HOST=smtp-relay.brevo.com (и с кавички, без значение от регистъра)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sib-"));
  try {
    const cases = [
      ["SMTP_HOST=smtp-relay.brevo.com\n", 0],
      ['SMTP_HOST="smtp-relay.brevo.com"\n', 0],
      ["X=1\nSMTP_HOST=SMTP-Relay.Brevo.com\n", 0],
      ["SMTP_HOST=authsmtp.register.it\n", 1],
      ["SMTP_HOST=smtps.aruba.it\n", 1],
      ["SMTP_HOST=smtp-relay.brevo.com.evil.example\n", 1],
      ["#SMTP_HOST=smtp-relay.brevo.com\n", 1],
      ["SMTP_HOST=\n", 1],
    ];
    for (const [body, want] of cases) {
      const f = join(dir, ".env");
      writeFileSync(f, body);
      const r = spawnSync("bash", ["-c", `${fn("smtp_is_brevo")}\nsmtp_is_brevo "${f}"`]);
      assert.equal(r.status, want, JSON.stringify(body));
    }
    const r = spawnSync("bash", ["-c", `${fn("smtp_is_brevo")}\nsmtp_is_brevo "${join(dir, "nyama")}"`]);
    assert.equal(r.status, 1, "липсващ .env");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("deploy_eternaltouch: без Brevo в .env не се обновява (провал, не тишина); първият .env е за Brevo", () => {
  const body = fn("deploy_eternaltouch");
  const guard = body.indexOf("smtp_is_brevo");
  assert.ok(guard > 0, "проверката е в deploy_eternaltouch");
  assert.ok(body.indexOf("bash deploy.sh") > guard, "deploy.sh е след проверката");
  assert.match(body.slice(guard, guard + 700), /deploy_failed=1; return/);
  assert.match(body, /^SMTP_HOST=smtp-relay\.brevo\.com$/m, "първият .env сочи Brevo");
  assert.doesNotMatch(body, /authsmtp\.register\.it/, "без стария доставчик в шаблона");
});
