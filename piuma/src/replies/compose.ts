import { isLocale, translate } from '../i18n.js';
import { MESSAGE_MAX_BYTES, messageBytes } from './decide.js';
import { tokenize } from './match.js';

/**
 * Бележката под всяко лично съобщение (PR16a; ЗЕС чл. 261, ал. 5 + ЗЕТ чл. 5, ал. 3):
 * кой пише, защо, че няма да пишем отново, политиката и адресът за отказ. Езикът е този
 * на бранда; непознат → английски.
 */
export interface FooterArgs {
  brand: string;
  keyword: string;
  privacyUrl: string;
  contact: string;
}

export function replyFooter(language: string, args: FooterArgs): string {
  const locale = isLocale(language) ? language : 'en';
  return translate(locale, 'replies.footer', { ...args });
}

export type Composed =
  | { ok: true; text: string; bytes: number }
  | { ok: false; error: 'replies.errTooLong'; bytes: number };

/** Текстът + бележката под него; заедно ≤ 1000 байта UTF-8 (лимитът на Meta). */
export function composeMessage(message: string, footer: string): Composed {
  const text = `${message.trim()}\n\n${footer}`;
  const bytes = messageBytes(text);
  if (bytes > MESSAGE_MAX_BYTES) return { ok: false, error: 'replies.errTooLong', bytes };
  return { ok: true, text, bytes };
}

/** Обявява ли надписът думата (цяла дума, същата нормализация като коментара). */
export function announces(caption: string | null | undefined, keyword: string): boolean {
  if (!caption) return false;
  return tokenize(caption).includes(keyword);
}
