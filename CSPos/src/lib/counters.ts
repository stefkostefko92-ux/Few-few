// Атомарни поредни номера. Броячът на продажби/сторно е ЕДИН и се дели от
// продажбите и сторното — четенето и инкрементът стават в транзакция, за да
// няма дублиран номер/УНП при няколко каси (Sale.number/unp са @unique).

import { prisma } from "./db";

/** Следващ пореден номер за фискален документ (продажба или сторно). */
export function nextSaleNumber(): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.setting.findUnique({ where: { key: "saleCounter" } });
    const next = (row ? (JSON.parse(row.value) as number) : 0) + 1;
    await tx.setting.upsert({
      where: { key: "saleCounter" },
      create: { key: "saleCounter", value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    });
    return next;
  });
}
