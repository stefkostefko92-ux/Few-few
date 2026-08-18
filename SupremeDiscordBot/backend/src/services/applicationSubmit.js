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
import { ensureUserStub } from "../lib/ensureUser.js";
import { getServerTier, sanitizeFormForTier } from "../lib/premium.js";

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

  // Правилата важат само докато планът ги покрива. Cooldown и таван на
  // подаванията са Premium (`form.cooldowns`); записани веднъж, те си оставаха
  // в базата и продължаваха да СЕ ИЗПЪЛНЯВАТ след свалянето на плана, защото
  // гейтът стоеше само при запис в `routes/forms.js`. Затваряне на формата
  // (`closedAt`) е базова функция и остава при всяка тарифа.
  // (Червен екип, одит 07.08.2026)
  const { plan } = await getServerTier(serverId);
  sanitizeFormForTier(form, plan);
  if (form.closedAt) {
    return { ok: false, status: 403, error: "Applications are currently closed for this form", code: "FORM_CLOSED" };
  }

  const capped = !!form.maxSubmissions;
  const cools  = !!(form.cooldownSeconds && form.cooldownSeconds > 0);

  // ЗАЯВЯВАНЕ НА МЯСТО с УСЛОВЕН ъпдейт — не Serializable транзакция.
  //
  // Първата поправка на TOCTOU-то обви проверката и записа в Serializable.
  // Инвариантът се спазваше, но интеграционният тест срещу ЖИВ Postgres показа
  // цената: четенето на `formCooldown` е предикатно, а Postgres заключва
  // предикати по-широко от един ред — четирима РАЗЛИЧНИ потребители, подали
  // едновременно, дадоха три отказа „CONCURRENT“ на напълно невинни хора.
  // Точно сценарият на популярен сървър, който току-що е публикувал форма.
  // (Хипотеза на червения екип, доказана с интеграционен тест 07.08.2026.)
  //
  // Атомарността тук не идва от нивото на изолация, а от САМАТА заявка:
  // `updateMany` с условие в `where` заключва РЕДА на този потребител и или
  // сработва, или връща 0. Различните потребители са различни редове, значи не
  // се засичат. Същият патърн като `trial.js` за еднократния пробен период.
  const now = new Date();
  const claimWhere = { formId, userId };
  if (capped) claimWhere.submissionCount = { lt: form.maxSubmissions };
  if (cools) claimWhere.lastSubmittedAt = { lte: new Date(now.getTime() - form.cooldownSeconds * 1000) };

  const claimed = await prisma.formCooldown.updateMany({
    where: claimWhere,
    data: { submissionCount: { increment: 1 }, lastSubmittedAt: now },
  });

  if (claimed.count === 0) {
    // Или редът още не съществува (първо подаване), или условието не мина.
    // Разликата се решава от опита за създаване: уникалният ключ (formId,userId)
    // е арбитърът, а не второ четене, което пак би било TOCTOU.
    try {
      await prisma.formCooldown.create({
        data: { formId, userId, submissionCount: 1, lastSubmittedAt: now },
      });
    } catch (err) {
      if (err?.code !== "P2002") throw err;
      // Редът съществува → правилото наистина е спряло подаването. Чак СЕГА
      // четем, и то само за да кажем ЗАЩО — решението вече е взето атомарно.
      const cd = await prisma.formCooldown.findUnique({
        where: { formId_userId: { formId, userId } },
      });
      if (capped && cd && cd.submissionCount >= form.maxSubmissions) {
        return {
          ok: false, status: 429, code: "MAX_SUBMISSIONS",
          error: `You have reached the maximum of ${form.maxSubmissions} submissions for this form`,
        };
      }
      if (cools && cd) {
        const elapsed = (Date.now() - cd.lastSubmittedAt.getTime()) / 1000;
        const remaining = Math.max(1, Math.ceil(form.cooldownSeconds - elapsed));
        return {
          ok: false, status: 429, code: "COOLDOWN",
          error: `Please wait ${formatDuration(remaining)} before submitting again`,
          remainingSeconds: remaining,
        };
      }
      // Загубено състезание за СЪЩИЯ потребител без нарушено правило (двоен
      // клик в милисекунди). Отказваме, за да няма двоен запис.
      return {
        ok: false, status: 429, code: "CONCURRENT",
        error: "Another submission is already being processed. Please try again.",
      };
    }
  }

  // Мястото Е заето. Оттук нататък провал значи, че сме вдигнали брояча без да
  // запишем кандидатура — затова връщаме заявката назад, вместо да оставим
  // клиента с изгубено място.
  try {
    // Кандидатстващият може никога да не е влизал в таблото, а `applications`
    // има външен ключ към `users` с RESTRICT — без този stub вмъкването гърми.
    await ensureUserStub(prisma, userId);

    const application = await prisma.application.create({
      data: {
        serverId, formId, userId, answers,
        reviewMessageId: reviewMessageId || null,
        reviewChannelId: reviewChannelId || null,
        status: "PENDING",
      },
    });

    return { ok: true, application, pingRoleIds: form.pingRoleIds || [] };
  } catch (err) {
    await prisma.formCooldown.updateMany({
      where: { formId, userId, submissionCount: { gt: 0 } },
      data: { submissionCount: { decrement: 1 } },
    }).catch(() => {});
    throw err;
  }
}

