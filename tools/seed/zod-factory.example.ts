// zod-factory.example.ts — типизирана, валидирана seed фабрика с provenance (Сийдъра v2.0).
// Шаблон: една Zod схема = единствен източник на истината; всеки запис носи произход
// (source/sourceUrl/fetchedAt/license), за да е одитируем и цитируем. Копирай и адаптирай.
//
// Пускане:  tsx prisma/seed-<тема>.ts   (виж package.json db:seed:*)
import { z } from "zod";
import { prisma } from "./_seedlib"; // преизползва зареждането на .env + PrismaClient

// 1) Провенанс — задължителен на всеки запис от външен източник.
const Provenance = z.object({
  source: z.string().min(2), // напр. „НЗИС аптечен регистър"
  sourceUrl: z.string().url(),
  fetchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // дата на снимката
  license: z.string().min(2), // напр. „CC-BY 4.0 (data.egov.bg)"
});

// 2) Схема на съдържанието (пример: услуга/телефон).
const Service = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug: само малки латински, цифри, тире"),
  name: z.string().min(2),
  phone: z.string().optional(),
  category: z.string(),
  address: z.string().optional(),
  prov: Provenance,
});
type Service = z.infer<typeof Service>;

// 3) Данните (в реалния скрипт: заредени от prisma/data/raw/*.json snapshot).
const rows: unknown[] = [
  {
    slug: "dezhurna-apteka-bobov-dol",
    name: "Дежурна аптека — Бобов дол",
    phone: "0701/00000",
    category: "Здраве",
    prov: { source: "НЗИС аптечен регистър", sourceUrl: "https://opendata.his.bg", fetchedAt: "2026-06-25", license: "отворени данни (атрибуция)" },
  },
];

async function main() {
  // 4) Валидирай ВСЕКИ ред — лош ред спира сийда, не влиза в базата.
  const parsed: Service[] = rows.map((r, i) => {
    const res = Service.safeParse(r);
    if (!res.success) throw new Error(`Ред ${i}: ${res.error.issues.map((x) => x.path.join(".") + " " + x.message).join("; ")}`);
    return res.data;
  });

  // 5) Идемпотентен upsert по стабилен slug. (Провенансът може да иде в коментар/поле.)
  for (const s of parsed) {
    const data = { name: s.name, phone: s.phone ?? "", category: s.category, address: s.address ?? "", published: true };
    await prisma.service.upsert({ where: { slug: s.slug }, update: data, create: { slug: s.slug, ...data } });
  }
  console.log(`✔ ${parsed.length} записа (валидирани + provenance). Източник: ${parsed[0]?.prov.source}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("✘", e.message); process.exit(1); });
