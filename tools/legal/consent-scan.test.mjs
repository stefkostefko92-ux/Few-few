// consent-scan.test.mjs + a11y — тестове за класа „зелено, защото сме слепи" в правните гейтове.
//
// Дефектът, който фиксират: провален goto се гълташе → нула бисквитки/заявки/нарушения →
// 🟢 присъда върху страница, КОЯТО НЕ СЕ Е ЗАРЕДИЛА, с exit 0. GDPR/EAA гейт, зелен върху
// about:blank. Присъдата е изнесена като чиста функция точно за да може ТОЗИ тест да съществува.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verdict as consentVerdict, ESSENTIAL } from "./consent-scan.mjs";
import { verdict as a11yVerdict } from "./a11y.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const run = (rel, args) => spawnSync(process.execPath, [join(HERE, rel), ...args],
  { encoding: "utf8", timeout: 60000 });

// ── consent-scan: присъдата ─────────────────────────────────────────────────────────
test("незаредена страница НИКОГА не е зелена (code 2, не 0)", () => {
  const v = consentVerdict({ loaded: false, cookies: [], thirdPartyKeys: [] });
  assert.equal(v.code, 2);
  assert.match(v.label, /НЕ е зелено/);
});

test("вероятен трекер преди съгласие → находка (code 1)", () => {
  const v = consentVerdict({ loaded: true, cookies: [], thirdPartyKeys: ["googletagmanager.com  ⚠ вероятен трекер/3rd-party"] });
  assert.equal(v.code, 1);
});

test("неесенциална бисквитка преди съгласие → находка; есенциалните не вдигат тревога", () => {
  assert.equal(consentVerdict({ loaded: true, cookies: [{ name: "_ga" }], thirdPartyKeys: [] }).code, 1);
  assert.equal(consentVerdict({ loaded: true, cookies: [{ name: "PHPSESSID" }, { name: "csrf_token" }, { name: "cookie_consent" }], thirdPartyKeys: [] }).code, 0);
});

test("ESSENTIAL хваща класическите сесийни имена (PHPSESSID беше стар пропуск)", () => {
  for (const ok of ["PHPSESSID", "JSESSIONID", "connect.sid".replace(".", "_sessid_"), "XSRF-TOKEN", "zbd_lang", "locale"])
    assert.ok(ESSENTIAL.test(ok), `${ok} трябва да е есенциална`);
  for (const bad of ["_ga", "_fbp", "ajs_anonymous_id", "hubspotutk"])
    assert.ok(!ESSENTIAL.test(bad), `${bad} НЕ трябва да минава за есенциална`);
});

test("чиста заредена страница → 0", () => {
  assert.equal(consentVerdict({ loaded: true, cookies: [], thirdPartyKeys: ["cdn.example.org"] }).code, 0);
});

// ── a11y: присъдата ─────────────────────────────────────────────────────────────────
test("a11y: незаредена страница → 2, не „0 нарушения = зелено\"", () => {
  assert.equal(a11yVerdict({ loaded: false }).code, 2);
});

test("a11y: critical/serious → 1; само moderate/minor → 0", () => {
  assert.equal(a11yVerdict({ loaded: true, violations: [{ impact: "serious" }] }).code, 1);
  assert.equal(a11yVerdict({ loaded: true, violations: [{ impact: "moderate" }, { impact: "minor" }] }).code, 0);
});

// ── CLI договор: грешната употреба е обяснена, не е срив със стек ──────────────────
test("consent-scan: без URL и с папка вместо URL → изход 2 + употреба (без стек)", () => {
  for (const args of [[], ["/tmp/not-a-url"]]) {
    const r = run("consent-scan.mjs", args);
    assert.equal(r.status, 2, `args=${JSON.stringify(args)} → ${r.status}`);
    assert.match(r.stderr, /Употреба/);
    assert.doesNotMatch(r.stderr, /at .*\.mjs:\d+/, "стек трейс = срив, не обяснение");
  }
});

test("a11y: без URL → изход 2 + употреба", () => {
  const r = run("a11y.mjs", []);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Употреба/);
});
