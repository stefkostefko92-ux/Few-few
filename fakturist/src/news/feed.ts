import { translator, type Locale } from '../i18n.js';
import { BRAND } from '../brand.js';
import { pageUrl } from '../seo/pages.js';
import { dayStart, NEWS } from './entries.js';

/** Емисията на „Какво ново“ (RSS 2.0) — по една на език; текстовете са тези от страницата. */
export const NEWS_FEED_PATHS: Record<Locale, string> = {
  bg: '/kakvo-novo.xml',
  en: '/en/whats-new.xml',
};

const escapeXml = (text: string) =>
  text.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );

export function newsRss(base: string, locale: Locale): string {
  const t = translator(locale);
  const page = pageUrl(base, 'news', locale);
  const items = NEWS.map((entry) => {
    const title = t(`news.entries.${entry.id}.title`);
    const text = t(`news.entries.${entry.id}.text`);
    return [
      '<item>',
      `<title>${escapeXml(title)}</title>`,
      `<link>${escapeXml(`${page}#${entry.id}`)}</link>`,
      `<guid isPermaLink="true">${escapeXml(`${page}#${entry.id}`)}</guid>`,
      `<pubDate>${dayStart(entry.date).toUTCString()}</pubDate>`,
      `<description>${escapeXml(text)}</description>`,
      '</item>',
    ].join('');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escapeXml(`${t('site.news.meta.title')}`)}</title>`,
    `<link>${escapeXml(page)}</link>`,
    `<atom:link href="${escapeXml(`${base}${NEWS_FEED_PATHS[locale]}`)}" rel="self" type="application/rss+xml"/>`,
    `<description>${escapeXml(t('site.news.meta.description'))}</description>`,
    `<language>${locale === 'bg' ? 'bg-BG' : 'en-GB'}</language>`,
    `<generator>${escapeXml(BRAND.nameLatin)}</generator>`,
    ...items,
    '</channel>',
    '</rss>',
  ].join('\n');
}
