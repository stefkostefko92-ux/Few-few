"use strict";
// Seed: старите ПИН-ове в чист вид стават bcrypt веднъж; първият Супер Админ идва само от средата.
const test = require("node:test");
const assert = require("node:assert/strict");
const { freshDatabase, startServer, client } = require("./harness");
const { seed } = require("../src/seed");

let prisma;

test.before(async () => {
  prisma = await freshDatabase();
});
test.after(async () => {
  await prisma.$disconnect();
});

test("празна база: Супер Админ от SKLAD_OWNER_*; грешен ПИН в средата спира seed-а", async () => {
  await assert.rejects(
    () => seed(prisma, { SKLAD_OWNER_EMAIL: "owner@sklad.test", SKLAD_OWNER_NAME: "Собственик", SKLAD_OWNER_PIN: "1234" }),
    /6 до 12 цифри/,
  );
  assert.equal(await prisma.user.count(), 0);
  const r = await seed(prisma, { SKLAD_OWNER_EMAIL: "Owner@Sklad.test", SKLAD_OWNER_NAME: "Собственик", SKLAD_OWNER_PIN: "48151623" });
  assert.equal(r.ownerCreated, true);
  const owner = await prisma.user.findFirst({ where: { email: "owner@sklad.test" } });
  assert.equal(owner.ruolo, "SUPER_ADMIN");
  assert.equal((await seed(prisma, { SKLAD_OWNER_EMAIL: "x@sklad.test", SKLAD_OWNER_NAME: "X", SKLAD_OWNER_PIN: "11112222" })).ownerCreated, false);
});

test("ПИН-ове в чист вид стават хеш веднъж, а старият ПИН пак влиза", async () => {
  await prisma.user.create({ data: { nome: "Стар", email: "old@sklad.test", ruolo: "VIEWER", pin: "4321" } });
  assert.equal((await seed(prisma, {})).hashed, 1);
  assert.equal((await seed(prisma, {})).hashed, 0);
  const stored = await prisma.user.findFirst({ where: { email: "old@sklad.test" } });
  assert.notEqual(stored.pin, "4321");
  const srv = await startServer(prisma);
  try {
    assert.equal((await client(srv.base).login("old@sklad.test", "4321")).status, 200);
  } finally {
    await srv.close();
  }
});
