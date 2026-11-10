/**
 * Публичните адреси — витрината и политиката (само на италиански, без езикови варианти). Чист модул:
 * ползват го маршрутите, sitemap, llms.txt и robots.txt. Всичко останало (входът, картите, хората,
 * фирмите) е частно и не се обхожда.
 */
export const HOME_PATH = '/';
export const PRIVACY_PATH = '/privacy';
/** Страницата след пратена заявка — само след формата, не се обхожда. */
export const SENT_PATH = '/richiesta-inviata';

/** Индексираните страници — за sitemap и robots.txt. */
export const PUBLIC_PATHS = [HOME_PATH, PRIVACY_PATH] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];
