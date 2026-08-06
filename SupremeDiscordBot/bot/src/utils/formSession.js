// bot/src/utils/formSession.js
/**
 * Manages multi-step form sessions for a user.
 * Questions are delivered via DM (select menus for choice questions, text messages for others).
 * Supports logic branching: based on the answer, jump to a specific next question.
 */

import {
  ActionRowBuilder,
  ChannelType,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  submitApplication,
  createTicket,
  updateApplicationReviewMessage,
} from "./api.js";
import { buildReviewEmbed, buildTicketOpenEmbed } from "./embed.js";

import { sessionStore } from "./sessionStore.js";
import { t, resolveLang } from "../i18n/index.js";

// ─── Споделена regex валидация (DM сесия + modal път) ────────────────────────
// ReDoS защита (OWASP A05): validationRegex идва от конфигурацията на формата,
// а входът е необработен потребителски текст в споделен bot процес.
// Два слоя (без тежка зависимост като re2):
//   1) Твърд кап на входа (64 знака) — при толкова кратък вход дори
//      експоненциален backtracking (напр. `(a+)+$`) свършва мигновено.
//   2) Отхвърляме опасни шаблони: вложени quantifier-и са класическият
//      катастрофичен backtracking; такъв шаблон не се изпълнява изобщо.
// Малформиран шаблон → приемаме отговора (не наказваме потребителя за грешка
// в конфигурацията). Връща { ok } — съобщението за грешка е на извикващия.
const REGEX_INPUT_MAX = 64;
const NESTED_QUANTIFIER = /(\([^)]*[+*}][^)]*\)|\[[^\]]*\][+*}]|[+*}])\s*[+*]|\)\s*\{\d+,?\d*\}\s*[+*{]/;

export function validateAnswerAgainstRegex(question, content) {
  if (!question?.validationRegex) return { ok: true };
  if ((content || "").length > REGEX_INPUT_MAX) return { ok: false };
  if (NESTED_QUANTIFIER.test(question.validationRegex)) {
    console.warn(`[formSession] rejected risky validationRegex (nested quantifier) on question ${question.id}: ${question.validationRegex}`);
    return { ok: true }; // не изпълняваме опасния шаблон — приемаме отговора
  }
  try {
    return { ok: new RegExp(question.validationRegex).test(content) };
  } catch {
    console.warn(`[formSession] malformed validationRegex on question ${question.id}: ${question.validationRegex}`);
    return { ok: true };
  }
}

// sessionStore: Redis-backed with in-memory fallback (see sessionStore.js)

// Timeout на per-question collector-ите. Изравнен с обещаните 15 мин И с Redis
// TTL-а на сесията (SESSION_TTL = 900s в sessionStore.js) — преди select/text
// колекторите изтичаха на 5/10 мин, преди самата сесия.
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 минути

/**
 * Start a form session for a user. Sends questions via DM one at a time.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {Object} form     - Form object from the API (must include form.questions[])
 * @param {Object} panel    - Panel that triggered this form (may be a stub for /apply)
 */
export async function runFormSession(interaction, form, panel) {
  const lang = await resolveLang(interaction);

  if (!form?.questions?.length) {
    await interaction.editReply(t("form.noQuestions", lang)).catch(() => {});
    return;
  }

  const sessionKey = `${interaction.user.id}:${form.id}`;

  if (await sessionStore.has(sessionKey)) {
    try {
      const dmChannel = await interaction.user.createDM();
      await dmChannel.send(t("form.alreadyActive", lang));
    } catch {}
    return;
  }

  const questions = [...form.questions].sort((a, b) => a.order - b.order);

  // Note: session must be JSON-serialisable for Redis storage.
  // Collectors are NOT stored — they are recreated per question. `lang` is
  // resolved once here (from the opening interaction) and carried in the
  // session so the whole DM flow — which has no interaction after this —
  // stays in the user's language.
  const session = {
    form,
    panel,
    questions,
    currentIndex: 0,
    answers: {},
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    lang,
  };

  await sessionStore.set(sessionKey, session);

  try {
    const dmChannel = await interaction.user.createDM();
    await sendQuestion(interaction.client, dmChannel, session, sessionKey);
  } catch (err) {
    console.error("Failed to DM user for form:", err.message);
    await sessionStore.delete(sessionKey);
    await interaction.editReply(t("form.dmFailed", lang)).catch(() => {});
  }
}

// ─── Question delivery ────────────────────────────────────────────────────────

async function sendQuestion(client, dmChannel, session, sessionKey) {
  const question = session.questions[session.currentIndex];
  const lang = session.lang || "en";

  if (!question) {
    await finishSession(client, dmChannel, session, sessionKey);
    return;
  }

  const num = session.currentIndex + 1;
  const total = session.questions.length;
  const requiredLabel = question.required ? t("form.requiredLabel", lang) : t("form.optionalLabel", lang);

  await dmChannel.send({
    embeds: [{
      title: t("form.questionTitle", lang, { form: session.form.name, num, total }),
      description: `**${question.label}**${
        question.placeholder ? `\n_${question.placeholder}_` : ""
      }\n\n${requiredLabel}`,
      color: 0x5865f2,
      footer: { text: t("form.cancelHint", lang) },
    }],
  });

  if (question.type === "SELECT" || question.type === "MULTI_SELECT") {
    await sendSelectQuestion(client, dmChannel, session, sessionKey, question);
  } else {
    await sendTextQuestion(client, dmChannel, session, sessionKey, question);
  }
}

async function sendSelectQuestion(client, dmChannel, session, sessionKey, question) {
  const choices = (question.choices || []).slice(0, 25);
  if (!choices.length) {
    // Misconfigured question — fall through as text
    await sendTextQuestion(client, dmChannel, session, sessionKey, question);
    return;
  }

  const isMulti = question.type === "MULTI_SELECT";
  const maxValues = isMulti ? Math.min(choices.length, 25) : 1;
  const lang = session.lang || "en";

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`form_select:${sessionKey}:${question.id}`)
    .setPlaceholder(t("form.selectPlaceholder", lang))
    .setMinValues(1)
    .setMaxValues(maxValues)
    .addOptions(
      choices.map((c) => ({
        label: String(c).slice(0, 100),
        value: String(c).slice(0, 100),
      }))
    );

  await dmChannel.send({ components: [new ActionRowBuilder().addComponents(menu)] });

  const collector = dmChannel.createMessageComponentCollector({
    filter: (i) =>
      i.user.id === session.userId &&
      i.customId.startsWith(`form_select:${sessionKey}`),
    time: SESSION_TIMEOUT_MS,
    max: 1,
  });

  // NOTE: never attach the collector to the session object — sessions are
  // JSON.stringify'd into Redis and a Collector holds a circular client ref.

  collector.on("collect", async (i) => {
    await i.deferUpdate();
    await processAnswer(client, dmChannel, session, sessionKey, question, i.values.join(", "));
  });

  collector.on("end", async (_, reason) => {
    if (reason === "time") {
      await sessionStore.delete(sessionKey);
      dmChannel.send(t("form.timeout", session.lang || "en")).catch(() => {});
    }
  });
}

