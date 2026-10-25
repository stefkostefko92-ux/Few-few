import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Response } from 'express';
import { config } from './config.js';
import { PAGES, type PageId } from './content.js';
import { formattersFor, type Formatters } from './format.js';
import { translatorFor, type Locale, type Translator } from './i18n.js';
import type { Season } from './data/repo.js';
import { SITE_NAME, matchPath, pagePath, playerPath, reportPath, type Head } from './seo.js';

export const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const versions = new Map<string, string>();

/**
 * Адрес на статичен файл с отпечатък на съдържанието (`?v=…`): статиката се кешира дълго, а
 * промяна на файла сменя адреса. Отпечатъкът се смята веднъж на процес.
 */
export function asset(name: string): string {
  let version = versions.get(name);
  if (!version) {
    try {
      version = createHash('sha256')
        .update(readFileSync(join(PUBLIC_DIR, name)))
        .digest('hex')
        .slice(0, 10);
    } catch {
      version = '0';
    }
    versions.set(name, version);
  }
  return `/static/${name}?v=${version}`;
}

export type NavId = PageId | 'player' | 'match' | 'error';

export interface CommonLocals {
  locale: Locale;
  t: Translator;
  fmt: Formatters;
  asset: (name: string) => string;
  nav: Record<PageId, string>;
  current: NavId;
  playerHref: (steamId: string) => string;
  matchHref: (id: number) => string;
  reportHref: (id: number, steamId: string) => string;
  seasonLabel: (season: Pick<Season, 'id'>) => string;
  siteName: string;
  server: { address: string; connectUrl: string; command: string };
  contactEmail: string | null;
  discordUrl: string | null;
}

export function commonLocals(locale: Locale, current: NavId): CommonLocals {
  const cfg = config();
  const t = translatorFor(locale);
  const nav = Object.fromEntries(PAGES.map((page) => [page, pagePath(locale, page)])) as Record<
    PageId,
    string
  >;
  return {
    locale,
    t,
    fmt: formattersFor(locale, cfg.DISPLAY_TZ),
    asset,
    nav,
    current,
    playerHref: (steamId) => playerPath(locale, steamId),
    matchHref: (id) => matchPath(locale, id),
    reportHref: (id, steamId) => reportPath(locale, id, steamId),
    seasonLabel: (season) =>
      season.id === 0 ? t('season.allTime') : t('season.numbered', { n: season.id }),
    siteName: SITE_NAME,
    server: {
      address: cfg.SERVER_ADDRESS,
      connectUrl: `steam://connect/${cfg.SERVER_ADDRESS}`,
      command: `connect ${cfg.SERVER_ADDRESS}`,
    },
    contactEmail: cfg.CONTACT_EMAIL ?? null,
    discordUrl: cfg.DISCORD_URL ?? null,
  };
}

/**
 * Рендира страница с общите стойности + `head` + собствените ѝ данни. Без `onRenderError`
 * провалът стига до обработчика на грешки на Express (страница 500); страниците за грешка
 * подават свой резервен изход, за да не се въртят в кръг.
 */
export function renderPage(
  res: Response,
  view: string,
  locale: Locale,
  current: NavId,
  head: Head,
  data: Record<string, unknown> = {},
  status = 200,
  onRenderError?: (error: Error) => void,
): void {
  const locals = { ...commonLocals(locale, current), head, ...data };
  if (!onRenderError) {
    res.status(status).render(view, locals);
    return;
  }
  res.status(status).render(view, locals, (error: Error | null, html?: string) => {
    if (error) onRenderError(error);
    else res.send(html);
  });
}
