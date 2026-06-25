import { PrismaClient } from "@prisma/client";
import { DEFAULT_CONTENT } from "../src/lib/defaults";

const prisma = new PrismaClient();

async function main() {
  for (const row of DEFAULT_CONTENT) {
    await prisma.content.upsert({
      where: { key: row.key },
      // Only (re)create missing rows; never overwrite edits made in the admin.
      update: { label: row.label, group: row.group, order: row.order },
      create: {
        key: row.key,
        group: row.group,
        label: row.label,
        order: row.order,
        enabled: true,
        it: JSON.stringify(row.it),
        bg: JSON.stringify(row.bg),
        en: JSON.stringify(row.en),
      },
    });
  }
  const count = await prisma.content.count();
  console.log(`✓ Seed complete — ${count} content sections present.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