async function sendTextQuestion(client, dmChannel, session, sessionKey, question) {
  const lang = session.lang || "en";
  const collector = dmChannel.createMessageCollector({
    filter: (m) => m.author.id === session.userId,
    time: SESSION_TIMEOUT_MS,
    max: 1,
  });

  collector.on("collect", async (msg) => {
    const content = msg.content.trim();

    if (content.toLowerCase() === "cancel") {
      await sessionStore.delete(sessionKey);
      await dmChannel.send(t("form.cancelled", lang));
      return;
    }

    if (content.toLowerCase() === "skip") {
      if (question.required) {
        await dmChannel.send(t("form.requiredWarning", lang));
        await sendQuestion(client, dmChannel, session, sessionKey);
        return;
      }
      await processAnswer(client, dmChannel, session, sessionKey, question, "");
      return;
    }

    if (question.minLength && content.length < question.minLength) {
      await dmChannel.send(t("form.tooShort", lang, { min: question.minLength }));
      await sendQuestion(client, dmChannel, session, sessionKey);
      return;
    }

    if (question.maxLength && content.length > question.maxLength) {
      await dmChannel.send(t("form.tooLong", lang, { max: question.maxLength }));
      await sendQuestion(client, dmChannel, session, sessionKey);
      return;
    }

    // Appy.bot-style regex validation
    // ReDoS защита (OWASP A05): validationRegex идва от конфигурацията на формата,
    // а `content` е необработен потребителски вход в споделен bot процес. Зъл
    // (или просто лош) шаблон + дълъг вход може да предизвика катастрофичен
    // backtracking и да блокира event loop-а за всички сървъри.
    //
    // Защита на два слоя (без тежка зависимост като re2):
    //   1) Твърд кап на входа (~64 знака) — на толкова кратък вход дори
    //      експоненциален backtracking (напр. `(a+)+$`) свършва мигновено.
    //   2) Отхвърляме опасни шаблони при приемане: вложени quantifier-и
    //      (група с * / + / {n,}, последвана от * / + / {n,}) са класическият
    //      катастрофичен backtracking. По-добре да откажем шаблона, отколкото
    //      да блокираме event loop-а.
    // Малформиран шаблон се хваща от try/catch.
    if (question.validationRegex) {
      const verdict = validateAnswerAgainstRegex(question, content);
      if (!verdict.ok) {
        await dmChannel.send(
          t("form.invalidFormat", lang, { reason: question.validationMessage || "Answer does not match the expected format. Please try again." })
        );
        await sendQuestion(client, dmChannel, session, sessionKey);
        return;
      }
    }

    await processAnswer(client, dmChannel, session, sessionKey, question, content);
  });

  collector.on("end", async (_, reason) => {
    if (reason === "time") {
      await sessionStore.delete(sessionKey);
      dmChannel.send(t("form.timeout", lang)).catch(() => {});
    }
  });
}

// ─── Answer processing ────────────────────────────────────────────────────────

