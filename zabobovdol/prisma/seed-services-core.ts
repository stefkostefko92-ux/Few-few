import { prisma } from "./_seedlib";

// Основни услуги за жителите на Бобов дол: социално подпомагане, НОИ, здравна каса.
// ВСИЧКИ данни са взети от първични (официални) източници на 2026-10-23 и са
// записани във verifiedAt/verifiedSource. Нищо не е предположено: ако източникът
// не казва работно време, полето е празно (по-добре липсващо, отколкото грешно).
//
// Източници (проверени на 2026-10-23):
//  - АСП, „Териториални структури“: https://asp.government.bg/bg/kontakti/teritorialni-strukturi/
//  - НОИ, ТП Кюстендил (+ Офис Дупница): https://nssi.bg/kontakti/teritorialni-podeleniq-na-noi/kyustendil/
//  - НЗОК, „Контакти“ (РЗОК Кюстендил): https://www.nhif.bg/bg/contacts
//
// НЕ са проверени (затова липсват): Български пощи (локаторът е динамичен),
// личен лекар/зъболекар, Бюро по труда, НАП, пожарна, МБАЛ Дупница.
// Идемпотентно: upsert по slug; update НЕ пипа `published` (админът решава),
// с едно изключение — чернова без телефон (`dsp-bobov-dol` от seed-placeholders)
// се публикува, докато е празна; след попълване админът я управлява сам.

const VERIFIED_AT = new Date("2026-10-23T00:00:00.000Z");
const SRC_ASP = "https://asp.government.bg/bg/kontakti/teritorialni-strukturi/";
const SRC_NOI = "https://nssi.bg/kontakti/teritorialni-podeleniq-na-noi/kyustendil/";
const SRC_NHIF = "https://www.nhif.bg/bg/contacts";

type Item = {
  slug: string;
  name: string;
  category: "HEALTH" | "ADMIN" | "SOCIAL";
  description: string;
  address: string;
  phone: string;
  phone2?: string;
  email?: string;
  website?: string;
  hours?: string;
  order: number;
  verifiedSource: string;
};

const items: Item[] = [
  {
    slug: "dsp-bobov-dol",
    name: "Дирекция „Социално подпомагане“ — Бобов дол",
    category: "SOCIAL",
    description:
      "Социални помощи, помощи за отопление, личен асистент и социални услуги. Към Регионална дирекция „Социално подпомагане“ — Кюстендил. Работното време не е посочено в официалния източник — обадете се преди да тръгнете.",
    address: "ул. „27-ми октомври“ № 2, гр. Бобов дол",
    phone: "0702 6 34 69",
    email: "dsp-bobovdol@asp.government.bg",
    website: "https://asp.government.bg",
    order: 10,
    verifiedSource: SRC_ASP,
  },
  {
    slug: "rdsp-kyustendil",
    name: "Регионална дирекция „Социално подпомагане“ — Кюстендил",
    category: "SOCIAL",
    description:
      "Областната дирекция, към която е ДСП — Бобов дол. За въпроси, които местната дирекция не е решила.",
    address: "ул. „Демокрация“ № 44, гр. Кюстендил",
    phone: "078 52 31 80",
    email: "kyustendil-rdsp@asp.government.bg",
    website: "https://asp.government.bg",
    order: 11,
    verifiedSource: SRC_ASP,
  },
  {
    slug: "noi-kyustendil",
    name: "НОИ — Териториално поделение Кюстендил",
    category: "ADMIN",
    description:
      "Пенсии, болнични и майчинство, обезщетения за безработица, осигурителен стаж. Най-близкото териториално поделение на НОИ е в Кюстендил; в Дупница има офис. Телефон 0700 14 802 е националният на института (от сайта му), а 078 55 92 20 — отдел „Пенсии“ в Кюстендил.",
    address: "ул. „България“ № 46, гр. Кюстендил",
    phone: "0700 14 802",
    phone2: "078 55 92 20",
    email: "Kyustendil@nssi.bg",
    website: "https://nssi.bg",
    hours: "Приемно време за граждани: 08:00–16:30 ч.",
    order: 12,
    verifiedSource: SRC_NOI,
  },
  {
    slug: "noi-ofis-dupnitsa",
    name: "НОИ — Офис Дупница",
    category: "ADMIN",
    description:
      "Офис на ТП на НОИ — Кюстендил в Дупница. Основният телефон е на отдел „Пенсии“; други отдели: краткосрочни плащания 0882 91 23 32, болнични 0882 91 23 33, безработица 0882 91 23 31.",
    address: "ул. „Св. Иван Рилски“ № 1, гр. Дупница",
    phone: "0882 91 23 30",
    phone2: "0700 14 802",
    website: "https://nssi.bg",
    hours: "Приемно време за граждани: 08:00–16:30 ч.",
    order: 13,
    verifiedSource: SRC_NOI,
  },
  {
    slug: "rzok-kyustendil",
    name: "РЗОК Кюстендил (здравна каса)",
    category: "HEALTH",
    description:
      "Районна здравноосигурителна каса — въпроси за здравното осигуряване и за договорените с НЗОК лекари и аптеки в област Кюстендил.",
    address: "ул. „Демокрация“ № 44, вх. Б, гр. Кюстендил",
    phone: "078 559 700",
    website: "https://www.nhif.bg",
    order: 14,
    verifiedSource: SRC_NHIF,
  },
];

async function main() {
  for (const it of items) {
    const data = {
      name: it.name,
      category: it.category,
      description: it.description,
      address: it.address,
      phone: it.phone,
      phone2: it.phone2 ?? "",
      email: it.email ?? "",
      website: it.website ?? "",
      hours: it.hours ?? "",
      order: it.order,
      verifiedAt: VERIFIED_AT,
      verifiedSource: it.verifiedSource,
    };
    const existing = await prisma.service.findUnique({
      where: { slug: it.slug },
      select: { phone: true },
    });
    // update не пипа published; празна чернова (без телефон) се публикува еднократно.
    const publishDraft = existing !== null && existing.phone.trim() === "";
    await prisma.service.upsert({
      where: { slug: it.slug },
      update: publishDraft ? { ...data, published: true } : data,
      create: { slug: it.slug, ...data, published: true },
    });
  }
  console.log(`✔ Основни услуги (проверени 2026-10-23): ${items.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
