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
//   → сваляме isPremium=false и маркираме stripeStatus="unpaid" (окончателно;
//     "past_due" значи ГРАТИС и не бива да остава след отнемането).
//
// 14 дни съответства на препоръчания Stripe Smart Retries прозорец (~2 седмици).
// Това е ПОДСИГУРЯВАНЕ — реалното отнемане обикновено идва по-рано през webhook.
//
// Маркерът pastDueSince се поставя при влизане в past_due и се изчиства при
// връщане към active/trialing / успешно плащане / отмяна (виж routes/stripe.js).
//
// v40 — ТУК Е И МЕТЛАТА ЗА ГРАТИСА СЛЕД ОТМЯНА. Отмененият клиент ползва до
// края на платения период (Server.accessUntil / Agency.accessUntil), а Stripe
// НЕ праща събитие в момента на изтичането. Без метла отмененият клиент пази
// тарифата си завинаги. Refund/chargeback НЕ минава оттук — там достъпът пада
// веднага във webhook-а.
//
// ON ERROR: логва, но НЕ хвърля — провал на job-а не бива да събаря backend-а.

import { prisma } from "../lib/prisma.js";
import { syncServerPaidFlag } from "../lib/premium.js";
import { reconcileWhitelabel } from "../services/botNotifier.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GRACE_DAYS = Number(process.env.DUNNING_GRACE_DAYS ?? 14);

