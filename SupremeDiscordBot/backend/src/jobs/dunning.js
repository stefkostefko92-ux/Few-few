// backend/src/jobs/dunning.js
// C3 — Dunning guard (сървърна защита срещу безсрочен Premium при past_due).
//
// ПОЛИТИКА
// --------
// Когато плащане се провали, Stripe слага абонамента в `past_due` и пуска Smart
// Retries. През този grace период оставяме `isPremium=true` (виж
// customer.subscription.updated в routes/stripe.js). НОРМАЛНО Stripe довежда
// абонамента до `unpaid` или `canceled` след изчерпани ретраи и тогава webhook-ът
// сваля достъпа.
//
// Дупката: при определени dunning настройки (или ако webhook-и се изгубят)
// абонаментът може да остане `past_due` БЕЗ финален статус — и сървърът да пази
// Premium безсрочно без плащане. Този job е независимата сървърна защита:
//
//   Ако stripeStatus === "past_due" И pastDueSince е по-старо от GRACE_DAYS (14)
//   → сваляме isPremium=false (достъпът се отнема), запазвайки stripeStatus.
//
// 14 дни съответства на препоръчания Stripe Smart Retries прозорец (~2 седмици).
// Това е ПОДСИГУРЯВАНЕ — реалното отнемане обикновено идва по-рано през webhook.
//
// Маркерът pastDueSince се поставя при влизане в past_due и се изчиства при
// връщане към active/trialing / успешно плащане / отмяна (виж routes/stripe.js).
//
// ON ERROR: логва, но НЕ хвърля — провал на job-а не бива да събаря backend-а.

import { prisma } from "../lib/prisma.js";
import { syncServerPaidFlag } from "../lib/premium.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GRACE_DAYS = Number(process.env.DUNNING_GRACE_DAYS ?? 14);

export async function runDunningJob() {
  const startedAt = new Date();
  const cutoff = new Date(Date.now() - GRACE_DAYS * MS_PER_DAY);
  const result = { downgraded: 0, agenciesDeactivated: 0, errors: [] };

  console.log(
    `[dunning] 🕐 Старт ${startedAt.toISOString()} — праг ${GRACE_DAYS} дни (преди ${cutoff.toISOString()})`
  );

  try {
    // Сървъри, заседнали в past_due по-дълго от grace прозореца.
    const stuck = await prisma.server.findMany({
      where: {
        isPremium: true,
        stripeStatus: "past_due",
        pastDueSince: { not: null, lt: cutoff },
      },
      select: { id: true, pastDueSince: true },
      take: 500, // batch
    });

    for (const server of stuck) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.server.update({
            where: { id: server.id },
            // Сваляме достъпа, но запазваме stripeStatus="past_due" и
            // pastDueSince — за одит и за да не се „активира“ пак случайно.
            data: { isPremium: false, plan: "free", billingInterval: null },
          });
          await tx.auditLog.create({
            data: {
              actorId: null,
              actorTag: "SYSTEM_DUNNING_JOB",
              serverId: server.id,
              action: "PREMIUM_REVOKED_DUNNING",
              targetId: server.id,
              metadata: {
                reason: "past_due exceeded grace window",
                graceDays: GRACE_DAYS,
                pastDueSince: server.pastDueSince?.toISOString() ?? null,
                revokedAt: new Date().toISOString(),
              },
            },
          });
        });
        result.downgraded++;
        console.log(`[dunning] ❌ Server ${server.id} → Premium отнет (past_due >${GRACE_DAYS}д)`);
      } catch (err) {
        result.errors.push({ serverId: server.id, error: err.message });
      }
    }

    console.log(`[dunning] ✅ Свалени от Premium: ${result.downgraded}`);

    // Same safeguard for Agency plans: an agency stuck in past_due past the
    // grace window is deactivated → all its member servers lose the tier via
    // getServerTier (which gates on agency.active).
    const stuckAgencies = await prisma.agency.findMany({
      where: { active: true, stripeStatus: "past_due", pastDueSince: { not: null, lt: cutoff } },
      select: { id: true, pastDueSince: true },
      take: 500,
    });
    for (const agency of stuckAgencies) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.agency.update({ where: { id: agency.id }, data: { active: false } });
          // Паричен инвариант: деактивацията прави покритите сървъри неплатени
          // → синхронизирай суровата isPremium (иначе остават grandfather-нат
          // безплатен white-label; същият пропуск като webhook пътищата).
          const members = await tx.server.findMany({ where: { agencyId: agency.id }, select: { id: true } });
          for (const s of members) await syncServerPaidFlag(s.id, tx);
          await tx.auditLog.create({
            data: {
              actorId: null,
              actorTag: "SYSTEM_DUNNING_JOB",
              action: "AGENCY_DEACTIVATED_DUNNING",
              targetId: agency.id,
              metadata: {
                reason: "past_due exceeded grace window",
                graceDays: GRACE_DAYS,
                pastDueSince: agency.pastDueSince?.toISOString() ?? null,
                revokedAt: new Date().toISOString(),
              },
            },
          });
        });
        result.agenciesDeactivated++;
        console.log(`[dunning] ❌ Agency ${agency.id} → деактивиран (past_due >${GRACE_DAYS}д)`);
      } catch (err) {
        result.errors.push({ agencyId: agency.id, error: err.message });
      }
    }
    console.log(`[dunning] ✅ Деактивирани агенции: ${result.agenciesDeactivated}`);
  } catch (err) {
    console.error(`[dunning] ❌ Job се провали:`, err.message);
    result.errors.push({ type: "dunning", error: err.message });
  }

  const duration = Date.now() - startedAt.getTime();
  console.log(`[dunning] 🏁 Готово за ${duration}ms — ${result.downgraded} свалени`);
  return result;
}

// ─── Schedule — runs at 03:30 UTC daily (след retention job) ──────────────────
export function scheduleDunning() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(3, 30, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const msUntil = next.getTime() - now.getTime();

  setTimeout(() => {
    runDunningJob().catch((err) => console.error("[dunning] Unhandled error:", err));
    setInterval(() => {
      runDunningJob().catch((err) => console.error("[dunning] Unhandled error:", err));
    }, 24 * 60 * 60 * 1000);
  }, msUntil);

  console.log(`[dunning] 📅 Планиран — следващ старт ${next.toISOString()}`);
}
