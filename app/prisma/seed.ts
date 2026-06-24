// Зарежда началните данни в базата от типизираните източници в src/data/*.
// Стартиране: npm run db:seed (изисква DATABASE_URL и `prisma generate`).
import { PrismaClient } from "@prisma/client";
import { SERVICES } from "../src/data/services";
import { PHARMACIES_24H } from "../src/data/pharmacies";
import { slugify } from "../src/lib/slug";

const prisma = new PrismaClient();

async function main() {
  for (const [i, s] of SERVICES.entries()) {
    await prisma.service.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        category: s.category,
        description: s.description ?? "",
        address: s.address ?? "",
        website: s.website ?? "",
        hours: s.hours ?? "",
        phone: s.phones[0]?.number ?? "",
        phone2: s.phones[1]?.number ?? "",
        order: i,
      },
      create: {
        slug: s.slug,
        name: s.name,
        category: s.category,
        description: s.description ?? "",
        address: s.address ?? "",
        website: s.website ?? "",
        hours: s.hours ?? "",
        phone: s.phones[0]?.number ?? "",
        phone2: s.phones[1]?.number ?? "",
        order: i,
      },
    });
  }
  console.log(`Заредени услуги: ${SERVICES.length}`);

  for (const [i, p] of PHARMACIES_24H.entries()) {
    const slug = slugify(p.name);
    await prisma.pharmacy.upsert({
      where: { slug },
      update: {
        name: p.name,
        is24h: p.is24h,
        address: p.address ?? "",
        phone: p.phone ?? "",
        note: p.note ?? "",
        verified: p.verified,
        sources: p.sources,
        order: i,
      },
      create: {
        slug,
        name: p.name,
        is24h: p.is24h,
        address: p.address ?? "",
        phone: p.phone ?? "",
        note: p.note ?? "",
        verified: p.verified,
        sources: p.sources,
        order: i,
      },
    });
  }
  console.log(`Заредени аптеки: ${PHARMACIES_24H.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
