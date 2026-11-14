// backend/src/lib/webhookEvents.js
// Изпращачи на изходящите webhook събития за анкети, раздавания и кандидатури (А2): ЕДНО
// място за payload-а, от което го викат ВСИЧКИ пътища — бот (`bot_v18.js`),
// табло (`automation.js`) и планировчик (`services/scheduler.js`). Преди това
// POLL_CLOSED нямаше нито едно извикване, а GIVEAWAY_ENDED тръгваше само от
// командата — платената интеграция мълчеше в най-честите случаи.
//
// Никога не хвърля: webhook е страничен ефект, не бизнес-ефект.
import { prisma } from "./prisma.js";
import { fireWebhooks } from "../services/webhooks.js";

/** Анкетата е затворена. Носи въпрос, опции и крайни бройки — без идентификатори на гласували. */
export async function firePollClosed(pollId, serverId) {
  try {
    const poll = await prisma.poll.findFirst({
      where: { id: pollId, ...(serverId ? { serverId } : {}) },
      include: { votes: { select: { option: true } } },
    });
    if (!poll) return;
    const counts = poll.options.map((_, i) => poll.votes.filter((v) => v.option === i).length);
    await fireWebhooks(poll.serverId, "POLL_CLOSED", {
      pollId: poll.id,
      question: poll.question,
      options: poll.options,
      counts,
      totalVotes: poll.votes.length,
      multiChoice: poll.multiChoice,
      closedAt: poll.closedAt ? poll.closedAt.toISOString?.() ?? poll.closedAt : null,
    });
  } catch (err) {
    console.error("[webhooks] POLL_CLOSED failed:", err?.message);
  }
}

/** Раздаването е приключено (или reroll). */
export async function fireGiveawayEnded(giveaway, winners, entryCount, { reroll = false } = {}) {
  try {
    await fireWebhooks(giveaway.serverId, "GIVEAWAY_ENDED", {
      giveawayId: giveaway.id, prize: giveaway.prize, winners, entryCount, reroll,
    });
  } catch (err) {
    console.error("[webhooks] GIVEAWAY_ENDED failed:", err?.message);
  }
}

/** Подадена кандидатура — от единственото място, което я създава (services/applicationSubmit.js). */
export async function fireApplicationSubmitted(application) {
  try {
    await fireWebhooks(application.serverId, "APPLICATION_SUBMITTED", {
      applicationId: application.id, formId: application.formId, userId: application.userId,
    });
  } catch (err) {
    console.error("[webhooks] APPLICATION_SUBMITTED failed:", err?.message);
  }
}

/**
 * Решение по кандидатура — едно и също тяло от таблото и от бутоните в Discord.
 * Преди решението от Discord не пращаше нищо, а „SUBMITTED“ живееше само в
 * недостижим клон на тернарен оператор.
 */
export async function fireApplicationReviewed(application, action, { reviewerId = null, note = null } = {}) {
  try {
    await fireWebhooks(application.serverId, action === "approve" ? "APPLICATION_APPROVED" : "APPLICATION_DENIED", {
      applicationId: application.id, formId: application.formId, userId: application.userId, reviewerId, note: note || null,
    });
  } catch (err) {
    console.error("[webhooks] APPLICATION review webhook failed:", err?.message);
  }
}

