// Шаблонна база за инсталатора (КП-П.1, чл. 52в Н-18) — БЕЗ демо стоки, клиенти, доставчици,
// промоции и БЕЗ демо ПИН кодове. Съдържа само необходимото, за да тръгне касата:
// • администратор (код 1) с начален ПИН 0000 — описан в ръководството; сменя се при първи вход;
// • одиторски профил (код 99, т. 19) — без известен ПИН: администраторът му задава ПИН при
//   проверка, а одиторът го сменя при първия си вход;
// • една категория и служебните артикули за свободна продажба (PLU ≥ 990) по ДДС група.
// Идемпотентен: upsert по уникален ключ. Демо базата е `prisma/seed.ts` и не влиза в инсталатора.

import { randomInt } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const OTHER = { name: "Други", color: "#64748b", icon: "Basket", sort: 10 };

const FREE_SALE = [
  { plu: 990, name: "Свободна продажба — Б (20%)", vatGroup: "B" },
  { plu: 991, name: "Свободна продажба — А (0%)", vatGroup: "A" },
  { plu: 992, name: "Свободна продажба — Г (9%)", vatGroup: "D" },
] as const;

/** ПИН, който никой не знае — профилът съществува, но не може да се ползва без администратора. */
function unknownPin(): string {
  return String(randomInt(10_000_000, 99_999_999));
}

async function main() {
  const users = [
    { name: "Администратор Обект", operatorCode: 1, pin: "0000", role: "ADMIN", readOnly: false },
    { name: "Одитор НАП", operatorCode: 99, pin: unknownPin(), role: "ADMIN", readOnly: true },
  ];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { operatorCode: u.operatorCode },
      create: {
        name: u.name,
        operatorCode: u.operatorCode,
        pinHash: await bcrypt.hash(u.pin, 10),
        role: u.role,
        readOnly: u.readOnly,
        mustChangePin: true,
      },
      update: {},
    });
    const grant = await prisma.userRoleGrant.findFirst({ where: { userId: user.id, validTo: null } });
    if (!grant) {
      await prisma.userRoleGrant.create({ data: { userId: user.id, role: u.role, readOnly: u.readOnly } });
    }
  }

  const other = await prisma.category.upsert({ where: { name: OTHER.name }, create: OTHER, update: {} });
  for (const p of FREE_SALE) {
    await prisma.product.upsert({
      where: { plu: p.plu },
      create: {
        plu: p.plu,
        name: p.name,
        categoryId: other.id,
        unit: "PCS",
        vatGroup: p.vatGroup,
        priceCents: 0,
        costCents: 0,
        stockMilli: 0,
        minStockMilli: 0,
      },
      update: {},
    });
  }
  console.log("✓ Шаблонна база: администратор (код 1, начален ПИН за смяна), одитор (код 99), свободна продажба.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
