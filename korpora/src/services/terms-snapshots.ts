import { LEGAL_UPDATED } from '../company.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { LOCALES, type Locale } from '../i18n.js';
import { errorMessage, logger } from '../logger.js';
import type { MailAttachment } from '../mail/mailer.js';
import { termsCopy, termsCopyFile } from './terms-copy.js';

/**
 * Пазените копия на общите условия по версия и език. Докато една версия е в сила, всяко ново събиране
 * я презаписва (цените в текста идват от кода); след смяната на условията остава последното — то е
 * пратено с последните поръчки по тях. Грешка в базата не спира писмото: само се записва в лога.
 */
export async function keepTermsCopy(
  version: string,
  locale: Locale,
  content: string,
): Promise<void> {
  try {
    await prisma.termsSnapshot.upsert({
      where: { version_locale: { version, locale } },
      create: { version, locale, content },
      update: { content },
    });
  } catch (error) {
    logger.error({ err: errorMessage(error) }, 'копието на общите условия не се запази');
  }
}

/** Пазеното копие на условията от версията на поръчката — или null, ако го няма. */
export async function keptTermsCopy(
  version: string,
  locale: Locale,
): Promise<MailAttachment | null> {
  try {
    const row = await prisma.termsSnapshot.findUnique({
      where: { version_locale: { version, locale } },
    });
    return row ? termsCopyFile(version, locale, row.content) : null;
  } catch (error) {
    logger.error({ err: errorMessage(error) }, 'пазеното копие на общите условия не се прочете');
    return null;
  }
}

/**
 * Поддръжката: условията в сила на всеки език — пазени, преди поръчка по тях да поиска копие след
 * смяната им (и на език, на който още никой не е поръчвал).
 */
export async function keepCurrentTermsCopies(): Promise<void> {
  for (const locale of LOCALES) {
    try {
      const copy = await termsCopy(locale, config().PUBLIC_BASE_URL, config().CONTACT_EMAIL);
      await keepTermsCopy(LEGAL_UPDATED.terms, locale, copy.content);
    } catch (error) {
      logger.error({ err: errorMessage(error), locale }, 'копието на общите условия не се събра');
    }
  }
}
