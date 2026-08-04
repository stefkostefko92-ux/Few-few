import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_SESSION_SECONDS, isRole, issueToken, readToken } from "../session";

const SECRET = "тайна-само-на-сървъра";
const NOW = 1_800_000_000_000;
const CLAIMS = { sub: "ivanov", unit: "РПУ Дупница", role: "operator" as const };

test("издаден жетон се чете обратно", async () => {
  const token = await issueToken(CLAIMS, SECRET, NOW);
  const claims = await readToken(token, SECRET, NOW);
  assert.equal(claims?.sub, "ivanov");
  assert.equal(claims?.unit, "РПУ Дупница");
  assert.equal(claims?.role, "operator");
  assert.equal(claims?.exp, Math.floor(NOW / 1000) + DEFAULT_SESSION_SECONDS);
});

test("чужда тайна не отваря жетона", async () => {
  const token = await issueToken(CLAIMS, SECRET, NOW);
  assert.equal(await readToken(token, "друга-тайна", NOW), null);
});

test("подправено съдържание не минава", async () => {
  const token = await issueToken(CLAIMS, SECRET, NOW);
  const [payload, signature] = token.split(".");
  // Някой се опитва да си повиши ролята, без да пипа подписа.
  const forged = Buffer.from(JSON.stringify({ ...CLAIMS, role: "auditor", iat: 1, exp: 9_999_999_999 }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  assert.equal(await readToken(`${forged}.${signature}`, SECRET, NOW), null);
  assert.ok(payload);
});

test("изтекъл жетон не минава", async () => {
  const token = await issueToken(CLAIMS, SECRET, NOW, 60);
  assert.ok(await readToken(token, SECRET, NOW + 59_000), "още е валиден");
  assert.equal(await readToken(token, SECRET, NOW + 61_000), null, "след срока — не");
  // Точно на секундата на изтичане също не важи.
  assert.equal(await readToken(token, SECRET, NOW + 60_000), null);
});

test("счупен вход не гърми, а връща null", async () => {
  for (const bad of ["", "няма-точка", "a.b.c", "....", "не.base64"]) {
    assert.equal(await readToken(bad, SECRET, NOW), null, `трябваше да е null: ${bad}`);
  }
  assert.equal(await readToken(undefined, SECRET, NOW), null);
  assert.equal(await readToken(null, SECRET, NOW), null);
});

test("липсваща тайна не отваря нищо", async () => {
  const token = await issueToken(CLAIMS, SECRET, NOW);
  assert.equal(await readToken(token, "", NOW), null, "празна тайна не бива да е валидна");
});

test("непозната роля се отхвърля", async () => {
  // Ролята се проверява при четене, не само при издаване.
  const token = await issueToken({ ...CLAIMS, role: "админ" as never }, SECRET, NOW);
  assert.equal(await readToken(token, SECRET, NOW), null);
  assert.ok(isRole("auditor"));
  assert.ok(!isRole("админ"));
});

