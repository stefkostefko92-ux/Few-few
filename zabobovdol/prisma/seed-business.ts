import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Зарежда .env при локално стартиране (в Docker променливите идват от средата).
if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of env.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* няма .env — разчитаме на средата */
  }
}

const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────────────────
// Реални обекти в Бобов дол, събрани от публични източници (юни 2026).
// Източници: официален сайт на Община Бобов дол (bobovdol.egov.bg) и new.bobovdol.eu,
// ОДМВР-Кюстендил (mvr.bg), регистър на училищата (uchilishtata.bg), банкови и
// търговски директории (titul.bg, broshura.bg, kimbino.bg, kabelna.com).
// Празните полета НЕ са измисляни — попълнете ги от админ панела след проверка.
// ──────────────────────────────────────────────────────────────────────────

type ServiceSeed = {
  slug: string;
  name: string;
  category:
    | "HEALTH" | "ADMIN" | "UTILITY" | "TRANSPORT"
    | "SOCIAL" | "EMERGENCY" | "EDUCATION" | "OTHER";
  description?: string;
  address?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  website?: string;
  hours?: string;
  lat?: number;
  lng?: number;
  isEmergency?: boolean;
  order?: number;
};

type BusinessSeed = {
  slug: string;
  name: string;
  category:
    | "SHOP" | "FOOD" | "SERVICE" | "CRAFT"
    | "AGRO" | "TOURISM" | "HEALTH" | "OTHER";
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  hours?: string;
  featured?: boolean;
  order?: number;
};

const services: ServiceSeed[] = [
  {
    slug: "obshtina-bobov-dol",
    name: "Община Бобов дол",
    category: "ADMIN",
    description:
      "Общинска администрация — административни услуги за гражданите, " +
      "Център за административно обслужване, електронни услуги.",
    address: "ул. „27-ми октомври“ № 2, гр. Бобов дол, 2670",
    phone: "0702 62323",
    phone2: "0893 653 530",
    email: "obshtina@bobovdol.egov.bg",
    website: "https://bobovdol.egov.bg",
    hours: "Пон–Пет 08:30–17:00",
    lat: 42.36667,
    lng: 23.00565,
    order: 1,
  },
  {
    slug: "grao-bobov-dol",
    name: "ГРАО — Гражданска регистрация (Община Бобов дол)",
    category: "ADMIN",
    description:
      "Адресни регистрации, удостоверения и актове за гражданско състояние.",
    address: "ул. „27-ми октомври“ № 2, гр. Бобов дол",
    phone: "0702 65273",
    website: "https://bobovdol.egov.bg",
    hours: "Пон–Пет 08:30–17:00",
    order: 2,
  },
  {
    slug: "mestni-danatsi-bobov-dol",
    name: "Местни данъци и такси (Община Бобов дол)",
    category: "ADMIN",
    description:
      "Справки и плащане на данък сгради, такса битови отпадъци и данък МПС.",
    address: "ул. „27-ми октомври“ № 2, гр. Бобов дол",
    phone: "0702 63463",
    website: "https://bobovdol.egov.bg",
    hours: "Пон–Пет 08:30–17:00",
    order: 3,
  },
  {
    slug: "ru-mvr-bobov-dol",
    name: "Полиция — РУ на МВР Бобов дол",
    category: "EMERGENCY",
    description:
      "Районно управление на МВР Бобов дол. При спешност набирайте 112.",
    address: "в сградата на Община Бобов дол, ул. „27-ми октомври“ № 2",
    phone: "0702 62112",
    hours: "Приемно време: Пон и Пет 08:30–17:30, Чет 10:00–16:00",
    order: 4,
  },
  {
    slug: "su-hristo-botev-bobov-dol",
    name: "СУ „Христо Ботев“ — Бобов дол",
    category: "EDUCATION",
    description: "Средно училище в град Бобов дол.",
    address: "ул. „Кирил и Методий“ № 12, гр. Бобов дол",
    phone: "0702 62115",
    phone2: "0702 62256",
    email: "sou_bobovdol@abv.bg",
    website: "https://www.soubobovdol.com",
    order: 5,
  },
  {
    slug: "dg-druzhba-bobov-dol",
    name: "Детска градина „Дружба“ — Бобов дол",
    category: "EDUCATION",
    description: "Детска градина в град Бобов дол.",
    address: "ул. „Дружба“ 1, гр. Бобов дол",
    phone: "0702 65101",
    phone2: "0895 656125",
    email: "info-1000069@edu.mon.bg",
    order: 6,
  },
  {
    slug: "chitalishte-prosveta-1903",
    name: "НЧ „Просвета-1903“ — Бобов дол",
    category: "EDUCATION",
    description:
      "Народно читалище — библиотека, културни и образователни дейности за общността.",
    address: "ул. „Георги Димитров“ № 72, гр. Бобов дол",
    phone: "0893 270013",
    phone2: "0893 270016",
    order: 7,
  },
  {
    slug: "chitalishte-carichina-2008",
    name: "НЧ „Царичина 2008“ — кв. Миньор",
    category: "EDUCATION",
    description: "Народно читалище в кв. Миньор, Бобов дол.",
    address: "ул. „Комсомолска“, кв. Миньор, гр. Бобов дол",
    phone: "0885 318647",
    phone2: "0895 656101",
    order: 8,
  },
];

