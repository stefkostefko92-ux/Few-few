import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of env.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* няма .env */
  }
}

const prisma = new PrismaClient();

async function main() {
  // БДЖ — реална услуга (национален телефон и сайт за разписания/билети).
  await prisma.service.upsert({
    where: { slug: "bdz-vlakove" },
    update: {
      name: "БДЖ — влакове и билети",
      category: "TRANSPORT",
      description: "Разписания и билети за влак. Информация на телефон 0700 10 200.",
      phone: "0700 10 200",
      website: "https://razpisanie.bdz.bg",
      order: 1,
      published: true,
    },
    create: {
      slug: "bdz-vlakove",
      name: "БДЖ — влакове и билети",
      category: "TRANSPORT",
      description: "Разписания и билети за влак. Информация на телефон 0700 10 200.",
      phone: "0700 10 200",
      website: "https://razpisanie.bdz.bg",
      order: 1,
      published: true,
    },
  });
  console.log("✔ Транспортна услуга: БДЖ");

  // Примерна обява за споделено пътуване (за да се вижда форматът).
  await prisma.rideshare.upsert({
    where: { slug: "bobov-dol-dupnitsa-primer" },
    update: {},
    create: {
      slug: "bobov-dol-dupnitsa-primer",
      kind: "OFFER",
      routeFrom: "Бобов дол",
      routeTo: "Дупница",
      schedule: "делник, ~7:30",
      seats: "3",
      costNote: "споделяне на горивото",
      description:
        "Примерна обява, за да видите как изглежда — заменете я със своя. " +
        "Пътувам редовно до Дупница сутрин и се връщам следобед; има места за спътници.",
      contactEmail: "zabobovdol@carbonstealth.eu",
      published: true,
    },
  });
  console.log("✔ Споделено пътуване: примерна обява");

  await prisma.$disconnect();
  console.log("Готово.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
