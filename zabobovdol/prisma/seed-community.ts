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

const causes = [
  {
    slug: "bezplatna-digitalna-pomosht-vazrastni",
    title: "Безплатна дигитална помощ за възрастни хора",
    kind: "OFFER" as const,
    beneficiary: "възрастни жители на Бобов дол",
    location: "гр. Бобов дол",
    description:
      "Имате затруднения с телефона, интернет или електронните услуги? " +
      "Доброволци помагат безплатно — как да си направите имейл, да ползвате " +
      "Viber, да внимавате с измами и още. Потърсете ни и ще намерим начин да " +
      "помогнем на вас или ваш близък.",
    contactEmail: "zabobovdol@carbonstealth.eu",
  },
  {
    slug: "darete-vreme-ili-veshti-nuzhdaeshti-se",
    title: "Дарете време или вещи на нуждаещи се възрастни",
    kind: "OFFER" as const,
    beneficiary: "самотни и нуждаещи се възрастни хора",
    location: "община Бобов дол",
    description:
      "Малките жестове значат много. Ако можете да отделите време за компания, " +
      "помощ в дома или да дарите топли дрехи, продукти или дърва за зимата — " +
      "свържете се с нас. Ще ви насочим към хора, на които това наистина ще " +
      "помогне.",
    contactEmail: "zabobovdol@carbonstealth.eu",
  },
];

const memories = [
  {
    slug: "spomen-praznikat-na-minora",
    title: "Празникът на миньора — гордостта на града",
    author: "Екип на „За Бобов дол“",
    period: "1980-те",
    content:
      "Това е примерен спомен, за да видите как изглежда страницата — заменете " +
      "го с истински.\n\nВ годините на разцвет Празникът на миньора беше сред " +
      "най-светлите дни в Бобов дол. Хора от целия град се събираха, имаше " +
      "музика, награди за най-добрите бригади и гордост по лицата на мъжете, " +
      "слизали в забоя. Градът живееше с ритъма на мините и тази гордост се " +
      "предаваше от поколение на поколение.\n\nИмате свой спомен или стара " +
      "снимка? Споделете го — заедно пазим паметта на Бобов дол жива.",
  },
];

const volunteers = [
  {
    slug: "ekip-za-bobov-dol",
    name: "Екип на „За Бобов дол“",
    area: "цял Бобов дол",
    skills: "телефон и интернет, имейл, е-услуги, безопасност онлайн",
    about:
      "Помагаме безплатно на възрастните хора да се справят с телефона и " +
      "интернет. Пишете ни и ще намерим начин да помогнем на вас или ваш близък.",
    email: "zabobovdol@carbonstealth.eu",
  },
];

async function main() {
  for (const v of volunteers) {
    await prisma.volunteer.upsert({
      where: { slug: v.slug },
      update: { ...v, published: true },
      create: { ...v, published: true },
    });
  }
  for (const c of causes) {
    await prisma.helpCause.upsert({
      where: { slug: c.slug },
      update: { ...c, published: true },
      create: { ...c, published: true },
    });
  }
  for (const m of memories) {
    await prisma.memory.upsert({
      where: { slug: m.slug },
      update: { ...m, published: true },
      create: { ...m, published: true },
    });
  }
  console.log(`✔ Доброволци: ${volunteers.length}, Каузи: ${causes.length}, Спомени: ${memories.length}`);
  await prisma.$disconnect();
  console.log("Готово.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
