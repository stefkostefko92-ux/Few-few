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
      description: "Разписания и билети за влак. Информация на телефон 02 931 11 11.",
      phone: "02 931 11 11",
      website: "https://razpisanie.bdz.bg",
      order: 1,
      published: true,
    },
    create: {
      slug: "bdz-vlakove",
      name: "БДЖ — влакове и билети",
      category: "TRANSPORT",
      description: "Разписания и билети за влак. Информация на телефон 02 931 11 11.",
      phone: "02 931 11 11",
      website: "https://razpisanie.bdz.bg",
      order: 1,
      published: true,
    },
  });
  console.log("✔ Транспортна услуга: БДЖ");

  // Местни таксита в Бобов дол (реални данни).
  const taxis = [
    {
      slug: "taksi-radina-nira",
      name: "Такси Радина (НИРА-1219)",
      description: "Таксиметров превоз. Фирма: НИРА-1219 ЕООД. Водач: Радина.",
      phone: "0895 888 755",
      order: 2,
    },
    {
      slug: "burov-taksi",
      name: "Буров Такси",
      description: "Таксиметров превоз. Фирма: Буров777. Водач: Георги Буров.",
      phone: "0897 953 095",
      order: 3,
    },
    {
      slug: "niksi-taksi",
      name: "Никси Такси",
      description: "Таксиметров превоз. Фирма: НИСТИ. Водач: Тихомир.",
      phone: "0890 171 817",
      order: 4,
    },
    {
      slug: "taksi-emil",
      name: "Такси Емил",
      description: 'Таксиметров превоз. Фирма: ЕТ „Лиляна Георгиева". Водач: Емил.',
      phone: "0898 693 939",
      order: 5,
    },
    {
      slug: "taksi-sandano",
      name: "Такси Сандано",
      description: 'Таксиметров превоз. Фирма: ЕТ „Кирил Костадинов – Сани". Водач: Кирил (Сандано).',
      phone: "0899 181 564",
      order: 6,
    },
    {
      slug: "mitko-taksi",
      name: "Митко Такси",
      description: "Таксиметров превоз. Фирма: Силвия и Ивайла. Водач: Митко.",
      phone: "0878 420 560",
      order: 7,
    },
  ];
  for (const t of taxis) {
    const data = {
      name: t.name,
      category: "TRANSPORT" as const,
      description: t.description,
      phone: t.phone,
      order: t.order,
      published: true,
    };
    await prisma.service.upsert({
      where: { slug: t.slug },
      update: data,
      create: { slug: t.slug, ...data },
    });
  }
  console.log(`✔ Таксита: ${taxis.length}`);

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
