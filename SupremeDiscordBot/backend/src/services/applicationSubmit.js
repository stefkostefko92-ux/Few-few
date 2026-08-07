// backend/src/services/applicationSubmit.js
// ЕДИН източник на истина за „приема ли се тази кандидатура“.
//
// ЗАЩО СЪЩЕСТВУВА (одит 07.08.2026): правилата — затворена форма, cooldown,
// таван на подаванията — бяха реализирани ЦЯЛОСТНО в `routes/applications.js`,
// но ботът вика `POST /bot/application/submit`, който беше гол
// `prisma.application.create` БЕЗ нито една проверка. А формата се попълва
// ПРЕЗ БОТА — тоест единственият реален път беше и единственият незащитен.
//
// Резултат: клиент включва „максимум 1 кандидатура“ и 24-часов cooldown
// (Premium функция `form.cooldowns`), а хората подават неограничено. Затворена
// форма продължава да приема. Платена функция, която не прави нищо.
//
// Поправката НЕ е копие на проверките във втория маршрут — това ражда точно
// дрейфа, който вече ни костваше време другаде. Логиката живее ТУК, а двата
// маршрута само я викат.

import { prisma } from "../lib/prisma.js";

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.ceil(seconds / 3600)}h`;
  return `${Math.ceil(seconds / 86400)}d`;
}

/**
 * Подава кандидатура при спазени правила на формата.
 *
 * @returns {Promise<{ok:true, application:object, pingRoleIds:string[]}
 *                  | {ok:false, status:number, error:string, code?:string, remainingSeconds?:number}>}
 */
export async function submitApplication({
  serverId, formId, userId, answers, reviewMessageId, reviewChannelId,
}) {
  if (!serverId || !formId || !userId || !answers) {
    return { ok: false, status: 400, error: "serverId, formId, userId and answers are required" };
  }

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: {
      id: true, serverId: true,
      closedAt: true, cooldownSeconds: true, maxSubmissions: true,
      pingRoleIds: true,
    },
  });
  // Скоупът по serverId е и cross-tenant гард: чужд formId не минава.
  if (!form || form.serverId !== serverId) {
    return { ok: false, status: 404, error: "Form not found" };
  }
  if (form.closedAt) {
    return { ok: false, status: 403, error: "Applications are currently closed for this form", code: "FORM_CLOSED" };
  }

  const guarded = !!((form.cooldownSeconds && form.cooldownSeconds > 0) || form.maxSubmissions);

  // Проверката и записът в ЕДНА Serializable транзакция.
  //
  // Дефектът (червен екип, 07.08.2026): четенето на `formCooldown` и вдигането
  // на брояча стояха отделно. Две едновременни подавания четат `count = 0`,
  // двете минават покрай `maxSubmissions: 1` и двете записват — таванът се
  // заобикаля с двоен клик. Същият TOCTOU, който вече поправихме за лимитите
  // на панелите (`lib/withinLimit.js`); тук лимитът е БРОЯЧ в колона, не брой
  // редове, затова транзакцията е тук, а не през онзи помощник.
  try {
    const application = await prisma.$transaction(
      async (tx) => {
        if (guarded) {
          const cooldown = await tx.formCooldown.findUnique({
            where: { formId_userId: { formId, userId } },
          });
          if (cooldown) {
            if (form.maxSubmissions && cooldown.submissionCount >= form.maxSubmissions) {
              throw reject({
                ok: false, status: 429, code: "MAX_SUBMISSIONS",
                error: `You have reached the maximum of ${form.maxSubmissions} submissions for this form`,
              });
            }
            if (form.cooldownSeconds && form.cooldownSeconds > 0) {
              const elapsed = (Date.now() - cooldown.lastSubmittedAt.getTime()) / 1000;
              if (elapsed < form.cooldownSeconds) {
                const remaining = Math.ceil(form.cooldownSeconds - elapsed);
                throw reject({
                  ok: false, status: 429, code: "COOLDOWN",
                  error: `Please wait ${formatDuration(remaining)} before submitting again`,
                  remainingSeconds: remaining,
                });
              }
            }
          }
        }

        // Кандидатстващият може никога да не е влизал в таблото, а
        // `applications` има външен ключ към `users` с RESTRICT — без този stub
        // вмъкването гърми.
        await tx.user.upsert({
          where: { id: userId },
          create: { id: userId, username: userId, discriminator: "0" },
          update: {},
        });

        const row = await tx.application.create({
          data: {
            serverId, formId, userId, answers,
            reviewMessageId: reviewMessageId || null,
            reviewChannelId: reviewChannelId || null,
            status: "PENDING",
          },
        });

        await tx.formCooldown.upsert({
          where: { formId_userId: { formId, userId } },
          create: { formId, userId, lastSubmittedAt: new Date(), submissionCount: 1 },
          update: { lastSubmittedAt: new Date(), submissionCount: { increment: 1 } },
        });

        return row;
      },
      { isolationLevel: "Serializable" },
    );

    return { ok: true, application, pingRoleIds: form.pingRoleIds || [] };
  } catch (err) {
    if (err?.__reject) return err.__reject;
    // P2034 = сериализационен конфликт (Postgres 40001): друго подаване на СЪЩИЯ
    // потребител за същата форма е спечелило състезанието. Не ретрайваме сами —
    // при достигнат таван ретраят би стигнал до същия отказ, а двойният клик не
    // бива да ражда два записа.
    if (err?.code === "P2034") {
      return {
        ok: false, status: 429, code: "CONCURRENT",
        error: "Another submission is already being processed. Please try again.",
      };
    }
    throw err;
  }
}

/** Отказ, пренесен през `throw` — единственият начин да върнеш транзакция. */
function reject(payload) {
  const err = new Error(payload.code || "REJECTED");
  err.__reject = payload;
  return err;
}
