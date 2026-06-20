import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Зарежда .env при локално стартиране (в Docker променливите идват от средата).
if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of env.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // няма .env — разчитаме на средата
  }
}

const prisma = new PrismaClient();

// ВНИМАНИЕ: данните по-долу са ПРИМЕРНИ (placeholder), за да видите как
// изглежда сайтът. Заменете ги с реални от административния панел.
const NOTE = " [примерни данни — заменете от админ панела]";

async function main() {
  // --- Администратор ---
  const email = (process.env.ADMIN_EMAIL ?? "admin@carbonstealth.eu").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME ?? "Администратор";

  // Безопасност: не създаваме администратор със слаба/примерна парола.
  const WEAK = ["", "changeme12345", "changeme", "password", "admin"];
  if (password.length < 10 || WEAK.includes(password.toLowerCase())) {
    console.error(
      "\n✖ ADMIN_PASSWORD липсва или е твърде слаб/примерен.\n" +
        "  Задайте силна парола (поне 10 знака) в .env и пуснете отново:\n" +
        '    ADMIN_PASSWORD="ваша_силна_парола"\n',
    );
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 11);

  await prisma.user.upsert({
    where: { email },
    update: { name, role: "ADMIN", active: true },
    create: { email, name, role: "ADMIN", passwordHash },
  });
  console.log(`✔ Администратор: ${email}`);

  // --- Услуги и телефони ---
  const services = [
    {
      slug: "speshen-telefon-112",
      name: "Спешни случаи 112",
      category: "EMERGENCY" as const,
      description: "Единен европейски номер за спешни повиквания: полиция, спешна помощ, пожарна.",
      phone: "112",
      isEmergency: true,
      order: 1,
    },
    {
      slug: "kmetstvo-bobov-dol",
      name: "Община Бобов дол (пример)",
      category: "ADMIN" as const,
      description: "Информация и административни услуги за гражданите." + NOTE,
      address: "гр. Бобов дол, пл. „27-ми октомври“ (пример)",
      phone: "000 000 000",
      hours: "Пон–Пет 08:30–17:00",
      order: 2,
    },
    {
      slug: "speshna-pomosht-bobov-dol",
      name: "Спешна медицинска помощ (пример)",
      category: "HEALTH" as const,
      description: "Денонощна спешна медицинска помощ." + NOTE,
      phone: "000 000 000",
      isEmergency: true,
      order: 3,
    },
    {
      slug: "apteka-bobov-dol",
      name: "Аптека (пример)",
      category: "HEALTH" as const,
      description: "Лекарства и консултации." + NOTE,
      address: "гр. Бобов дол (пример)",
      phone: "000 000 000",
      hours: "Пон–Съб 08:00–18:00",
      order: 4,
    },
    {
      slug: "elektrosnabdjavane-avarii",
      name: "Електроснабдяване — аварии (пример)",
      category: "UTILITY" as const,
      description: "Съобщаване на аварии по електрозахранването." + NOTE,
      phone: "000 000 000",
      order: 5,
    },
  ];
  for (const s of services) {
    await prisma.service.upsert({
      where: { slug: s.slug },
      update: s,
      create: s,
    });
  }
  console.log(`✔ Услуги: ${services.length}`);

  // --- Как да… ---
  const faqs = [
    {
      slug: "kak-da-zapazya-chas-pri-lichen-lekar-onlayn",
      question: "Как да запазя час при личния лекар онлайн?",
      category: "Здраве",
      answer:
        "Много лични лекари вече приемат записване по телефон или онлайн. " +
        "Първо проверете дали вашият лекар има онлайн система или страница за записване." +
        NOTE,
      steps:
        "Намерете телефона или сайта на кабинета на личния лекар\nОбадете се или влезте в системата за записване\nИзберете свободен ден и час\nЗапишете си часа и потвърждението",
      tags: "лекар, здраве, час",
      order: 1,
    },
    {
      slug: "kak-da-platya-mestni-danatsi-onlayn",
      question: "Как да платя местни данъци и такси онлайн?",
      category: "Документи и плащания",
      answer:
        "Местните данъци (напр. данък сгради и такса смет) често могат да се " +
        "плащат онлайн с банкова карта или чрез електронно банкиране." +
        NOTE,
      steps:
        "Подгответе си партидния номер или ЕГН\nВлезте в портала за плащане на местни данъци\nНамерете задължението си\nПлатете с карта и запазете разписката",
      relatedLinks: "Портал за електронни услуги|https://egov.bg",
      tags: "данъци, плащане, такса смет",
      order: 2,
    },
    {
      slug: "kak-da-razpoznavam-onlayn-izmami",
      question: "Как да разпознавам онлайн измами и фалшиви съобщения?",
      category: "Безопасност",
      answer:
        "Измамниците често пращат съобщения, които плашат или бързат. " +
        "Никога не давайте парола, ПИН или код от SMS на непознат и не " +
        "натискайте съмнителни връзки.",
      steps:
        "Не вярвайте на спешни искания за пари или данни\nПроверявайте подателя внимателно\nНе давайте кодове и пароли по телефон или съобщение\nПри съмнение се консултирайте с близък човек",
      tags: "измами, безопасност, фишинг",
      order: 3,
    },
  ];
  for (const f of faqs) {
    await prisma.faq.upsert({ where: { slug: f.slug }, update: f, create: f });
  }
  console.log(`✔ Как да…: ${faqs.length}`);

  // --- Местен бизнес ---
  const businesses = [
    {
      slug: "primeren-magazin",
      name: "Магазин (пример)",
      category: "SHOP" as const,
      description: "Хранителни стоки и стоки за бита." + NOTE,
      address: "гр. Бобов дол (пример)",
      phone: "000 000 000",
      featured: true,
      order: 1,
    },
    {
      slug: "primerno-zavedenie",
      name: "Заведение (пример)",
      category: "FOOD" as const,
      description: "Домашна кухня и кафе." + NOTE,
      address: "гр. Бобов дол (пример)",
      order: 2,
    },
  ];
  for (const b of businesses) {
    await prisma.business.upsert({ where: { slug: b.slug }, update: b, create: b });
  }
  console.log(`✔ Бизнес: ${businesses.length}`);

  // --- Събитие ---
  const startAt = new Date();
  startAt.setDate(startAt.getDate() + 14);
  startAt.setHours(18, 0, 0, 0);
  await prisma.event.upsert({
    where: { slug: "primerno-sabitie" },
    update: {},
    create: {
      slug: "primerno-sabitie",
      title: "Примерно събитие в Бобов дол",
      description: "Това е примерно събитие, за да видите как изглежда страницата." + NOTE,
      location: "Читалище, гр. Бобов дол (пример)",
      startAt,
      published: true,
    },
  });
  console.log("✔ Събитие: 1");

  // --- Новина ---
  await prisma.post.upsert({
    where: { slug: "dobre-doshli" },
    update: {},
    create: {
      slug: "dobre-doshli",
      title: "Добре дошли в „За Бобов дол“",
      excerpt: "Стартирахме портала за услуги, информация и помощ за жителите на града.",
      content:
        "Това е първата публикация в портала **За Бобов дол**.\n\n" +
        "Тук ще намирате важни телефони, обяснения как да ползвате е-услуги, " +
        "събития и обяви. Заменете тази публикация със своя от админ панела.",
      published: true,
      publishedAt: new Date(),
    },
  });
  console.log("✔ Новина: 1");

  console.log("\nГотово. Влезте в /admin/login с данните от .env.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
