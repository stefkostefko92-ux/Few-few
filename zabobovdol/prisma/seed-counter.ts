import { prisma } from "./_seedlib";

// Начална стойност на брояча на посетителите. Може да се смени с
// VISITOR_START в .env. Задава се само ВЕДНЪЖ (create-only) — повторно
// сийдване НЕ нулира реалния брояч.
const START = Number(process.env.VISITOR_START ?? "243");

async function main() {
  const base = Number.isFinite(START) && START >= 0 ? Math.floor(START) : 243;
  const res = await prisma.counter.upsert({
    where: { key: "visitors" },
    update: {}, // не пипаме съществуващ брояч
    create: { key: "visitors", value: base },
  });
  console.log(`✔ Брояч на посетителите: ${res.value} (стартова стойност ${base})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
