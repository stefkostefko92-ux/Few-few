import { prisma } from "./_seedlib";

// Примерно предупреждение за измама (редактира се/трие се от админ панела).
// Не е „закачено“ (pinned), за да не показва червена лента на началната
// страница по подразбиране — админът решава кога да го закачи.
const alerts = [
  {
    slug: "falshivi-obazhdaniya-ot-banka",
    title: "Фалшиви обаждания уж от банка",
    summary:
      "Звънят се представят за служители на банка и искат код от SMS или данни на картата. Банка никога не иска това по телефона.",
    body:
      "## Как изглежда измамата\n\nОбаждат се и казват, че има „проблем със сметката“ или „съмнителна транзакция“. Карат ви да продиктувате код от SMS, ПИН или номер на картата.\n\n## Какво да направите\n\n- Затворете телефона.\n- Обадете се сами на банката на телефона от гърба на картата.\n- Никога не казвайте кодове и пароли.\n\nАко вече сте дали данни — веднага поискайте блокиране на картата.",
    severity: "danger",
    pinned: false,
    order: 10,
    published: true,
  },
];

async function main() {
  for (const a of alerts) {
    await prisma.scamAlert.upsert({
      where: { slug: a.slug },
      update: {
        title: a.title,
        summary: a.summary,
        body: a.body,
        severity: a.severity,
        order: a.order,
      },
      create: a,
    });
  }
  console.log(`✔ Предупреждения за измами: ${alerts.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
