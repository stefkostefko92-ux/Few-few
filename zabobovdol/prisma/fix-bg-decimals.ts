import { prisma } from "./_seedlib";
import { hasDotDecimalMoney, toBgMoneyDecimals } from "../src/lib/bg-decimals";

// Еднократна поправка на ВЕЧЕ засетите отговори (seed-ът върви само при
// първо пускане): „1.95583“ → „1,95583“, „25.56 евро“ → „25,56 евро“.
// Пипа само сумите пред валута и фиксирания курс (виж src/lib/bg-decimals.ts),
// нищо друго в текста. Безопасно е да се пусне повече от веднъж.
//   npm run db:fix:decimals

async function main() {
  const rows = await prisma.faq.findMany({ select: { id: true, slug: true, answer: true, steps: true } });
  let n = 0;
  for (const r of rows) {
    if (!hasDotDecimalMoney(r.answer) && !hasDotDecimalMoney(r.steps)) continue;
    await prisma.faq.update({
      where: { id: r.id },
      data: { answer: toBgMoneyDecimals(r.answer), steps: toBgMoneyDecimals(r.steps) },
    });
    console.log(`  ${r.slug}`);
    n++;
  }
  console.log(`✔ Десетична запетая в сумите: ${n} отговора`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
