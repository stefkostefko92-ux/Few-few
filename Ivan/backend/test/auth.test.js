"use strict";
// Вход, сесия и пазачът за произход.
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { freshDatabase, startServer, client, makeUser } = require("./harness");
const { hashPin } = require("../src/security");

let prisma;
let srv;

test.before(async () => {
  prisma = await freshDatabase();
  srv = await startServer(prisma);
  await makeUser(prisma, { nome: "Шеф", email: "boss@sklad.test", ruolo: "SUPER_ADMIN", pin: "135790" });
  await makeUser(prisma, { nome: "Гледач", email: "viewer@sklad.test", ruolo: "VIEWER", pin: "112233" });
});
test.after(async () => {
  await srv.close();
  await prisma.$disconnect();
});

test("непознат имейл и грешен ПИН дават един и същ отговор", async () => {
  const unknown = await client(srv.base).login("nobody@sklad.test", "123456");
  const wrong = await client(srv.base).login("viewer@sklad.test", "654321");
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.deepEqual(unknown.data, wrong.data);
});

test("входът слага HttpOnly SameSite=Strict бисквитка, а токен в отговора няма", async () => {
  const c = client(srv.base);
  const r = await c.login("Viewer@Sklad.test", "112233");
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.data), ["user"]);
  assert.equal(r.data.user.email, "viewer@sklad.test");
  assert.equal(r.data.user.pin, undefined);
  const cookie = r.setCookie.find((s) => s.startsWith("sklad_session="));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal((await c.call("GET", "/api/auth/me")).data.email, "viewer@sklad.test");
});

test("списък с потребители без вход няма", async () => {
  assert.equal((await client(srv.base).call("GET", "/api/auth/users")).status, 401);
  const c = client(srv.base);
  await c.login("viewer@sklad.test", "112233");
  assert.equal((await c.call("GET", "/api/auth/users")).status, 404);
  assert.equal((await c.call("GET", "/api/users")).status, 403);
});

test("без сесия няма данни; подписан с друг ключ токен не минава", async () => {
  assert.equal((await client(srv.base).call("GET", "/api/parts")).status, 401);
  const user = await prisma.user.findFirst({ where: { email: "boss@sklad.test" } });
  const forged = jwt.sign({ sub: user.id, ruolo: "SUPER_ADMIN" }, "dev-secret", { algorithm: "HS256" });
  const c = client(srv.base);
  c.cookie = `sklad_session=${forged}`;
  assert.equal((await c.call("GET", "/api/parts")).status, 401);
});

test("ролята е от базата: свалената роля важи веднага", async () => {
  const u = await makeUser(prisma, { nome: "Бивш", email: "former@sklad.test", ruolo: "SUPER_ADMIN", pin: "556677" });
  const c = client(srv.base);
  await c.login("former@sklad.test", "556677");
  assert.equal((await c.call("GET", "/api/users")).status, 200);
  await prisma.user.update({ where: { id: u.id }, data: { ruolo: "VIEWER" } });
  assert.equal((await c.call("GET", "/api/users")).status, 403);
  await prisma.user.delete({ where: { id: u.id } });
  assert.equal((await c.call("GET", "/api/parts")).status, 401);
});

test("нов ПИН прекратява старите сесии", async () => {
  const u = await makeUser(prisma, { nome: "Смяна", email: "change@sklad.test", ruolo: "VIEWER", pin: "121212" });
  const c = client(srv.base);
  await c.login("change@sklad.test", "121212");
  assert.equal((await c.call("GET", "/api/parts")).status, 200);
  await prisma.user.update({ where: { id: u.id }, data: { pin: await hashPin("343434") } });
  assert.equal((await c.call("GET", "/api/parts")).status, 401);
});

test("след 5 грешни ПИН-а и верният не пуска: 429 с Retry-After", async () => {
  await makeUser(prisma, { nome: "Цел", email: "target@sklad.test", ruolo: "VIEWER", pin: "908070" });
  for (let i = 0; i < 5; i++) assert.equal((await client(srv.base).login("target@sklad.test", "000000")).status, 401);
  const r = await client(srv.base).login("target@sklad.test", "908070");
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) > 800);
});

test("CSRF: промяна без JSON → 415, от чужд произход → 403", async () => {
  const c = client(srv.base);
  await c.login("boss@sklad.test", "135790");
  const form = await fetch(srv.base + "/api/notifications", {
    method: "DELETE",
    headers: { cookie: c.cookie, "content-type": "application/x-www-form-urlencoded" },
  });
  assert.equal(form.status, 415);
  const foreign = await c.call("DELETE", "/api/notifications", undefined, { origin: "https://evil.example" });
  assert.equal(foreign.status, 403);
  const own = await c.call("DELETE", "/api/notifications", undefined, { origin: srv.base });
  assert.equal(own.status, 200);
});

test("изходът маха бисквитката", async () => {
  const c = client(srv.base);
  await c.login("viewer@sklad.test", "112233");
  const r = await c.call("POST", "/api/auth/logout", {});
  assert.equal(r.status, 200);
  assert.equal(c.cookie, "");
  assert.equal((await c.call("GET", "/api/auth/me")).status, 401);
});
