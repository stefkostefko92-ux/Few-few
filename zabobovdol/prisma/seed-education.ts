import { prisma } from "./_seedlib";

// Училища и детска градина в Бобов дол — проверени данни.
// Източници: официалните сайтове на училищата/градината и общината
// (ouvaptsarov.com, soubobovdol.com, bobovdol.egov.bg).

const items = [
  {
    slug: "ou-nikola-vaptsarov",
    name: "ОУ „Никола Йонков Вапцаров“",
    category: "EDUCATION" as const,
    description:
      "Основно училище в Бобов дол. Директор: Анна Рангелова. Сайт на училището: ouvaptsarov.com.",
    address: "гр. Бобов дол, ул. „Н. Й. Вапцаров“ №1",
    phone: "0702 63903",
    email: "info-1000015@edu.mon.bg",
    website: "https://ouvaptsarov.com",
    order: 1,
    published: true,
  },
  {
    slug: "su-hristo-botev-bobov-dol",
    name: "СУ „Христо Ботев“",
    category: "EDUCATION" as const,
    description: "Средно училище в Бобов дол (1.–12. клас).",
    address: "гр. Бобов дол, ул. „Св. св. Кирил и Методий“ 12",
    phone: "0702 62115",
    phone2: "0702 62256",
    email: "sou_bobovdol@abv.bg",
    website: "https://www.soubobovdol.com",
    order: 2,
    published: true,
  },
  {
    slug: "dg-druzhba-bobov-dol",
    name: "ДГ „Дружба“",
    category: "EDUCATION" as const,
    description:
      "Детска градина в Бобов дол. Директор: Гергана Зарева. От 2025 г. ДГ „Миньор“ е влята в ДГ „Дружба“.",
    address: "гр. Бобов дол, ул. „Дружба“ 1",
    phone: "0702 65101",
    phone2: "0895 656125",
    email: "info-1000069@edu.mon.bg",
    order: 3,
    published: true,
  },
];

async function main() {
  for (const it of items) {
    await prisma.service.upsert({
      where: { slug: it.slug },
      update: it,
      create: it,
    });
  }
  console.log(`✔ Образование (училища/детска градина): ${items.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
