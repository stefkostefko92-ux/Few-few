/**
 * Устройството по User-Agent — за да са отворени стъпките му още в HTML-а на „Installa l'app“: ако ги
 * отвореше скриптът след зареждането, страницата се пренареждаше (CLS 0,1 — одит, 4 ноември 2026).
 * Същото правило като public/js/installa.js; iPad с User-Agent на компютър се познава само по
 * докосването — тогава браузърът поправя. Непознатото е null: отворени са всички стъпки.
 */
export type Sistema = 'ios' | 'android' | 'mac' | 'pc';

export function sistemaDi(userAgent: string | undefined): Sistema | null {
  if (!userAgent) return null;
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Macintosh/.test(userAgent))
    return /Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|Edg\/|Firefox\//.test(userAgent)
      ? 'mac'
      : 'pc';
  if (/Windows|X11|Linux|CrOS/.test(userAgent)) return 'pc';
  return null;
}

/**
 * Samsung Internet (Android). Инсталираното от него приложение Android го бележи „non sicura“
 * (собственикът, 5 ноември 2026 — потвърдено на телефона му): там бутонът за инсталиране не се предлага,
 * а страницата праща към Chrome.
 */
export const samsungInternet = (userAgent: string | undefined): boolean =>
  Boolean(userAgent && /SamsungBrowser\//.test(userAgent));

/** Същата страница, отворена в Chrome от друг браузър на Android (intent; без Chrome — Google Play). */
export function apriInChrome(baseUrl: string, path: string): string {
  const url = new URL(path, `${baseUrl}/`);
  const scheme = url.protocol.replace(/:$/, '');
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;end`;
}
