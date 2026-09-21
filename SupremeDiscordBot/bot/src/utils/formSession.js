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
import { SUCCESS, INFO, DANGER } from "./colors.js";

import { sessionStore } from "./sessionStore.js";
import { t, resolveLang } from "../i18n/index.js";

// ─── Споделена regex валидация (DM сесия + modal път) ────────────────────────
// ReDoS защита (OWASP A05): validationRegex идва от конфигурацията на формата
// (задава я админ на сървъра), входът е необработен потребителски текст, а
// процесът на бота е СПОДЕЛЕН между всички наематели. Злонамерен админ може да
// сложи катастрофичен шаблон (`(a|a)*$`, `(a+)+$`, …) и всяко подаване да
// замрази event loop-а за ВСИЧКИ сървъри.
//
// Патърн-блоклист + кап на входа НЕ е достатъчен: blocklist-ите теч(ат)
// (alternation-overlap го заобикаля), а катастрофичният backtracking е
// експоненциален в дължината на входа — 64 знака пак виси. Затова недоверения
// regex се изпълнява в WORKER thread с твърд timeout: катастрофичен шаблон
// блокира еднократния worker (който убиваме), не главния loop. Зависимост:
// нула (вграденото `node:worker_threads`), за разлика от re2 (нативен билд).
import { Worker } from "node:worker_threads";

const REGEX_INPUT_MAX = 512;      // разумен таван на входа (не защита сам по себе си)
// Щедър timeout: катастрофичният backtracking върви в ИЗОЛИРАН worker и НЕ
// блокира главния event loop — единствената цена е колко чака подаващият
// потребител. Затова таванът покрива уверено worker startup-а под натоварване
// (иначе легитимен regex „изтича“ фалшиво), без да отваря DoS към другите
// наематели. 1s: легитимните свършват за <5ms, катастрофичните се убиват.
const REGEX_TIMEOUT_MS = 1000;

// Самостоятелен worker: компилира и тества, връща булев резултат.
const WORKER_SRC = `
  const { parentPort, workerData } = require("node:worker_threads");
  try {
    const re = new RegExp(workerData.pattern);
    parentPort.postMessage({ ok: re.test(workerData.content) });
  } catch {
    parentPort.postMessage({ ok: true, malformed: true }); // грешен шаблон → приемаме
  }
`;

// Таван на ЕДНОВРЕМЕННИТЕ worker-и.
//
// ДЕФЕКТЪТ (одит сигурност, 16.08.2026): изолацията в worker реши правилния
// проблем (катастрофичният backtracking не блокира event loop-а), но създаде
// втори: worker се раждаше при ВСЕКИ отговор, без таван. Измерено на живо:
//      20 едновременни → RSS  44 →  250 MB   (~10 MB/worker)
//     100 едновременни → RSS  44 →  882 MB
//     300 едновременни → RSS  44 → 1800 MB, а самото пускане отне 9.5s
//
// Катастрофичен шаблон държи своя worker цяла секунда, значи припокриването е
// максимално точно когато най-боли. Рейд или просто голям сървър с форма стига
// до изчерпване на паметта — тоест защитата срещу ReDoS ставаше нов DoS вектор,
// само че по памет вместо по процесор. Забавянето на пускането удря и
// легитимните кандидатури.
//
// 8 е избрано по мярка, не на око: легитимен шаблон свършва за <5ms, значи 8
// нишки поемат ~1600 проверки/сек. Таванът хапе САМО катастрофичните (1s всяка),
// които и без това искаме да ограничим. Най-лошият случай по памет е ~80 MB.
const MAX_CONCURRENT_REGEX_WORKERS = 8;
let activeRegexWorkers = 0;
let capWarned = false;

/** @internal за тестове */
export function _activeRegexWorkers() { return activeRegexWorkers; }

