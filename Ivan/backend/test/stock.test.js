"use strict";
// Артикули и поръчки: наличността не става отрицателна, цената не изтича и не се зануля.
const test = require("node:test");
const assert = require("node:assert/strict");
const { freshDatabase, startServer, client, makeUser } = require("./harness");

let prisma;
let srv;
let admin;

const part = (over = {}) => ({ codice: "BRK-1", marchio: "Brembo", riferimento: "P 85", quantita: 5, prezzo: 42.5, ...over });

test.before(async () => {
  prisma = await freshDatabase();
  srv = await startServer(prisma);
  await prisma.role.create({ data: { id: "CLERK", label: "Склад", canEdit: true, canOrder: true } });
  await makeUser(prisma, { nome: "Админ", email: "admin@sklad.test", ruolo: "ADMIN", pin: "135790" });
  await makeUser(prisma, { nome: "Складов", email: "clerk@sklad.test", ruolo: "CLERK", pin: "246802" });
  admin = client(srv.base);
  await admin.login("admin@sklad.test", "135790");
});
test.after(async () => {
  await srv.close();
  await prisma.$disconnect();
});

test("отрицателно количество в поръчка не минава", async () => {
  const p = (await admin.call("POST", "/api/parts", part())).data;
  const r = await admin.call("POST", "/api/orders", { clientName: "Клиент", items: [{ partId: p.id, qty: -3 }] });
  assert.equal(r.status, 400);
  assert.equal((await prisma.part.findUnique({ where: { id: p.id } })).quantita, 5);
});

test("един артикул на два реда се брои заедно", async () => {
  const p = (await admin.call("POST", "/api/parts", part({ codice: "BRK-2" }))).data;
  const r = await admin.call("POST", "/api/orders", { clientName: "Клиент", items: [{ partId: p.id, qty: 3 }, { partId: p.id, qty: 3 }] });
  assert.equal(r.status, 409);
  assert.equal((await prisma.part.findUnique({ where: { id: p.id } })).quantita, 5);
});

test("две едновременни поръчки не продават повече от наличното", async () => {
  const p = (await admin.call("POST", "/api/parts", part({ codice: "BRK-3", quantita: 4 }))).data;
  const order = () => admin.call("POST", "/api/orders", { clientName: "Клиент", items: [{ partId: p.id, qty: 3 }] });
  const results = await Promise.all([order(), order(), order()]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal((await prisma.part.findUnique({ where: { id: p.id } })).quantita, 1);
});

test("сумата на поръчката е от цената в базата", async () => {
  const p = (await admin.call("POST", "/api/parts", part({ codice: "BRK-4", prezzo: 10 }))).data;
  const r = await admin.call("POST", "/api/orders", { clientName: "Клиент", items: [{ partId: p.id, qty: 2, prezzo: 0.01 }], totale: 0.01 });
  assert.equal(r.status, 200);
  assert.equal(r.data.totale, 20);
});

test("без право за цена: цената не излиза и редакцията не я зануля", async () => {
  const p = (await admin.call("POST", "/api/parts", part({ codice: "BRK-5", prezzo: 99 }))).data;
  const clerk = client(srv.base);
  await clerk.login("clerk@sklad.test", "246802");
  const seen = (await clerk.call("GET", "/api/parts")).data.find((x) => x.id === p.id);
  assert.equal(seen.prezzo, 0);
  const r = await clerk.call("PUT", `/api/parts/${p.id}`, { ...seen, quantita: 7 });
  assert.equal(r.status, 200);
  const stored = await prisma.part.findUnique({ where: { id: p.id } });
  assert.equal(stored.prezzo, 99);
  assert.equal(stored.quantita, 7);
  const ord = await clerk.call("POST", "/api/orders", { clientName: "Клиент", items: [{ partId: p.id, qty: 1 }] });
  assert.equal(ord.status, 200);
  assert.equal(ord.data.totale, 0);
});
