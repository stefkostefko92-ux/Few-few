/**
 * Публичните адреси — витрината, политиката, новините и условията (само на италиански, без езикови варианти). Чист модул:
 * ползват го маршрутите, sitemap, llms.txt и robots.txt. Всичко останало (входът, картите, хората,
 * фирмите) е частно и не се обхожда.
 */
export const HOME_PATH = '/';
export const PRIVACY_PATH = '/privacy';
/** Страницата след пратена заявка — само след формата, не се обхожда. */
export const SENT_PATH = '/richiesta-inviata';

/** Новините на портала (src/novita/voci.ts) и емисията им (RSS 2.0). */
export const NOVITA_PATH = '/novita';
export const FEED_NOVITA_PATH = '/novita.xml';

/** Условията за услугата с приложението по чл. 28 GDPR и правилата за ползване (src/legale/), и PDF-ът им. */
export const CONDIZIONI_PATH = '/condizioni';
export const CONDIZIONI_PDF_PATH = '/condizioni.pdf';

/** Износът на данните и смяната на доставчика (чл. 26 и 28 Data Act; src/aziende/formato.ts). */
export const ESPORTAZIONE_PATH = '/esportazione';

/** Състоянието на услугата (условията 2026-11-12, чл. 2.4) — публична, но `noindex`. */
export const STATO_PATH = '/stato';

/** Цените: активните планове от конзолата (src/routes/site-prezzi.ts). */
export const PREZZI_PATH = '/prezzi';

/** Сигналите за незаконно съдържание (чл. 16 Рег. (ЕС) 2022/2065) и страницата след пратен сигнал (`noindex`). */
export const SEGNALAZIONI_PATH = '/segnalazioni';
export const SEGNALAZIONE_INVIATA_PATH = '/segnalazioni/inviata';

/** Индексираните страници — за sitemap и robots.txt. */
export const PUBLIC_PATHS = [
  HOME_PATH,
  PREZZI_PATH,
  PRIVACY_PATH,
  NOVITA_PATH,
  CONDIZIONI_PATH,
  ESPORTAZIONE_PATH,
  SEGNALAZIONI_PATH,
] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];
