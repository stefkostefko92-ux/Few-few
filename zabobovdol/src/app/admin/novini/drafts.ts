// Кои внесени чернови НЕ са новини. Чисто (без база), за да го ползват и
// страницата /admin/novini, и действието за изтриване — един и същ критерий.
//
// Защо: старият четец внесе страници от МЕНЮТО на портала на общината
// („Характеристики на общината“, „Правомощия на Кмета“…) като „новини“.
// Миграцията ги скри (published=false), но така те се връщат в „Чакащи преглед“
// и някой може да ги публикува отново по грешка.

import {
  DEFAULT_NEWS_LINK_PATTERN,
  DEFAULT_NEWS_URL,
  MUNICIPALITY_SOURCE,
  isNewsLink,
  resolveLinkPattern,
} from "@/lib/ingest-news-parse";

export type DraftLike = { source: string; sourceUrl: string };

// Шаблоните за адрес на истинска новина: настроеният в средата (ако е валиден)
// И този по подразбиране. Чернова, която съвпада с КОЙ ДА Е от тях, остава за
// преглед — по-добре човек да види една новина повече, отколкото да изчезне.
export function newsPatterns(raw: string | null | undefined): RegExp[] {
  const fallback = resolveLinkPattern(DEFAULT_NEWS_LINK_PATTERN);
  try {
    const configured = resolveLinkPattern(raw);
    return configured.source === fallback.source ? [fallback] : [configured, fallback];
  } catch {
    // Невалидният шаблон спира самия внос (и той го докладва); тук само сортираме.
    return [fallback];
  }
}

// Видът на източника. Страниците от менюто идват САМО от HTML портала на
// общината (egov.bg): старият четец взимаше връзки от същия домейн като списъка,
// а сегашният HTML четец внася само адреси по шаблона. RSS/Atom канал НЕ минава
// през шаблона (DEPLOY.md, т. 9.1) и изброява само публикации — неговите записи
// никога не са „страница от менюто“, дори адресът им да е друг (напр. нов сайт
// на общината). Затова критерият важи само за адреси на HTML портала.
const PORTAL_HOST = new URL(DEFAULT_NEWS_URL).hostname.toLowerCase();

/** Адрес от HTML портала на общината (откъдето е внесено менюто)? */
export function isPortalPage(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.toLowerCase() === PORTAL_HOST;
  } catch {
    return false;
  }
}

// Не е новина: внесено от общината, от HTML портала ѝ, но адресът не е на
// отделна новина. Ръчно създадени чернови (без адрес или с друг източник) и
// записи от RSS/Atom канал (адрес извън портала) никога не попадат тук.
export function isNotNewsDraft(d: DraftLike, patterns: RegExp[]): boolean {
  if (d.source !== MUNICIPALITY_SOURCE) return false;
  if (!d.sourceUrl.trim()) return false;
  if (!isPortalPage(d.sourceUrl)) return false;
  return !patterns.some((p) => isNewsLink(d.sourceUrl, p));
}
