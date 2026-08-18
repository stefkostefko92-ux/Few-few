// backend/src/__tests__/integration/db.js
// Общи помощници за интеграционния пакет: истински Prisma клиент + чисто
// начало на всеки тест.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Изпразва всичко в реда на зависимостите.
 *
 * `TRUNCATE … CASCADE` е нарочно вместо `deleteMany` по модел: не иска ръчно
 * подреждане на чуждите ключове и не се чупи, щом добавим таблица. Списъкът се
 * ЧЕТЕ от базата, не се пише на ръка — иначе нов модел би останал непочистен и
 * тестовете щяха да си влияят по начин, който изглежда като flakiness.
 */
export async function resetDb() {
  const rows = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  if (!rows.length) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

/** Минимален сървър — почти всичко има чужд ключ към него. */
export async function makeServer(over = {}) {
  return prisma.server.create({
    data: {
      id: over.id || `srv_${Math.floor(performance.now() * 1000)}`,
      name: "Тестов сървър",
      // Задължителен в схемата — мокът никога не го поиска, живата база го иска.
      ownerId: over.ownerId || "owner_1",
      ...over,
    },
  });
}

/** Потребител — `applications` има RESTRICT чужд ключ насам. */
export async function makeUser(id = "u_test") {
  return prisma.user.upsert({
    where: { id },
    create: { id, username: id, discriminator: "0" },
    update: {},
  });
}
