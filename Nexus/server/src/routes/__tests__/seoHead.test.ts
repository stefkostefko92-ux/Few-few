// The SPA shell's head must give crawlers consistent signals without JavaScript:
// a self canonical for /?lang=it|bg, the shell as built for "/", noindex for app screens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renderShell, SITE } from '../../lib/seoHead';

const root = path.resolve(__dirname, '../../../../client');
const SHELL = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const LOCALES = JSON.parse(fs.readFileSync(path.join(root, 'public/seo-locales.json'), 'utf8'));
const canonical = (h: string) => (h.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];

test('/?lang=it → Italian head with a SELF canonical (hreflang alternate is canonical itself)', () => {
  const h = renderShell(SHELL, '/', 'it', LOCALES);
  assert.equal(canonical(h), `${SITE}/?lang=it`);
  assert.match(h, /<html lang="it-IT"/);
  assert.ok(h.includes(`<title>${LOCALES.it.title}</title>`));
  assert.match(h, new RegExp(`<meta property="og:url" content="${SITE}/\\?lang=it"`));
  assert.match(h, /hreflang="bg"/, 'alternates stay on the landing');
});

test('every hreflang alternate in the shell resolves to a page whose canonical is itself', () => {
  for (const [, href] of SHELL.matchAll(/hreflang="[^"]+"\s+href="([^"]+)"/g)) {
    const u = new URL(href);
    const h = renderShell(SHELL, u.pathname, u.searchParams.get('lang') ?? undefined, LOCALES);
    assert.equal(canonical(h), href, href);
  }
});

test('"/" and unknown languages keep the shell as built', () => {
  assert.equal(renderShell(SHELL, '/', undefined, LOCALES), SHELL);
  assert.equal(renderShell(SHELL, '/', 'xx', LOCALES), SHELL);
  assert.equal(renderShell(SHELL, '/', ['it'], LOCALES), SHELL, 'array query is not a language');
});

test('app screens are noindex with no canonical or hreflang (no mixed signals)', () => {
  const h = renderShell(SHELL, '/login', undefined, LOCALES);
  assert.match(h, /<meta name="robots" content="noindex, follow" \/>/);
  assert.equal(canonical(h), undefined);
  assert.doesNotMatch(h, /hreflang=/);
  assert.equal((h.match(/name="robots"/g) || []).length, 1, 'one robots meta, not two');
});

test('the sitemap lists only indexable URLs (no app screens)', () => {
  const xml = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]));
  for (const u of locs) {
    const h = renderShell(SHELL, u.pathname, u.searchParams.get('lang') ?? undefined, LOCALES);
    assert.doesNotMatch(h, /noindex/, `${u.href} is in the sitemap but noindex`);
  }
});
