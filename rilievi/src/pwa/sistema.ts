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