async function processAnswer(client, dmChannel, session, sessionKey, question, answer) {
  session.answers[question.id] = answer;
  // Logic branching: if this answer has a mapped next question, jump to it
  const branches =
    question.branches && typeof question.branches === "object" ? question.branches : {};
  const nextQuestionId = answer ? branches[answer] : null;

  if (nextQuestionId) {
    const branchIndex = session.questions.findIndex((q) => q.id === nextQuestionId);
    session.currentIndex = branchIndex !== -1 ? branchIndex : session.currentIndex + 1;
  } else {
    session.currentIndex++;
  }

  // Persist updated session (currentIndex + new answer)
  await sessionStore.set(sessionKey, session);

  await sendQuestion(client, dmChannel, session, sessionKey);
}

// ─── Session completion ───────────────────────────────────────────────────────

async function finishSession(client, dmChannel, session, sessionKey) {
  await sessionStore.delete(sessionKey);
  const lang = session.lang || "en";

  await dmChannel.send({
    embeds: [{
      title: t("form.submittedTitle", lang),
      description: t("form.submittedBody", lang),
      color: 0x57f287,
    }],
  });

  if (session.form.isApplication || !session.panel?.categoryId) {
    // No panel category means there is no ticket channel to create
    // (e.g. /form spawn or /apply with a stub panel) — store the answers
    // as a submission record so they are never silently discarded.
    await handleApplicationSubmission(client, session);
  } else {
    await handleTicketFromForm(client, session);
  }
}

// ─── Shared finishing path (also used by the modal submit handler — v2.9) ────
// Same branching finishSession() uses below, minus the DM-only "thank you"
// send: the modal path acks with its own ephemeral confirmation instead.
export async function submitFormAnswers(client, session) {
  if (session.form.isApplication || !session.panel?.categoryId) {
    await handleApplicationSubmission(client, session);
  } else {
    await handleTicketFromForm(client, session);
  }
}

// ─── Application submission ───────────────────────────────────────────────────

async function handleApplicationSubmission(client, session) {
  try {
    // Step 1: Create the application record first to get its real DB ID.
    // We pass null for reviewMessageId — we'll update it after posting the embed.
    const application = await submitApplication(
      session.guildId,
      session.form.id,
      session.userId,
      session.answers,
      null,  // reviewMessageId updated below
      null   // reviewChannelId updated below
    );

    if (!application?.id) {
      console.error("submitApplication returned no ID");
      return;
    }

    // Step 2: Post review embed in the server using the REAL application ID.
    const reviewChannelId = session.form.reviewChannelId;
    if (!reviewChannelId) return; // No review channel configured — application saved, no embed

    const reviewChannel = client.channels.cache.get(reviewChannelId);
    if (!reviewChannel) {
      console.error(`Review channel ${reviewChannelId} not found in cache`);
      return;
    }

    const discordUser = await client.users.fetch(session.userId);

    const { embeds, components } = buildReviewEmbed(
      application,           // contains real .id used for button customIds
      session.form.name,
      discordUser,
      session.questions
    );

    const msg = await reviewChannel.send({ embeds, components });

    // Step 3: Update the application with the Discord message reference
    await updateApplicationReviewMessage(application.id, msg.id, reviewChannelId);
  } catch (err) {
    console.error("Failed to submit application:", err.message);
  }
}

// ─── Ticket from form ─────────────────────────────────────────────────────────

async function handleTicketFromForm(client, session) {
  try {
    const panel = session.panel;
    if (!panel?.categoryId) return; // Cannot create channel without a category configured

    const guild = client.guilds.cache.get(session.guildId);
    if (!guild) return;

    const member = await guild.members.fetch(session.userId).catch(() => null);
    if (!member) return;

    const safeName =
      member.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90) || "user";

    const channel = await guild.channels.create({
      name: `ticket-${safeName}`,
      type: ChannelType.GuildText,
      parent: panel.categoryId,
      permissionOverwrites: [
        { id: guild.id, deny: ["ViewChannel"] },
        { id: session.userId, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
        ...(panel.supportRoleIds || []).map((roleId) => ({
          id: roleId,
          allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageMessages"],
        })),
      ],
    });

    // ticketNumber не се подава: записът в базата се създава по-надолу
    // (createTicket), затова номерът още не съществува тук. Останалото —
    // support ролите и клиентът (за брандирания footer) — е налично.
    await channel.send({
      embeds: [buildTicketOpenEmbed(member.user, panel.name, panel.defaultPriority, {
        supportRoleIds: panel.supportRoleIds || [],
        client,
      })],
    });

    const transcript = session.questions
      .map((q) => `**${q.label}**\n${session.answers[q.id] || "*No answer*"}`)
      .join("\n\n");

    await channel.send({
      embeds: [{
        title: "📋 Form Submission",
        description: transcript.slice(0, 4096),
        color: 0x5865f2,
      }],
    });

    await createTicket(session.guildId, panel.id, session.userId, channel.id);
  } catch (err) {
    console.error("Failed to create ticket from form:", err.message);
  }
}
