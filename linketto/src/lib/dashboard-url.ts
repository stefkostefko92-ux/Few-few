import 'server-only';
import { headers } from 'next/headers';

// При няколко профила (Business) действията в дашборда пренасочваха към
// /dashboard и потребителят губеше активния профил (`?p`) — всяко действие
// го връщаше към първия (одит M3). Формите не носят `p`, затова го вземаме
// от Referer-а на същия сайт: страницата, от която е изпратена формата, вече
// е на правилния профил. Стойността се валидира (само cuid-подобен id);
// дашбордът така или иначе проверява собствеността на `p` преди употреба.
const PROFILE_ID = /^[a-z0-9]{20,32}$/i;

/** Връзка към дашборда на текущия профил: dash('bg', '?error=x'). */
export async function dash(uiLocale: string, query = ''): Promise<string> {
  let p: string | null = null;
  try {
    const referer = (await headers()).get('referer');
    if (referer) {
      const candidate = new URL(referer).searchParams.get('p');
      if (candidate && PROFILE_ID.test(candidate)) p = candidate;
    }
  } catch {
    p = null;
  }
  const base = `/${uiLocale}/dashboard`;
  if (!p) return `${base}${query}`;
  const joiner = query.includes('?') ? '&' : '?';
  return `${base}${query}${joiner}p=${p}`;
}
