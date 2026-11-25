import { prisma } from '../db.js';
import { BRAND } from '../brand.js';
import { setting } from '../admin/settings.js';
import type { Locale } from '../i18n.js';

/**
 * Езикът на писмо до човек: този, избран в профила с този имейл (превключвателят BG/EN в лентата —
 * src/routes/language.ts). Имейл без профил — `fallback` (поканилият или български).
 */
export async function recipientLocale(email: string, fallback: Locale = 'bg'): Promise<Locale> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { locale: true },
  });
  if (!user) return fallback;
  return user.locale === 'en' ? 'en' : 'bg';
}

/** Датата в писмото: „20 ноември 2026 г.“ / „20 November 2026“ (софийско време). */
export function mailLongDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'Europe/Sofia',
  }).format(date);
}

/** Кратката дата в писмото: „20.11.2026“ / „20/11/2026“ (софийско време). */
export function mailShortDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Sofia',
  }).format(date);
}

/**
 * Подписът в писмо до човек: настройката `documents.signature` (празна — подразбиращият се). На английски
 * подразбиращият се е преведен; сменен от мастъра текст остава както е написан.
 */
export async function mailSignature(locale: Locale): Promise<string> {
  const custom = await setting('documents.signature');
  if (locale === 'en' && (!custom || custom === BRAND.signature)) return BRAND.signatureEn;
  return custom || BRAND.signature;
}
