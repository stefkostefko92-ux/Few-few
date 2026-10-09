"use strict";
// Настройки: ролите без „Настройки“ виждат само прага за ниска наличност (иначе изключеното от
// администратора предупреждение продължава да свети при всички останали), но не и имейла.
const test = require("node:test");
const assert = require("node:assert/strict");
const { freshDatabase, startServer, client, makeUser } = require("./harness");

let prisma;
let srv;
let boss;
let viewer;

test.before(async () => {
  prisma = await freshDatabase();
  srv = await startServer(prisma);
  await makeUser(prisma, { nome: "Шеф", email: "boss@sklad.test", ruolo: "SUPER_ADMIN", pin: "135790" });
  await makeUser(prisma, { nome: "Гледач", email: "viewer@sklad.test", ruolo: "VIEWER", pin: "112233" });
  boss = client(srv.base);
  viewer = client(srv.base);
  await boss.login("boss@sklad.test", "135790");
  await viewer.login("viewer@sklad.test", "112233");
});
test.after(async () => {
  await srv.close();
  await prisma.$disconnect();
});

test("изключеното предупреждение за ниска наличност стига и до роля без „Настройки“", async () => {
  const body = { notifyEmail: "tajno@sklad.test", emailEnabled: true, lowStockEnabled: false, lowStockThreshold: 3 };
  assert.equal((await boss.call("PUT", "/api/settings", body)).status, 200);
  const seen = await viewer.call("GET", "/api/settings");
  assert.equal(seen.status, 200);
  assert.equal(seen.data.lowStockEnabled, false);
  assert.equal(seen.data.lowStockThreshold, 3);
});

test("ролята без „Настройки“ не вижда имейла и не пише настройки", async () => {
  const seen = await viewer.call("GET", "/api/settings");
  assert.equal(seen.data.notifyEmail, undefined);
  assert.equal(seen.data.emailEnabled, undefined);
  const put = await viewer.call("PUT", "/api/settings", { lowStockEnabled: true });
  assert.equal(put.status, 403);
});
