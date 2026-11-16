import test from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_ERRORS, parseAccountForm, sessionStamp } from "@/lib/account-core";
import { adminSeedPlan } from "../../../prisma/admin-seed-core";

// Спецификация („Моят профил“, собственикът 16.11.2026: „искам да сменя мастър
// паролата и емайла“):
//  1. всеки влязъл сменя СВОЯ имейл и/или парола;
//  2. всяка промяна иска сегашната парола (проверява сървърът — bcrypt);
//  3. имейлът — валиден, с малки букви, уникален (уникалността — сървърът);
//  4. новата парола — 10–200 знака, повторена еднакво, различна от сегашната;
//  5. смяна на паролата прекратява ВСИЧКИ други сесии (печат в токена от хеша);
//  6. --seed не създава втори администратор от .env, щом вече има администратор.

const base = { email: "admin@primer.bg", currentPassword: "Stara-Parola-1", newPassword: "", newPassword2: "" };
const me = { email: "admin@primer.bg" };

test("профил: без сегашна парола — нищо", () => {
  const r = parseAccountForm({ ...base, currentPassword: "", email: "nov@primer.bg" }, me);
  assert.ok(!r.ok && r.errors.currentPassword === ACCOUNT_ERRORS.currentPassword);
});

test("профил: смяна само на имейла — с малки букви, без интервали", () => {
  const r = parseAccountForm({ ...base, email: "  Nov.Admin@Primer.BG " }, me);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.email, "nov.admin@primer.bg");
    assert.equal(r.emailChanged, true);
    assert.equal(r.newPassword, null);
  }
});

test("профил: невалиден имейл (и опити за вмъкване) се отказват", () => {
  for (const email of ["", "bez-kliomba", "a@b", "a@b.bg\r\nBcc: x@y.z", "a@b.bg, c@d.bg", "x".repeat(250) + "@b.bg"]) {
    const r = parseAccountForm({ ...base, email }, me);
    assert.ok(!r.ok && r.errors.email === ACCOUNT_ERRORS.email, JSON.stringify(email));
  }
});

test("профил: новата парола — 10–200 знака, повторена, различна от сегашната", () => {
  const ok = parseAccountForm({ ...base, newPassword: "Nova-Parola-2026", newPassword2: "Nova-Parola-2026" }, me);
  assert.ok(ok.ok && ok.newPassword === "Nova-Parola-2026" && !ok.emailChanged);

  const short = parseAccountForm({ ...base, newPassword: "kratka", newPassword2: "kratka" }, me);
  assert.ok(!short.ok && short.errors.newPassword === ACCOUNT_ERRORS.newPasswordLength);

  const long = "x".repeat(201);
  const tooLong = parseAccountForm({ ...base, newPassword: long, newPassword2: long }, me);
  assert.ok(!tooLong.ok && tooLong.errors.newPassword === ACCOUNT_ERRORS.newPasswordLength);

  const mismatch = parseAccountForm({ ...base, newPassword: "Nova-Parola-2026", newPassword2: "Nova-Parola-2027" }, me);
  assert.ok(!mismatch.ok && mismatch.errors.newPassword2 === ACCOUNT_ERRORS.newPassword2);

  const same = parseAccountForm({ ...base, newPassword: "Stara-Parola-1", newPassword2: "Stara-Parola-1" }, me);
  assert.ok(!same.ok && same.errors.newPassword === ACCOUNT_ERRORS.newPasswordSame);
});

test("профил: без нищо ново — казва го, не записва", () => {
  const r = parseAccountForm({ ...base, email: "ADMIN@primer.bg" }, me);
  assert.ok(!r.ok && r.errors._ === ACCOUNT_ERRORS.nothing);
});

test("сесии: печатът зависи от хеша на паролата и от тайната; не издава хеша", () => {
  const secret = "s".repeat(40);
  const h1 = "$2a$11$abcdefghijklmnopqrstuuJ8h3Q9y5o2m7rWm5G7lqv1aB2cD3eF4";
  const h2 = "$2a$11$zyxwvutsrqponmlkjihgfeJ8h3Q9y5o2m7rWm5G7lqv1aB2cD3eF4";
  const a = sessionStamp(secret, h1);
  assert.equal(a, sessionStamp(secret, h1), "същата парола — същият печат");
  assert.notEqual(a, sessionStamp(secret, h2), "нова парола — нов печат (старите сесии падат)");
  assert.notEqual(a, sessionStamp("o".repeat(40), h1), "друга тайна — друг печат");
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(!h1.includes(a) && !a.includes("$2a$"));
});

test("seed: администраторът от .env — обнови, ако го има; създай само ако няма НИКАКЪВ администратор", () => {
  assert.equal(adminSeedPlan({ existsByEmail: true, adminCount: 1 }), "update");
  assert.equal(adminSeedPlan({ existsByEmail: false, adminCount: 0 }), "create");
  // Имейлът е сменен от „Моят профил“ → в .env е старият; втори админ със старата парола — НЕ.
  assert.equal(adminSeedPlan({ existsByEmail: false, adminCount: 1 }), "skip");
});
