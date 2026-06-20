import { prisma } from "./_seedlib";

// Институции и аварийни телефони. Аварийните номера на тока и водата са
// официални и проверени (Електрохолд/ЕРМ Запад и „Кюстендилска вода").
// Аптеката и Дирекция „Социално подпомагане" са с данни за допълване/проверка
// на място — затова аптеката е публикувана с известен адрес/телефон (за
// потвърждение), а ДСП остава като чернова до получаване на точните данни.

const FILL_NOTE =
  "Чернова. Попълнете липсващите данни (телефон, адрес, работно време) и сложете отметка „Публикувано“.";

const items = [
  {
    slug: "elektro-avarii-bobov-dol",
    name: "Електрозахранване — аварии (ток)",
    category: "UTILITY" as const,
    description:
      "Авариен телефон при прекъсване на тока — Електроразпределителни мрежи Запад (Електрохолд), денонощно.",
    phone: "0700 100 10",
    hours: "Денонощно (24/7)",
    order: 11,
    published: true,
  },
  {
    slug: "vik-avarii-bobov-dol",
    name: "ВиК — аварии (вода)",
    category: "UTILITY" as const,
    description:
      "Денонощен телефон за сигнали за аварии във водоснабдяването и канализацията — „Кюстендилска вода“ ЕООД.",
    phone: "0700 890 71",
    hours: "Денонощно (24/7)",
    order: 12,
    published: true,
  },
  {
    slug: "apteka-bobov-dol-1",
    name: "Аптека — Бобов дол",
    category: "HEALTH" as const,
    description: "Аптека в град Бобов дол. (Телефонът и работното време са за потвърждение на място.)",
    address: "ул. „Никола Вапцаров“ 29, гр. Бобов дол",
    phone: "0702 2016",
    hours: "",
    order: 5,
    published: true,
  },
  {
    slug: "dsp-bobov-dol",
    name: "Дирекция „Социално подпомагане“ — Бобов дол",
    category: "SOCIAL" as const,
    description: `Помощи, ТЕЛК, социални услуги и подкрепа. ${FILL_NOTE}`,
    address: "",
    phone: "",
    hours: "",
    order: 10,
    published: false,
  },
  // Чернови за институции, чиито точни данни се попълват на място (от админа).
  {
    slug: "balgarski-poshti-bobov-dol",
    name: "Български пощи — Бобов дол",
    category: "ADMIN" as const,
    description: `Пощенска станция — пратки, пенсии, преводи. ${FILL_NOTE}`,
    order: 20,
    published: false,
  },
  {
    slug: "notarius-bobov-dol",
    name: "Нотариус — Бобов дол",
    category: "ADMIN" as const,
    description: `Нотариални услуги (заверки, сделки, пълномощни). ${FILL_NOTE}`,
    order: 21,
    published: false,
  },
  {
    slug: "lichen-lekar-bobov-dol",
    name: "Личен лекар (общопрактикуващ) — Бобов дол",
    category: "HEALTH" as const,
    description: `Общопрактикуващ лекар. ${FILL_NOTE}`,
    order: 22,
    published: false,
  },
  {
    slug: "zabolekar-bobov-dol",
    name: "Зъболекар (стоматолог) — Бобов дол",
    category: "HEALTH" as const,
    description: `Стоматологични услуги. ${FILL_NOTE}`,
    order: 23,
    published: false,
  },
  {
    slug: "veterinar-bobov-dol",
    name: "Ветеринарен лекар — Бобов дол",
    category: "OTHER" as const,
    description: `Ветеринарни услуги. ${FILL_NOTE}`,
    order: 24,
    published: false,
  },
  {
    slug: "pogrebalni-uslugi-bobov-dol",
    name: "Погребална агенция — Бобов дол",
    category: "OTHER" as const,
    description: `Погребални и ритуални услуги. ${FILL_NOTE}`,
    order: 25,
    published: false,
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
  console.log(`✔ Институции/аварийни телефони: ${items.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
