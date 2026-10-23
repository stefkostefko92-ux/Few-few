// Кои внесени чернови НЕ са новини. Чисто (без база), за да го ползват и
// страницата /admin/novini, и действието за изтриване — един и същ критерий.
//
// Защо: старият четец внесе страници от МЕНЮТО на портала на общината
// („Характеристики на общината“, „Правомощия на Кмета“…) като „новини“.
// Миграцията ги скри (published=false), но така те се връщат в „Чакащи преглед“
// и някой може да ги публикува отново по грешка.

import {
  DEFAULT_NEWS_LINK_PATTERN,
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

// Не е новина: внесено от общината, с адрес към оригинала, но адресът не е на
// отделна новина. Ръчно създадени чернови (без адрес или с друг източник) никога
// не попадат тук.
export function isNotNewsDraft(d: DraftLike, patterns: RegExp[]): boolean {
  if (d.source !== MUNICIPALITY_SOURCE) return false;
  if (!d.sourceUrl.trim()) return false;
  return !patterns.some((p) => isNewsLink(d.sourceUrl, p));
}
