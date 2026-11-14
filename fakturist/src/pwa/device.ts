/**
 * Устройството по User-Agent — за да са отворени стъпките му още в HTML-а на „Инсталирай приложението“
 * (ако ги отваряше скриптът след зареждането, страницата се пренарежда). Същото правило като
 * public/js/install.js; iPad с User-Agent на компютър се познава само по докосването — тогава поправя
 * браузърът. Непознатото е null: отворени са всички стъпки.
 */
export type Device = 'ios' | 'android' | 'mac' | 'pc';

export function deviceOf(userAgent: string | undefined): Device | null {
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
 * Samsung Internet (Android): инсталираното от него приложение Android бележи като „несигурно“
 * (опитът с rilievi, 05.11.2026). Там бутонът не се предлага, а страницата праща към Chrome.
 */
export const isSamsungInternet = (userAgent: string | undefined): boolean =>
  Boolean(userAgent && /SamsungBrowser\//.test(userAgent));

/** Същата страница, отворена в Chrome от друг браузър на Android (intent; без Chrome — Google Play). */
export function openInChromeUrl(baseUrl: string, path: string): string {
  const url = new URL(path, `${baseUrl}/`);
  const scheme = url.protocol.replace(/:$/, '');
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;end`;
}