const businesses: BusinessSeed[] = [
  {
    slug: "banka-dsk-bobov-dol",
    name: "Банка ДСК — Бобов дол",
    category: "SERVICE",
    description: "Банков офис — разплащания, карти, кредити, банкомат. Денонощен телефон при изгубена карта: 0700 10 375.",
    address: "ул. „Димитър Благоев“ ЕП 31, гр. Бобов дол, 2670",
    phone: "0700 10 375",
    website: "https://dsk.bg",
    featured: true,
    order: 1,
  },
  {
    slug: "bankomat-dsk-hristo-botev",
    name: "Банкомат Банка ДСК — кв. Христо Ботев",
    category: "SERVICE",
    description: "Банкомат (АТМ) на Банка ДСК.",
    address: "ул. „27-ми октомври“ № 24, кв. Христо Ботев, гр. Бобов дол",
    order: 2,
  },
  {
    slug: "t-market-bobov-dol",
    name: "T-MARKET — Бобов дол",
    category: "SHOP",
    description: "Супермаркет — хранителни стоки и стоки за бита.",
    address: "ул. „Димитър Благоев“ № 28, гр. Бобов дол, 2670",
    phone: "0700 70 171",
    hours: "Понеделник–Неделя 08:00–22:00",
    website: "https://tmarket.bg",
    featured: true,
    order: 3,
  },
  {
    slug: "apteka-sopharmacy-bobov-dol",
    name: "Аптека SOpharmacy — Бобов дол",
    category: "HEALTH",
    description: "Аптека — лекарства и здравни продукти.",
    address: "ул. „Димитър Благоев“, гр. Бобов дол",
    order: 4,
  },
  {
    slug: "vivacom-bobov-dol",
    name: "Vivacom — офис Бобов дол",
    category: "SERVICE",
    description: "Телеком офис — мобилни услуги, интернет и телевизия.",
    address: "ул. „27-ми октомври“, бл. 33, гр. Бобов дол",
    phone: "0702 2000",
    hours: "Пон–Пет 09:00–14:00, 15:00–19:00; събота и неделя — затворено",
    order: 5,
  },
  {
    slug: "mag-ood-bobov-dol",
    name: "МАГ ООД — Бобов дол",
    category: "OTHER",
    description: "Местна фирма за производство и търговия с хранителни продукти. Мобилен: 0885 446 147.",
    address: "Промишлена зона, гр. Бобов дол",
    phone: "0702 6 52 22",
    email: "sales@magbg.eu",
    website: "https://magbg.eu",
    order: 6,
  },
  {
    slug: "petrol-bobov-dol",
    name: "Бензиностанция Петрол — Бобов дол",
    category: "SERVICE",
    description: "Бензиностанция (Петрол, обект №0205).",
    address: "гр. Бобов дол",
    order: 7,
  },
  {
    slug: "restorant-panorama-bobov-dol",
    name: "Ресторант „Панорама“ — Бобов дол",
    category: "FOOD",
    description: "Ресторант в Бобов дол.",
    order: 8,
  },
  {
    slug: "restorant-central-bobov-dol",
    name: "Ресторант „Централ“ — Бобов дол",
    category: "FOOD",
    description: "Ресторант — обяд, вечеря и напитки; организиране на събития.",
    address: "ул. „Димитър Благоев“ 16А, гр. Бобов дол",
    hours: "Пон–Нед 10:00–22:00",
    order: 9,
  },
  {
    slug: "salon-luiza-bobov-dol",
    name: "Фризьорски салон — Бобов дол",
    category: "HEALTH",
    description: "Фризьорски услуги.",
    address: "ул. „Димитър Благоев“, бл. 31, гр. Бобов дол",
    phone: "0893 394 776",
    order: 10,
  },
  {
    slug: "hospis-bobov-dol",
    name: "Хоспис — Бобов дол",
    category: "HEALTH",
    description: "Хоспис — грижа за тежко болни и възрастни хора.",
    phone: "0702 62 026",
    email: "ekaterina_mitova@abv.bg",
    order: 11,
  },
];


// Примерни записи от началния seed, които вече не са нужни (имаха фиктивни данни).
const PLACEHOLDER_SLUGS = {
  service: [
    "kmetstvo-bobov-dol",
    "speshna-pomosht-bobov-dol",
    "apteka-bobov-dol",
    "elektrosnabdjavane-avarii",
  ],
  business: ["primeren-magazin", "primerno-zavedenie"],
};

async function main() {
  for (const s of services) {
    await prisma.service.upsert({ where: { slug: s.slug }, update: s, create: s });
  }
  console.log(`✔ Услуги/институции: ${services.length}`);

  for (const b of businesses) {
    await prisma.business.upsert({ where: { slug: b.slug }, update: b, create: b });
  }
  console.log(`✔ Бизнеси: ${businesses.length}`);

  // Скрива (не трие) примерните записи с фиктивни данни.
  const hidS = await prisma.service.updateMany({
    where: { slug: { in: PLACEHOLDER_SLUGS.service } },
    data: { published: false },
  });
  const hidB = await prisma.business.updateMany({
    where: { slug: { in: PLACEHOLDER_SLUGS.business } },
    data: { published: false },
  });
  console.log(`✔ Скрити примерни записи: ${hidS.count + hidB.count}`);

  console.log("\nГотово. Данните са от публични източници — проверете преди употреба.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
