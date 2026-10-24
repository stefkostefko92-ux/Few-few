import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import {
  ADMIN_LOGIN_PATH,
  SESSION_COOKIE,
  adminGuardDecision,
  isAdminPath,
} from "@/lib/admin-guard";

// Пазачът на /admin (src/middleware.ts → @/lib/admin-guard).

const SECRET = "тестова-тайна-за-подписа-на-сесията-0123456789";
const OTHER = "чужда-тайна-със-същата-дължина-abcdefghijklmnop";
const key = (s: string) => new TextEncoder().encode(s);

async function sign(secret: string, opts: { alg?: string; exp?: string | number } = {}) {
  const jwt = new SignJWT({ sub: "u1", role: "ADMIN" })
    .setProtectedHeader({ alg: opts.alg ?? "HS256" })
    .setIssuedAt();
  jwt.setExpirationTime(opts.exp ?? "1h");
  return jwt.sign(key(secret));
}

function b64url(o: object): string {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}

const decide = (pathname: string, token: string | undefined, secret: string | undefined = SECRET) =>
  adminGuardDecision({ pathname, token, secret });

test("без бисквитка → към входа с ?next=<пътя>", async () => {
  assert.deepEqual(await decide("/admin", undefined), { allow: false, next: "/admin" });
  assert.deepEqual(await decide("/admin/pomeni", undefined), { allow: false, next: "/admin/pomeni" });
  assert.deepEqual(await decide("/admin", ""), { allow: false, next: "/admin" });
});

test("валиден HS256 токен с нашата тайна → пуска", async () => {
  const t = await sign(SECRET);
  assert.deepEqual(await decide("/admin", t), { allow: true });
  assert.deepEqual(await decide("/admin/reklami", t), { allow: true });
});

test("токен с чужда тайна → към входа", async () => {
  const t = await sign(OTHER);
  assert.deepEqual(await decide("/admin/pomeni", t), { allow: false, next: "/admin/pomeni" });
});

test("изтекъл токен → към входа", async () => {
  const t = await sign(SECRET, { exp: Math.floor(Date.now() / 1000) - 60 });
  assert.equal((await decide("/admin", t)).allow, false);
});

test("alg=none и HS512 не минават (само HS256)", async () => {
  const none = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: "u1", role: "ADMIN" })}.`;
  assert.equal((await decide("/admin", none)).allow, false);
  const hs512 = await sign(SECRET, { alg: "HS512" });
  assert.equal((await decide("/admin", hs512)).allow, false);
  assert.equal((await decide("/admin", "не-е-jwt")).allow, false);
});

test("без AUTH_SECRET → към входа дори с бисквитка (fail closed)", async () => {
  const t = await sign(SECRET);
  assert.deepEqual(await adminGuardDecision({ pathname: "/admin", token: t, secret: undefined }), {
    allow: false,
    next: "/admin",
  });
  assert.deepEqual(await decide("/admin", t, ""), { allow: false, next: "/admin" });
});

test("входът минава без сесия — без кръг на пренасочване", async () => {
  assert.equal(ADMIN_LOGIN_PATH, "/admin/login");
  assert.deepEqual(await decide(ADMIN_LOGIN_PATH, undefined), { allow: true });
  assert.deepEqual(
    await adminGuardDecision({ pathname: ADMIN_LOGIN_PATH, token: undefined, secret: undefined }),
    { allow: true },
  );
  // Само точно входът — не и „подпътища“ под него.
  assert.equal((await decide("/admin/login/x", undefined)).allow, false);
});

test("isAdminPath: само /admin и /admin/…", () => {
  assert.equal(isAdminPath("/admin"), true);
  assert.equal(isAdminPath("/admin/"), true);
  assert.equal(isAdminPath("/admin/pomeni"), true);
  assert.equal(isAdminPath("/administrator"), false);
  assert.equal(isAdminPath("/admin-x"), false);
  assert.equal(isAdminPath("/administrativni"), false);
  assert.equal(isAdminPath("/"), false);
});

test("middleware.ts ползва пазача и matcher-ът хваща /admin", () => {
  const src = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
  assert.match(src, /if \(isAdminPath\(pathname\)\) return guardAdmin\(req\);/);
  assert.match(src, /adminGuardDecision\(/);
  assert.match(src, /req\.cookies\.get\(SESSION_COOKIE\)/);
  assert.match(src, /"\/admin\/:path\*"/);
  assert.equal(SESSION_COOKIE, "zbd_session");
  // Същата бисквитка като в auth.ts (там се подписва сесията).
  const auth = readFileSync(join(process.cwd(), "src/lib/auth.ts"), "utf8");
  assert.match(auth, /const COOKIE = "zbd_session";/);
});
