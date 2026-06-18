import { prisma } from "./_seedlib";

// Начална снимка на данните за прозрачност (обществени поръчки на община
// Бобов дол). Източник: СИГМА (МИДТ, отворени данни) — sigma.midt.bg.
// Данните се обновяват после автоматично през /api/ingest-transparency.
// Стойностите по-долу са извлечени от официалната страница на общината в СИГМА.

const snapshot = {
  authority: "Община Бобов дол",
  authorityId: "000261363",
  totalValue: "23,6 млн. €",
  contractsCount: 108,
  period: "януари 2021 — юни 2026",
  topSuppliers: [
    { rank: 1, name: 'ДЗЗД „ПЪТИЩА БОБОВ ДОЛ 2" и др. обединение', amount: "4 млн. €", contracts: "1", share: "16,8%" },
    { rank: 2, name: "БУЛПЛАН ИНВЕСТ ООД", amount: "3,7 млн. €", contracts: "7", share: "15,8%" },
    { rank: 3, name: "МАРБЪЛ СТРОЙ ЕООД", amount: "1,8 млн. €", contracts: "3", share: "7,6%" },
    { rank: 4, name: "НСК СОФИЯ ЕООД", amount: "1,6 млн. €", contracts: "4", share: "6,8%" },
    { rank: 5, name: 'ГРОМА ХОЛД ЕООД', amount: "1,3 млн. €", contracts: "2", share: "5,5%" },
    { rank: 6, name: "ЕКО СТРОЙ ПРОЕКТ ЕООД", amount: "1,2 млн. €", contracts: "2", share: "5,1%" },
    { rank: 7, name: "РЕАЛ ТРЕЙДИНГ ЕООД", amount: "1,1 млн. €", contracts: "2", share: "4,8%" },
  ],
  categories: [
    { name: "Строителни и монтажни работи (CPV 45)", amount: "21,3 млн. €", share: "90,1%" },
    { name: "Нефтопродукти, горива, електричество (CPV 09)", amount: "872 хил. €", share: "3,7%" },
    { name: "Отпадъчни води, битови отпадъци, чистота и околна среда (CPV 90)", amount: "586 хил. €", share: "2,5%" },
    { name: "Транспортно оборудване (CPV 34)", amount: "201 хил. €", share: "0,9%" },
    { name: "Хранителни продукти, напитки (CPV 15)", amount: "167 хил. €", share: "0,7%" },
    { name: "Архитектурни, строителни и инженерни услуги (CPV 71)", amount: "148 хил. €", share: "0,6%" },
    { name: "Други категории", amount: "370 хил. €", share: "1,6%" },
  ],
  sourceUrl: "https://sigma.midt.bg/authorities/000261363",
  updatedAt: "2026-06-18T00:00:00.000Z",
};

async function main() {
  await prisma.siteSetting.upsert({
    where: { key: "transparency_sigma" },
    update: { value: JSON.stringify(snapshot) },
    create: { key: "transparency_sigma", value: JSON.stringify(snapshot) },
  });
  console.log("✔ Прозрачност (начална снимка от СИГМА): записана");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
