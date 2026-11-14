// bot/src/utils/ticketErrors.js
// Т12: преведено обяснение към човека вместо суров текст на Discord/бекенда.
// Сурово `err.message` не стига до потребителя (правило 3 от спецификацията).
import { t } from "../i18n/index.js";

/**
 * Discord REST кодове, които админът може да поправи:
 *   30013 — максимум канали (50 в категория / 500 в сървър)
 *   50013 — липсват права на бота
 *   10003 / 10011 — изтрит канал / изтрита роля (категория е канал)
 *   50035 — невалидни данни (напр. изтрита категория или роля в настройките)
 * @param {unknown} err
 * @param {string} lang
 * @param {{thread?: boolean}} [opts]
 * @returns {string} винаги преведен текст (никога err.message)
 */
export function describeTicketError(err, lang, opts = {}) {
  const code = err?.code ?? err?.rawError?.code;
  switch (Number(code)) {
    case 30013: return t("tkt.err.maxChannels", lang);
    case 50013: return t(opts.thread ? "tkt.err.missingThreadPerms" : "tkt.err.missingPerms", lang);
    case 10003:
    case 10011: return t("tkt.err.deleted", lang);
    case 50035: return t("tkt.err.invalid", lang);
    default:    return t("tkt.err.generic", lang);
  }
}

/** Текст за достигнат лимит (отговор на precheck/създаване). */
export function limitText(limit, lang) {
  if (limit?.code === "PANEL_LIMIT_REACHED") {
    return t("tkt.limit.panel", lang, { count: limit.count ?? "?", max: limit.max ?? "?" });
  }
  return t("tkt.limit.server", lang, { count: limit?.count ?? "?", max: limit?.max ?? "?" });
}

/** Човешки текст за 409/400 от затваряне/claim/reopen по код на бекенда. */
export function describeActionConflict(code, lang) {
  switch (code) {
    case "ALREADY_CLOSED": return t("tkt.alreadyClosed", lang);
    case "ALREADY_CLAIMED": return t("tkt.alreadyClaimed", lang);
    case "NOT_OPEN": return t("tkt.notOpen", lang);
    case "NOT_CLOSED": return t("tkt.notClosed", lang);
    case "PREMIUM_REQUIRED": return t("tkt.premiumRequired", lang);
    default: return t("tkt.err.generic", lang);
  }
}
