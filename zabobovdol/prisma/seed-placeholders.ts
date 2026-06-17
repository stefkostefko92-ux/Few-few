import { prisma } from "./_seedlib";

// Празни „чернови" за институции, чиито данни още нямаме. Създават се като
// НЕпубликувани (published: false), за да не се показват празни на сайта.
// В админ панела (Услуги и телефони) ги отваряте, попълвате телефон/адрес и
// слагате отметка „Публикувано". Така не изтича никаква неточна информация.

const NOTE =
  "⚠️ Чернова. Попълнете липсващите данни (телефон, адрес, работно време) и след това сложете отметка „Публикувано“, за да се покаже на сайта.";

const drafts = [
  {
    slug: "apteka-bobov-dol-1",
    name: "Аптека — Бобов дол",
    category: "HEALTH" as const,
    description: `Аптека в град Бобов дол. ${NOTE}`,
    address: "",
    phone: "",
    hours: "",
    order: 10,
    published: false,
  },
  {
    slug: "dsp-bobov-dol",
    name: "Дирекция „Социално подпомагане“ — Бобов дол",
    category: "SOCIAL" as const,
    description: `Помощи, ТЕЛК, социални услуги и подкрепа. ${NOTE}`,
    address: "",
    phone: "",
    hours: "",
    order: 10,
    published: false,
  },
  {
    slug: "elektro-avarii-bobov-dol",
    name: "Електрозахранване — аварии (ток)",
    category: "UTILITY" as const,
    description: `Телефон за повреди и аварии по електрозахранването. ${NOTE}`,
    phone: "",
    order: 11,
    published: false,
  },
  {
    slug: "vik-avarii-bobov-dol",
    name: "ВиК — аварии (вода)",
    category: "UTILITY" as const,
    description: `Телефон за аварии по водоснабдяването и канализацията. ${NOTE}`,
    phone: "",
    order: 12,
    published: false,
  },
];

async function main() {
  let created = 0;
  for (const d of drafts) {
    // Не презаписваме, ако вече съществува (за да не изтрием попълнени данни).
    const existing = await prisma.service.findUnique({ where: { slug: d.slug } });
    if (existing) continue;
    await prisma.service.create({ data: d });
    created++;
  }
  console.log(`✔ Чернови за попълване (услуги): създадени ${created}, общо ${drafts.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
