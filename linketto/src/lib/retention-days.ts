// Сроковете за съхранение, обещани в политиката за поверителност — ЕДИН
// източник (без server-only, за да се ползва и от plans.ts). Промяна на срок
// = промяна и в messages legal.privacyBody (6 езика) през Правния Разбирач.
export const RETENTION_DAYS = {
  /** IP при вход/регистрация (LoginEvent). */
  loginEvent: 90,
  /** Съобщения от контактната форма. */
  contactMessage: 365,
  /** Заявки за час/среща. */
  booking: 365,
  /** Непотвърдени записвания за бюлетин (двойно съгласие). */
  unconfirmedSubscriber: 30,
  /** Аналитични събития (≈ 13 месеца). */
  clickEvent: 396,
} as const;

/** Дата отпреди `days` дни — граница за deleteMany. */
export function daysAgo(days: number, now: number = Date.now()): Date {
  return new Date(now - days * 24 * 60 * 60 * 1000);
}
