"use strict";
// Потребители, роли, одит: без ПИН навън и без стълба до Супер Админ.
const test = require("node:test");
const assert = require("node:assert/strict");
const { freshDatabase, startServer, client, makeUser } = require("./harness");

let prisma;
let srv;
let boss;
let manager;
let viewer;

test.before(async () => {
  prisma = await freshDatabase();
  srv = await startServer(prisma);
  await prisma.role.create({ data: { id: "MANAGER", label: "Управител", canManageUsers: true, canAudit: true } });
  await prisma.role.create({ data: { id: "CONFIG", label: "Настройки", canSettings: true } });
  await makeUser(prisma, { nome: "Шеф", email: "boss@sklad.test", ruolo: "SUPER_ADMIN", pin: "135790" });
  await makeUser(prisma, { nome: "Управител", email: "manager@sklad.test", ruolo: "MANAGER", pin: "246802" });
  await makeUser(prisma, { nome: "Конфиг", email: "config@sklad.test", ruolo: "CONFIG", pin: "975310" });
  await makeUser(prisma, { nome: "Гледач", email: "viewer@sklad.test", ruolo: "VIEWER", pin: "112233" });
  boss = client(srv.base);
  manager = client(srv.base);
  viewer = client(srv.base);
  await boss.login("boss@sklad.test", "135790");
  await manager.login("manager@sklad.test", "246802");
  await viewer.login("viewer@sklad.test", "112233");
});
test.after(async () => {
  await srv.close();
  await prisma.$disconnect();
});

test("API-то никога не връща ПИН", async () => {
  const list = await boss.call("GET", "/api/users");
  assert.equal(list.status, 200);
  for (const u of list.data) assert.equal(u.pin, undefined);
  const created = await boss.call("POST", "/api/users", { nome: "Нов", email: "new@sklad.test", ruolo: "VIEWER", pin: "123987" });
  assert.equal(created.status, 200);
  assert.equal(created.data.pin, undefined);
  const stored = await prisma.user.findFirst({ where: { email: "new@sklad.test" } });
  assert.match(stored.pin, /^\$2[aby]\$12\$/);
});

test("нов ПИН под 6 цифри не се приема", async () => {
  const r = await boss.call("POST", "/api/users", { nome: "Къс", email: "short@sklad.test", ruolo: "VIEWER", pin: "1234" });
  assert.equal(r.status, 400);
});

test("само Супер Админ дава, пипа и трие Супер Админ", async () => {
  const give = await manager.call("POST", "/api/users", { nome: "Ескалация", email: "esc@sklad.test", ruolo: "SUPER_ADMIN", pin: "102938" });
  assert.equal(give.status, 403);
  const me = await prisma.user.findFirst({ where: { email: "manager@sklad.test" } });
  const self = await manager.call("PUT", `/api/users/${me.id}`, { nome: me.nome, email: me.email, ruolo: "SUPER_ADMIN" });
  assert.equal(self.status, 403);
  const theBoss = await prisma.user.findFirst({ where: { email: "boss@sklad.test" } });
  const edit = await manager.call("PUT", `/api/users/${theBoss.id}`, { nome: "x", email: theBoss.email, ruolo: "SUPER_ADMIN", pin: "999999" });
  assert.equal(edit.status, 403);
  assert.equal((await manager.call("DELETE", `/api/users/${theBoss.id}`)).status, 403);
});

test("„Потребители“ не дава роля над твоята и не пипа по-силен човек", async () => {
  await prisma.role.create({ data: { id: "OPS", label: "Операции", canSettings: true, canAudit: true, canDelete: true } });
  const ops = await makeUser(prisma, { nome: "Опс", email: "ops@sklad.test", ruolo: "OPS", pin: "314159" });
  const up = await manager.call("POST", "/api/users", { nome: "Нагоре", email: "up@sklad.test", ruolo: "OPS", pin: "271828" });
  assert.equal(up.status, 403);
  const takeover = await manager.call("PUT", `/api/users/${ops.id}`, { nome: ops.nome, email: ops.email, ruolo: "OPS", pin: "161803" });
  assert.equal(takeover.status, 403);
  const demote = await manager.call("PUT", `/api/users/${ops.id}`, { nome: ops.nome, email: ops.email, ruolo: "VIEWER", pin: "161803" });
  assert.equal(demote.status, 403, "по-силен човек не се сваля и не му се сменя ПИН-ът");
  assert.equal((await manager.call("DELETE", `/api/users/${ops.id}`)).status, 403);
  const down = await manager.call("POST", "/api/users", { nome: "Надолу", email: "down@sklad.test", ruolo: "VIEWER", pin: "141421" });
  assert.equal(down.status, 200);
  const promote = await manager.call("PUT", `/api/users/${down.data.id}`, { nome: "Надолу", email: "down@sklad.test", ruolo: "OPS" });
  assert.equal(promote.status, 403, "никого не качваш над своите права");
  assert.equal((await client(srv.base).login("ops@sklad.test", "314159")).status, 200, "ПИН-ът на OPS не е сменен");
});

test("никой не сменя собствената си роля; последният Супер Админ остава", async () => {
  const theBoss = await prisma.user.findFirst({ where: { email: "boss@sklad.test" } });
  const r = await boss.call("PUT", `/api/users/${theBoss.id}`, { nome: theBoss.nome, email: theBoss.email, ruolo: "VIEWER" });
  assert.equal(r.status, 400);
});

test("роля не може да даде право, което създателят ѝ няма", async () => {
  const cfg = client(srv.base);
  await cfg.login("config@sklad.test", "975310");
  const up = await cfg.call("POST", "/api/roles", { id: "LADDER", label: "Стълба", canManageUsers: true });
  assert.equal(up.status, 403);
  const ok = await cfg.call("POST", "/api/roles", { id: "PLAIN", label: "Обикновена", canSettings: true });
  assert.equal(ok.status, 200);
  assert.equal((await cfg.call("PUT", "/api/roles/CONFIG", { label: "Настройки", canSettings: true, canAudit: true })).status, 403);
  assert.equal((await cfg.call("POST", "/api/roles/reset", {})).status, 403);
});

test("известията и одитът: правата се проверяват и при промяна", async () => {
  assert.equal((await viewer.call("DELETE", "/api/notifications")).status, 403);
  assert.equal((await viewer.call("PUT", "/api/notifications/read", {})).status, 403);
  assert.equal((await manager.call("DELETE", "/api/audit")).status, 403);
  assert.equal((await boss.call("DELETE", "/api/audit")).status, 200);
  const log = await boss.call("GET", "/api/audit");
  assert.equal(log.data.length, 1);
  assert.equal(log.data[0].action, "AUDIT_CLEARED");
});