export function validateAnswerAgainstRegex(question, content) {
  if (!question?.validationRegex) return Promise.resolve({ ok: true });
  if ((content || "").length > REGEX_INPUT_MAX) return Promise.resolve({ ok: false });

  // На тавана ПРИЕМАМЕ, без да пускаме шаблона. Същият избор като при таймаут и
  // при грешка: валидацията на формат е удобство за подаващия, а живият бот е
  // условие за ВСИЧКИ наематели. Отказът тук би дал на нападателя точно това,
  // което търси — чужди кандидатури да падат.
  if (activeRegexWorkers >= MAX_CONCURRENT_REGEX_WORKERS) {
    if (!capWarned) {
      capWarned = true;
      console.warn(
        `[formSession] таванът от ${MAX_CONCURRENT_REGEX_WORKERS} едновременни regex worker-а е достигнат — ` +
        "проверката на формат се прескача, докато натискът спадне. Този ред се показва веднъж на процес.",
      );
    }
    return Promise.resolve({ ok: true });
  }

  return new Promise((resolve) => {
    let done = false;
    let counted = false;
    const release = () => { if (counted) { counted = false; activeRegexWorkers--; } };
    const finish = (v) => { if (!done) { done = true; release(); resolve(v); } };
    let worker;
    try {
      activeRegexWorkers++;
      counted = true;
      worker = new Worker(WORKER_SRC, { eval: true, workerData: { pattern: question.validationRegex, content: content || "" } });
    } catch {
      return finish({ ok: true }); // не можем да стартираме worker → не наказвай потребителя
    }
    const timer = setTimeout(() => {
      console.warn(`[formSession] validationRegex timeout (>${REGEX_TIMEOUT_MS}ms, катастрофичен?) q${question.id}: ${question.validationRegex}`);
      worker.terminate().catch(() => {});
      finish({ ok: true }); // не изпълнявай опасния шаблон срещу event loop-а — приеми
    }, REGEX_TIMEOUT_MS);
    worker.once("message", (m) => { clearTimeout(timer); worker.terminate().catch(() => {}); finish({ ok: !!m.ok }); });
    worker.once("error", () => { clearTimeout(timer); worker.terminate().catch(() => {}); finish({ ok: true }); });
  });
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
  // Ключът на сесията носи formId, тоест един потребител можеше да води ДВЕ
  // РАЗЛИЧНИ форми едновременно. И двете създават collector върху СЪЩИЯ DM
  // канал с филтър „автор == потребителят" → един отговор влиза и в двете
  // сесии: въпросите се разминават, отговорите се смесват, кандидатурата
  // излиза безсмислена. (Качествения, 07.08.2026)
  //
  // В DM няма как да различим за коя форма е отговорът, затова инвариантът е
  // една активна форма на потребител — с изричен ключ-ключалка.
  const userLockKey = `lock:${interaction.user.id}`;

  if (await sessionStore.has(sessionKey) || await sessionStore.has(userLockKey)) {
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
  await sessionStore.set(userLockKey, { formId: form.id });

  try {
    const dmChannel = await interaction.user.createDM();
    await sendQuestion(interaction.client, dmChannel, session, sessionKey);
  } catch (err) {
    console.error("Failed to DM user for form:", err.message);
    await sessionStore.delete(sessionKey);
    await sessionStore.delete(`lock:${session.userId}`);
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
      color: INFO,
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
      await sessionStore.delete(`lock:${session.userId}`);
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
      await sessionStore.delete(`lock:${session.userId}`);
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
      const verdict = await validateAnswerAgainstRegex(question, content);
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
      await sessionStore.delete(`lock:${session.userId}`);
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
  await sessionStore.delete(`lock:${session.userId}`);
  const lang = session.lang || "en";

  // ПОТВЪРЖДАВАМЕ СЛЕД ПОДАВАНЕТО, не преди.
  //
  // ДЕФЕКТЪТ (Кодаджията, одит кръг 2, 07.08.2026): „Формулярът е изпратен“ се
  // пращаше ПЪРВО, а самото подаване чак после — и ако сървърът го откажеше
  // (затворена форма, изчерпан таван, активен cooldown — правила, за които
  // клиентът ПЛАЩА), отказът се гълташе в общ catch. Кандидатът виждаше зелена
  // отметка за кандидатура, която не съществува, а екипът не получаваше нищо.
  // Платената функция работеше, а човекът срещу нея беше излъган.
  if (session.form.isApplication || !session.panel?.categoryId) {
    // No panel category means there is no ticket channel to create
    // (e.g. /form spawn or /apply with a stub panel) — store the answers
    // as a submission record so they are never silently discarded.
    const result = await handleApplicationSubmission(client, session);
    if (result && !result.ok) {
      await dmChannel.send({
        embeds: [{ title: t("form.submitFailed", lang), description: rejectionText(result, lang), color: DANGER }],
      }).catch(() => {});
      return;
    }
  } else {
    await handleTicketFromForm(client, session);
  }

  await dmChannel.send({
    embeds: [{
      title: t("form.submittedTitle", lang),
      description: t("form.submittedBody", lang),
      color: SUCCESS,
    }],
  });
}

// ─── Shared finishing path (also used by the modal submit handler — v2.9) ────
// Same branching finishSession() uses below, minus the DM-only "thank you"
// send: the modal path acks with its own ephemeral confirmation instead.
export async function submitFormAnswers(client, session) {
  if (session.form.isApplication || !session.panel?.categoryId) {
    // Връща `{ok:false, code}` при отказ по правило — викащият ТРЯБВА да го
    // покаже, иначе кандидатът вижда потвърждение за нищо. (Одит кръг 2)
    return handleApplicationSubmission(client, session);
  }
  await handleTicketFromForm(client, session);
  return { ok: true };
}

// ─── Application submission ───────────────────────────────────────────────────

/**
 * @returns {Promise<{ok:true}|{ok:false, code?:string, remainingSeconds?:number}>}
 *   Отказът се ВРЪЩА, за да може викащият да каже на човека какво е станало.
 */
async function handleApplicationSubmission(client, session) {
  try {
    // Step 1: Create the application record first to get its real DB ID.
    // We pass null for reviewMessageId — we'll update it after posting the embed.
    const result = await submitApplication(
      session.guildId,
      session.form.id,
      session.userId,
      session.answers,
      null,  // reviewMessageId updated below
      null   // reviewChannelId updated below
    );

    // Правилата на формата (затворена · cooldown · таван) са ПЛАТЕНА функция.
    // Отказът трябва да стигне до кандидата, не до лога. (Одит кръг 2)
    if (!result.ok) return result;
    const application = result.application;

    if (!application?.id) {
      console.error("submitApplication returned no ID");
      return { ok: false, code: "UNKNOWN" };
    }

    // Step 2: Post review embed in the server using the REAL application ID.
    const reviewChannelId = session.form.reviewChannelId;
    if (!reviewChannelId) return { ok: true }; // няма канал за ревю — записана е, без embed

    // Cross-tenant guard: reviewChannelId е нескопиран потребителски вход
    // (forms.js createFormSchema го приема като гол z.string()). Глобалният
    // channel кеш резолвва канал в ЧУЖД guild → кандидатура с лични данни би
    // се публикувала в чужд сървър. Резолвваме В РАМКИТЕ на guild-а на сесията
    // и проверяваме принадлежността, преди да пуснем PII навън. Одит 11.08.2026.
    const guild = client.guilds.cache.get(session.guildId);
    const reviewChannel = guild
      ? await guild.channels.fetch(reviewChannelId).catch(() => null)
      : null;
    if (!reviewChannel) {
      console.error(`Review channel ${reviewChannelId} not found in guild ${session.guildId}`);
      return { ok: true }; // записана Е — липсва само embed-ът за екипа
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
    return { ok: true };
  } catch (err) {
    console.error("Failed to submit application:", err.message);
    return { ok: false, code: "ERROR" };
  }
}

/**
 * Съобщението, което кандидатът вижда при ОТКАЗ по правило на формата.
 * Езикът е този на сесията — отказът е част от продукта, не техническа грешка.
 */
export function rejectionText(result, lang) {
  switch (result.code) {
    case "FORM_CLOSED":
      return t("form.closedByAdmin", lang);
    case "MAX_SUBMISSIONS":
      return t("form.maxSubmissionsReached", lang);
    case "COOLDOWN":
      return t("form.cooldownActive", lang, { time: formatRemaining(result.remainingSeconds) });
    default:
      // Непозната причина → не измисляме. Общият текст е по-честен от грешен.
      return result.error || t("form.submitFailed", lang);
  }
}

/**
 * Оставащото време в компактен, ЕЗИКОВО НЕУТРАЛЕН вид („45s“ · „12m“ · „3h“ ·
 * „2d“), защото се вмъква в `{{time}}` на `form.cooldownActive`, който вече е
 * преведен на 8-те езика. Нарочно НЕ въвеждаме четири нови ключа × 8 локала за
 * имена на единици — това е дълг, който после се разсинхронизира.
 */
function formatRemaining(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.ceil(s / 60)}m`;
  if (s < 86400) return `${Math.ceil(s / 3600)}h`;
  return `${Math.ceil(s / 86400)}d`;
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
        color: INFO,
      }],
    });

    await createTicket(session.guildId, panel.id, session.userId, channel.id);
  } catch (err) {
    console.error("Failed to create ticket from form:", err.message);
  }
}