export async function runDunningJob() {
  const startedAt = new Date();
  const cutoff = new Date(Date.now() - GRACE_DAYS * MS_PER_DAY);
  const result = { downgraded: 0, agenciesDeactivated: 0, graceExpired: 0, errors: [] };

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
      select: { id: true, name: true, ownerId: true, pastDueSince: true },
      take: 500, // batch
    });

    for (const server of stuck) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.server.update({
            where: { id: server.id },
            // Сваляме достъпа И маркираме статуса като окончателен.
            //
            // Досега тук се запазваше "past_due" — с намерението „да не се
            // активира пак случайно". Постигаше се обратното: "past_due" значи
            // ГРАТИС (дунингът още тече), затова е нарочно извън списъка с
            // прекратени статуси в premium.js. Резултат: сървър, на когото
            // ТОЗИ job вече е отнел достъпа, минаваше през grandfather клаузата
            // при следващ agency-seat цикъл и ставаше платен завинаги.
            // "unpaid" е собственият статус на Stripe за „опитите свършиха“ и
            // е недвусмислен. pastDueSince остава за одит.
            data: { isPremium: false, plan: "free", billingInterval: null, stripeStatus: "unpaid" },
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

        // Известието Е част от отнемането (одит 09.08.2026): trial-ът DM-ва
        // преди изтичане, а дунингът сваляше Premium МЪЛЧАЛИВО — клиентът
        // научаваше от изчезналите функции. Продуктът няма имейл — каналът е
        // Discord DM, както при trial-а. Провалът на DM-а не проваля
        // отнемането: то е решението, известието е учтивост.
        try {
          const { dmUser } = await import("../services/botNotifier.js");
          await dmUser(server.ownerId, {
            title: "Premium was turned off — payment kept failing",
            description:
              `We retried the payment for **${server.name ?? server.id}** for ${GRACE_DAYS} days without success, ` +
              `so the server is now on the Free plan. Your data and settings are kept.\n\n` +
              `To turn Premium back on, update your payment method and resubscribe:\n` +
              `${process.env.FRONTEND_URL || ""}/dashboard/${server.id}/premium`,
            color: 0xf04747,
          });
        } catch (dmErr) {
          console.warn(`[dunning] DM към собственика на ${server.id} не мина: ${dmErr?.message}`);
        }
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

    // ─── v40 · изтекъл гратис след ОТМЯНА ────────────────────────────────
    // customer.subscription.deleted записва докога е платено (accessUntil), а
    // Stripe НЕ праща нищо в момента на изтичането. Без тази метла отмененият
    // клиент пази тарифата си завинаги — точно обратното на намерението.
    // `accessUntil` ОСТАВА — зануляваме само `gracePlan`.
    //
    // ДЕФЕКТЪТ (Кодаджията + червен екип, кръг 2, 07.08.2026): преди тук се
    // зануляваха и двете. Но `accessUntil` вече не е само флаг за достъп — той е
    // КОТВАТА на 30-дневния прозорец за експорт (`lib/premium.js` →
    // `inExportWindow`), а прозорецът е обещан в `legal/DPA.md` §9.1 и стои зад
    // чл. 16(4) Дир. (ЕС) 2019/770. Зануляването при първото дневно пускане след
    // изтичането правеше прозореца ≤24 часа: клиентът получаваше 403 на експорта
    // и метлата почваше да трие архивите му същата нощ.
    //
    // Оставането е безвредно за достъпа: всеки четец сравнява с датата
    // (`accessUntil > now` в `getServerTier`, `{ gt: now }` в
    // `effectivePremiumWhere`), значи изтекла стойност не дава нищо. Тя е
    // исторически факт („платено е до X"), не жив флаг.
    //
    // `gracePlan` става маркерът „вече обработен" — иначе същите редове щяха да
    // се избират всяка нощ и да пълнят одитния дневник.
    const expired = await prisma.server.findMany({
      where: { accessUntil: { not: null, lte: startedAt }, gracePlan: { not: null } },
      select: { id: true, accessUntil: true, gracePlan: true },
      take: 500,
    });
    for (const server of expired) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.server.update({
            where: { id: server.id },
            // `accessUntil` НЕ се зануляв — виж коментара по-горе (котва на
            // прозореца за експорт). Само планът пада.
            data: { gracePlan: null },
          });
          await tx.auditLog.create({
            data: {
              actorId: null,
              actorTag: "SYSTEM_DUNNING_JOB",
              serverId: server.id,
              action: "PREMIUM_GRACE_EXPIRED",
              targetId: server.id,
              metadata: {
                accessUntil: server.accessUntil?.toISOString() ?? null,
                gracePlan: server.gracePlan ?? null,
                expiredAt: startedAt.toISOString(),
              },
            },
          });
          // isPremium вече е false от subscription.deleted; синхронизираме за
          // всеки случай (agency seat може да го държи вдигнат съвсем законно).
          await syncServerPaidFlag(server.id, tx);
        });
        result.graceExpired++;
      } catch (err) {
        result.errors.push({ serverId: server.id, error: err.message });
      }
    }

    const expiredAgencies = await prisma.agency.findMany({
      where: { accessUntil: { not: null, lte: startedAt } },
      select: { id: true, accessUntil: true },
      take: 500,
    });
    for (const agency of expiredAgencies) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.agency.update({
            where: { id: agency.id },
            data: { active: false, accessUntil: null },
          });
          const members = await tx.server.findMany({ where: { agencyId: agency.id }, select: { id: true } });
          for (const s of members) await syncServerPaidFlag(s.id, tx);
          await tx.auditLog.create({
            data: {
              actorId: null,
              actorTag: "SYSTEM_DUNNING_JOB",
              action: "AGENCY_GRACE_EXPIRED",
              targetId: agency.id,
              metadata: {
                accessUntil: agency.accessUntil?.toISOString() ?? null,
                expiredAt: startedAt.toISOString(),
              },
            },
          });
        });
        result.graceExpired++;
      } catch (err) {
        result.errors.push({ agencyId: agency.id, error: err.message });
      }
    }
    console.log(`[dunning] ✅ Изтекъл гратис след отмяна: ${result.graceExpired}`);
  } catch (err) {
    console.error(`[dunning] ❌ Job се провали:`, err.message);
    result.errors.push({ type: "dunning", error: err.message });
  }

  // Ако нещо е паднало (сървър, агенция или изтекъл гратис), приведи бранд
  // ботовете към новия tier — иначе бранд бот на свален сървър виси до рестарт.
  // Едно пълно сверяване покрива всички засегнати наведнъж; fire-and-forget.
  if (result.downgraded || result.agenciesDeactivated || result.graceExpired) {
    reconcileWhitelabel();
  }

  const duration = Date.now() - startedAt.getTime();
  console.log(
    `[dunning] 🏁 Готово за ${duration}ms — ${result.downgraded} свалени, ${result.graceExpired} изтекъл гратис`,
  );
  return result;
}

// Планирането живее в services/scheduler.js (одит 09.08.2026): там runDunningJob
// минава през job() — застъпващ lock, Sentry при провал, почасов JOB_OK пулс и
// CRON_TZ. Тази функция е само РАБОТАТА; никой тук не пуска setTimeout.

