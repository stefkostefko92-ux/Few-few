// backend/src/i18n/bg.js
export default {
  "error.generic": "Нещо се обърка.",
  "error.notFound": "Не е намерено.",
  "error.unauthorized": "Нямаш права за това.",

  "ticket.opened": "✅ Билетът ти е създаден: {{channel}}",
  "ticket.closed": "🔒 Билетът е затворен от {{user}}.\n**Причина:** {{reason}}",
  "ticket.claimed": "🛡️ Билетът е поет от {{user}}.",
  "ticket.unclaimed": "🔓 Билетът вече не е поет. Всеки от екипа може да помогне.",
  "ticket.notATicket": "❌ Това не е билет канал.",
  "ticket.limitReached": "❌ Вече имаш {{count}} отворени билета. Затвори един преди да отвориш нов.",
  "ticket.renamed": "✏️ Каналът е преименуван на `{{name}}`.",
  "ticket.escalated": "⬆️ Билетът е ескалиран към {{panel}}.",
  "ticket.feedback.prompt": "Благодарим, че използва поддръжката ни! Моля, оцени преживяването си:",
  "ticket.autoClosedInactivity": "⏱️ Билетът беше автоматично затворен след {{hours}} часа неактивност.",
  "ticket.autoClosedLeave": "👋 Билетът беше автоматично затворен защото създателят напусна сървъра.",

  "panel.spawned": "Панелът е създаден в {{channel}}.",
  "panel.defaultButtonLabel": "Отвори билет",

  "form.started": "Провери личните си съобщения за да отговориш на формуляра.",
  "form.submitted": "✅ Благодарим! Твоите отговори бяха получени.",
  "form.cooldownActive": "❌ Можеш да изпратиш отново след {{time}}.",
  "form.closedByAdmin": "❌ Този формуляр е затворен.",
  "form.invalidAnswer": "❌ Невалиден отговор. {{reason}}",
  "application.approved": "✅ Твоята кандидатура беше одобрена.",
  "application.denied": "❌ Твоята кандидатура беше отхвърлена.",

  "verify.success": "✅ Верифициран си! Добре дошъл.",
  "verify.wrongAnswer": "❌ Грешен отговор. Опитай отново.",
  "verify.rateLimited": "❌ Прекалено много опити. Опитай отново след {{minutes}} минути.",
  "verify.accountTooNew": "❌ Акаунтът ти трябва да е поне {{days}} дни стар.",
  "verify.gateBlocked": "❌ Първо трябва да се верифицираш. Посети канала за верификация.",

  "poll.voted": "✅ Гласът е регистриран.",
  "poll.voteRemoved": "Гласът е премахнат.",
  "poll.closed": "Това допитване е затворено.",
  "giveaway.entered": "🎉 Участваш! Успех!",
  "giveaway.left": "Отказа се от томболата.",
  "giveaway.missingRoles": "❌ Трябват ти тези роли за да участваш: {{roles}}",
  "giveaway.ended": "Томболата приключи.",
  "giveaway.winnersAnnounce": "🎉 Поздравления {{winners}}! Спечели **{{prize}}**!",
  "giveaway.noWinners": "😔 Томболата за **{{prize}}** приключи без участници.",

  "sticky.set": "📌 Постоянното съобщение е зададено за този канал.",
  "sticky.removed": "🗑️ Постоянното съобщение е премахнато.",
  "schedule.added": "📅 Планирано за {{time}}",

  "premium.required": "❌ Тази функция изисква Premium.",
  "premium.limitReached": "❌ Лимитът е достигнат: {{resource}} ({{limit}}). Надгради до Premium.",
  "premium.trialStarted": "✨ 14-дневният пробен Premium период започна!",
  "premium.trialEndingSoon": "⏰ Пробният период изтича след {{days}} дни.",

  "welcomer.default": "Добре дошъл {{user}} в {{server}}! Вече сме {{memberCount}} членове.",

  // AI разкритие (EU AI Act, чл. 50 — взаимодействие със съдържание, генерирано от AI)
  "ai.disclosure.author": "🤖 Отговор, генериран от AI",
  "ai.disclosure.title": "Автоматичен AI отговор",
  "ai.disclosure.fieldName": "⚠️ AI разкритие",
  "ai.disclosure.body": "Този отговор е генериран от AI езиков модел ({{model}}). Възможно е да съдържа грешки или неточности. Член на екипа ще се свърже с теб скоро за потвърждение.",
  "ai.disclosure.footer": "Supreme Bot · Автоматичен AI отговор · Powered by Claude",
};
