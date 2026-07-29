// secret-scan.test.mjs — ТВЪРДИЯТ гейт за изтекли тайни нямаше нито един тест.
//
// Той е единственият слой в `security.yml`, който е задължителен (gitleaks и dependency-review са
// best-effort). Регресия в него значи, че тайна може да влезе в репото при зелено CI — и никой
// няма да разбере. Тестваме го като ПОДПРОЦЕС: така проверяваме реалното поведение и изходния код,
// без да рефакторираме сигурностно-критичен файл.
//
// ВАЖНО: фалшивите тайни се СГЛОБЯВАТ по време на изпълнение, никога не са литерали в сорса —
// иначе самият тест би бил находка (законът в _shared.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOOL = join(ROOT, "tools", "security", "secret-scan.mjs");

function scan(content, name = "probe.txt") {
  const dir = mkdtempSync(join(tmpdir(), "secscan-"));
  const f = join(dir, name);
  writeFileSync(f, content);
  try {
    execFileSync(process.execPath, [TOOL, f], { encoding: "utf8", stdio: "pipe" });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout || "") + String(e.stderr || "") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Сглобяване от части — нито един ред тук не е валиден ключ сам по себе си.
const A = (...p) => p.join("");

test("чист файл минава (изход 0)", () => {
  assert.equal(scan("const port = 3000;\nconst name = 'kebab';\n").code, 0);
});

test("частен ключ се хваща", () => {
  const pem = A("-----BEGIN ", "PRIVATE", " KEY-----\nMIIEv", "QIBADAN\n-----END ", "PRIVATE", " KEY-----");
  const r = scan(pem);
  assert.equal(r.code, 1, "трябва да е находка");
  assert.match(r.out, /Частен ключ/);
});

test("AWS Access Key ID се хваща", () => {
  const key = A("AKIA", "ABCDEFGHIJ", "KLMNOP");
  const r = scan(`const id = "${key}";`);
  assert.equal(r.code, 1);
  assert.match(r.out, /AWS/);
});

test("Stripe live secret се хваща", () => {
  const key = A("sk", "_live_", "0123456789abcdefghij");
  const r = scan(`STRIPE=${key}`);
  assert.equal(r.code, 1);
  assert.match(r.out, /Stripe/);
});

test("Google API key се хваща", () => {
  const key = A("AIza", "SyA", "0123456789abcdefghijklmnopqrstuv");
  const r = scan(`key: ${key}`);
  assert.equal(r.code, 1);
});

test("тестов Stripe ключ (sk_test_) НЕ е находка — иначе гейтът става неизползваем", () => {
  const key = A("sk", "_test_", "0123456789abcdefghij");
  assert.equal(scan(`STRIPE=${key}`).code, 0, "test ключовете са публични по дизайн");
});

test("обикновени думи, приличащи на ключ, не вдигат тревога (нула фалшиви)", () => {
  for (const s of ["password = process.env.PASSWORD", "const apiKey = config.apiKey", "AKIA е префикс на AWS ключ"])
    assert.equal(scan(s).code, 0, `не бива да е находка: ${s}`);
});
