"use strict";
// Seed при всеки старт на контейнера (идемпотентен): вградените роли, настройките и еднократното хеширане на
// ПИН-ове, останали в чист вид отпреди. Празна база получава първия Супер Админ от SKLAD_OWNER_* (по желание).
// Грешка → изход 1, значи бекендът не тръгва с наполовина хеширани ПИН-ове.
const { PrismaClient } = require("@prisma/client");
const pino = require("pino");
const { z } = require("zod");
const { isPinHash, hashPin } = require("./security");
const { BUILTIN } = require("./routes/roles");

const Owner = z.object({
  SKLAD_OWNER_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  SKLAD_OWNER_NAME: z.string().trim().min(1).max(100),
  SKLAD_OWNER_PIN: z.string().regex(/^\d{6,12}$/, "SKLAD_OWNER_PIN трябва да е от 6 до 12 цифри"),
});

async function seed(prisma, env = process.env) {
  for (const r of BUILTIN) await prisma.role.upsert({ where: { id: r.id }, update: {}, create: r });
  await prisma.settings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });

  const users = await prisma.user.findMany({ select: { id: true, pin: true, email: true } });
  let hashed = 0;
  for (const u of users) {
    if (isPinHash(u.pin)) continue;
    await prisma.user.update({ where: { id: u.id }, data: { pin: await hashPin(u.pin) } });
    hashed += 1;
  }
  // Имейлите — с малки букви и без интервали: входът ги търси точно (виж routes/auth.js). Два акаунта,
  // които се различават само по регистъра, не се пипат — те се оправят на ръка (вписва се в изхода).
  let normalized = 0;
  const clashes = [];
  for (const u of users) {
    const clean = u.email.trim().toLowerCase();
    if (clean === u.email) continue;
    try {
      await prisma.user.update({ where: { id: u.id }, data: { email: clean } });
      normalized += 1;
    } catch (err) {
      if (err.code !== "P2002") throw err;
      clashes.push(u.id);
    }
  }

  let ownerCreated = false;
  if (users.length === 0 && env.SKLAD_OWNER_EMAIL) {
    const o = Owner.parse(env);
    await prisma.user.create({
      data: { nome: o.SKLAD_OWNER_NAME, email: o.SKLAD_OWNER_EMAIL, ruolo: "SUPER_ADMIN", pin: await hashPin(o.SKLAD_OWNER_PIN) },
    });
    ownerCreated = true;
  }
  return { users: users.length, hashed, normalized, emailClashes: clashes, ownerCreated };
}

if (require.main === module) {
  const log = pino({ base: { app: "sklad-seed" } });
  const prisma = new PrismaClient();
  seed(prisma)
    .then((r) => log.info(r, "seed done"))
    .catch((err) => {
      log.fatal({ err: { message: err.message } }, "seed failed");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { seed };
