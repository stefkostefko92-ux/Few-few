#!/usr/bin/env node
// backend/scripts/backfill-paid-flag.mjs
// Еднократен backfill: синхронизира суровата `Server.isPremium` колона спрямо
// ПЛАТЕНОТО състояние (собствен план ≠ free ИЛИ активен agency seat).
//
// Защо е нужен: до тази версия закачането на agency seat слагаше само
// `agencyId`, без да вдига `isPremium`. Read пътищата вече резолвират
// ефективния tier през getServerTier, но редовете в базата остават застояли —
// а всеки бъдещ четец на суровата колона (и MRR отчетите) би ги видял грешно.
//
// Идемпотентен и безопасен: пише САМО където изчислената стойност се различава
// от текущата; не пипа планове, абонаменти или trial. Пусни веднъж след деплой.
//
// Употреба (в backend контейнера):
//   node scripts/backfill-paid-flag.mjs           # покажи какво БИ променил
//   node scripts/backfill-paid-flag.mjs --apply   # приложи промените
import { prisma } from "../src/lib/prisma.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const servers = await prisma.server.findMany({
    select: {
      id: true, name: true, isPremium: true, plan: true, agencyId: true,
      agency: { select: { active: true, plan: true } },
    },
  });

  const drift = [];
  for (const s of servers) {
    const ownPaid = !!s.plan && s.plan !== "free";
    const agencyCovered = !!(s.agencyId && s.agency?.active);
    const shouldBe = ownPaid || agencyCovered;
    if (s.isPremium !== shouldBe) {
      drift.push({ ...s, shouldBe, reason: agencyCovered ? "agency seat" : (ownPaid ? "own plan" : "no paid source") });
    }
  }

  console.log(`Прегледани сървъри: ${servers.length}`);
  console.log(`Разминавания: ${drift.length}`);
  for (const d of drift) {
    console.log(`  ${d.isPremium} → ${d.shouldBe}  ${d.id} (${d.name ?? "?"})  [${d.reason}]`);
  }

  if (!drift.length) {
    console.log("✅ Нищо за поправяне — колоната е в синхрон.");
    return;
  }
  if (!APPLY) {
    console.log("\nПробен ход (нищо не е записано). Пусни пак с --apply, за да приложиш.");
    return;
  }

  let fixed = 0;
  for (const d of drift) {
    await prisma.server.update({ where: { id: d.id }, data: { isPremium: d.shouldBe } });
    fixed++;
  }
  console.log(`\n✅ Обновени редове: ${fixed}`);
}

main()
  .catch((err) => { console.error("✗ backfill се провали:", err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
