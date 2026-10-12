// Italian only (the owner's decision of 2026-10-12): one interface language, the /it prefix kept, and the addresses of
// the former languages (/en, /bg and everything under them) sent for good to the same page in Italian.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_LOCALE, INTL_LOCALE, LEGACY_LOCALES, LOCALES, isLocale } from '@/i18n/locales';
import { legacyRedirect } from '@/i18n/legacy';
import { routing } from '@/i18n/routing';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);
const to = (href: string): string | null => { const u = new URL(href), r = legacyRedirect(u); return r ? r.href : null; };

test('una sola lingua: italiano, con il prefisso /it', () => {
  assert.deepEqual([...LOCALES], ['it']);
  assert.equal(DEFAULT_LOCALE, 'it');
  assert.deepEqual(INTL_LOCALE, { it: 'it-IT' });
  assert.deepEqual([...routing.locales], ['it']);
  assert.equal(routing.localePrefix, 'always');
  // a language stored on an account before (en, bg) is not the interface's: the callers fall back to Italian
  for (const x of ['en', 'bg', 'EN', '', null, undefined]) assert.equal(isLocale(x), false, String(x));
  assert.equal(isLocale('it'), true);
});

test('gli indirizzi delle lingue di prima vanno alla stessa pagina in italiano, con la query', () => {
  const B = 'https://liftpilot.example';
  assert.deepEqual([...LEGACY_LOCALES], ['en', 'bg']);
  assert.equal(to(`${B}/en`), `${B}/it`);
  assert.equal(to(`${B}/bg/`), `${B}/it/`);
  assert.equal(to(`${B}/bg/pricing?x=1`), `${B}/it/pricing?x=1`);
  assert.equal(to(`${B}/bg/app/projects/abc`), `${B}/it/app/projects/abc`);
  assert.equal(to(`${B}/en/privacy/3?a=b&c=d`), `${B}/it/privacy/3?a=b&c=d`);
  assert.equal(to(`${B}/en/verify-email`), `${B}/it/verify-email`);
  // everything else is not touched: Italian, the root, a path that only starts with the letters
  for (const p of ['/it', '/it/pricing', '/', '/english', '/bgx/pricing', '/api/health', '/enx', '/de/pricing']) assert.equal(to(`${B}${p}`), null, p);
});

test('il middleware rimanda con 301 prima di next-intl', () => {
  const src = readFileSync(path.join(root, 'src/middleware.ts'), 'utf8');
  const redirect = src.indexOf('NextResponse.redirect(moved, 301)'), intl = src.indexOf('intl(new NextRequest');
  assert.ok(redirect > 0 && intl > redirect, 'the permanent redirect comes before the localized routing');
});
