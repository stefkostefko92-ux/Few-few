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

  if ((form.cooldownSeconds && form.cooldownSeconds > 0) || form.maxSubmissions) {
    const cooldown = await prisma.formCooldown.findUnique({
      where: { formId_userId: { formId, userId } },
    });
    if (cooldown) {
      if (form.maxSubmissions && cooldown.submissionCount >= form.maxSubmissions) {
        return {
          ok: false, status: 429, code: "MAX_SUBMISSIONS",
          error: `You have reached the maximum of ${form.maxSubmissions} submissions for this form`,
        };
      }
      if (form.cooldownSeconds && form.cooldownSeconds > 0) {
        const elapsed = (Date.now() - cooldown.lastSubmittedAt.getTime()) / 1000;
        if (elapsed < form.cooldownSeconds) {
          const remaining = Math.ceil(form.cooldownSeconds - elapsed);
          return {
            ok: false, status: 429, code: "COOLDOWN",
            error: `Please wait ${formatDuration(remaining)} before submitting again`,
            remainingSeconds: remaining,
          };
        }
      }
    }
  }

  // Кандидатстващият може никога да не е влизал в таблото, а `applications`
  // има външен ключ към `users` с RESTRICT — без този stub вмъкването гърми.
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, username: userId, discriminator: "0" },
    update: {},
  });

  const application = await prisma.application.create({
    data: {
      serverId, formId, userId, answers,
      reviewMessageId: reviewMessageId || null,
      reviewChannelId: reviewChannelId || null,
      status: "PENDING",
    },
  });

  await prisma.formCooldown.upsert({
    where: { formId_userId: { formId, userId } },
    create: { formId, userId, lastSubmittedAt: new Date(), submissionCount: 1 },
    update: { lastSubmittedAt: new Date(), submissionCount: { increment: 1 } },
  });

  return { ok: true, application, pingRoleIds: form.pingRoleIds || [] };
}
