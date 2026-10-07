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

// ── 2026-10-06: двойка имейл + парола (входни данни) ──────────────────────────────────────────────
// Инцидентът: поука записа цял вход за админа на клиентски сайт във вида `<имейл>/<Име><година>!,` —
// нито един шаблон не я позна (всички търсеха ПРОВАЙДЪР-ключове), и тя стигна до паметта, таблото и
// артефакта. Стойностите тук са измислени и се сглобяват по време на изпълнение.
const EM = (local, dom) => A(local, "@", dom);
const PW = A("Mari", "na", "2025", "!");
const TP_PAIRS = {
  "формата от инцидента (имейл/парола,)": `default admin creds ${EM("info", "acme-shop.it")}/${PW}, а не env`,
  "имейл : парола": `вход ${EM("admin", "acme-shop.bg")} : ${PW}`,
  "имейл | парола (таблица)": `| ${EM("office", "acme-shop.bg")} | ${PW} |`,
  "login: … password: …": `login: ${EM("admin", "acme-shop.bg")} password: ${PW}`,
  "JSON с email/password": `{"email":"${EM("root", "acme-shop.bg")}","password":"${A("Xk9", "-pQ2", "-vL7")}"}`,
  "парола: преди имейла": `парола: ${PW} за ${EM("admin", "acme-shop.bg")}`,
};
for (const [what, line] of Object.entries(TP_PAIRS)) {
  test(`двойка имейл+парола се хваща: ${what}`, () => {
    const r = scan(`${line}\n`);
    assert.equal(r.code, 1, `трябва да е находка: ${what}`);
    assert.match(r.out, /Имейл \+ парола/);
    assert.doesNotMatch(r.out, new RegExp(PW.replace(/[!]/g, "\\!")), "стойността НЕ се печата");
  });
}

test("двойка имейл+парола: близко до нула фалшиви (git/scp/mailto/URL/документация/тестови домейни)", () => {
  const fp = [
    A("git@", "github.com:owner/repo.git"),
    A("git@", "github.com:Owner2024/Repo2024.git"),
    A("scp root@", "host.example.bg:/srv/app/release2024.tar"),
    A("scp deploy@", "server.bg:/opt/few-few/releases/20261006T1200 ."),
    A("<a href=\"mailto:", "info@acme-shop.bg\">пишете ни</a>"),
    A("https://user@", "host.bg/path/Report2024.pdf"),
    A("https://mastodon.social/@user/", "113456789012"),
    A("пиши на user@", "example.com / документация"),
    A("test@", "example.com / Passw0rd123"), // RFC 2606 резервиран домейн = не е реален акаунт
    A("admin@", "shop.test : Secret2024!"),
    A("info@", "acme-shop.bg / +359888123456"),
    A("author@", "acme-shop.bg: 2026-10-06T12:00:00Z"),
    A("dev@", "acme-shop.bg: a1b2c3d4e5f6a7b8"),
    A("npm i lodash@", "4.17.21/dist"),
    A("const email = user.email, password = ", "req.body.password"),
    A("email: ${EMAIL}, password: ", "${ADMIN_PASSWORD}"),
  ];
  for (const s of fp) assert.equal(scan(s).code, 0, `не бива да е находка: ${s.replace(/\S+@/, "…@")}`);
});

test("обикновени думи, приличащи на ключ, не вдигат тревога (нула фалшиви)", () => {
  for (const s of ["password = process.env.PASSWORD", "const apiKey = config.apiKey", "AKIA е префикс на AWS ключ"])
    assert.equal(scan(s).code, 0, `не бива да е находка: ${s}`);
});
