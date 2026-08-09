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

const SPONSOR = "Carbon Stealth VCC";

// Начални банери за четирите рекламни слота на началната страница.
const banners = [
  {
    title: "Изработка на сайтове и онлайн магазини",
    sponsor: SPONSOR,
    description: "Модерни, бързи и удобни за телефон уебсайтове за Вашия бизнес.",
    linkUrl: "/reklama",
    order: 1,
  },
  {
    title: "Дигитален маркетинг и реклама",
    sponsor: SPONSOR,
    description: "Реклама в Google и Facebook, която Ви носи реални клиенти.",
    linkUrl: "/reklama",
    order: 2,
  },
  {
    title: "Мобилни приложения и софтуер по поръчка",
    sponsor: SPONSOR,
    description: "Приложения и системи, направени точно за Вашите нужди.",
    linkUrl: "/reklama",
    order: 3,
  },
  {
    title: "Поддръжка, хостинг и киберсигурност",
    sponsor: SPONSOR,
    description: "Сигурна и надеждна поддръжка, за да работи всичко без грижи.",
    linkUrl: "/reklama",
    order: 4,
  },
];

async function main() {
  // Идемпотентно БЕЗ да трие човешка работа. Старият вариант правеше deleteMany + create,
  // което при всяко пускане изтриваше редовете (заедно с ръчните промени на админа по
  // `order`/`published`) и раздаваше нови `id`-та. `Banner` няма `@unique` поле, затова
  // съпоставяме по естествената двойка (sponsor, title) и обновяваме само СЪДЪРЖАНИЕТО;
  // `order` и `published` са на админа — пипат се само при първо създаване.
  let created = 0, updated = 0;
  for (const b of banners) {
    const existing = await prisma.banner.findFirst({
      where: { sponsor: SPONSOR, title: b.title },
      select: { id: true },
    });
    if (existing) {
      await prisma.banner.update({
        where: { id: existing.id },
        data: { description: b.description, linkUrl: b.linkUrl, bgColor: "#000000", accentColor: "#00e5ff" },
      });
      updated++;
    } else {
      // Цветовете на Carbon Stealth: черен фон с циан акцент.
      await prisma.banner.create({
        data: { ...b, bgColor: "#000000", accentColor: "#00e5ff", published: true },
      });
      created++;
    }
  }
  console.log(`✔ Рекламни банери (${SPONSOR}): ${created} нови, ${updated} обновени (order/published не се пипат)`);
  await prisma.$disconnect();
  console.log("Готово.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
