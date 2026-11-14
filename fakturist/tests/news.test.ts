import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SOFTWARE_VERSION } from '../src/version.js';
import { byDay, dayStart, LAST_UPDATE, NEWS, toRegister, unread } from '../src/news/entries.js';
import { hasKey } from '../src/i18n.js';
import { FEATURES } from '../src/features.js';

/** „Какво ново“ (src/news/): версията, правилата на прозореца и пълнотата на текстовете. */
test('версията: MAJOR.MINOR, package.json я следва като MAJOR.MINOR.0', () => {
  assert.match(SOFTWARE_VERSION, /^\d+\.\d+$/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  assert.equal(pkg.version, `${SOFTWARE_VERSION}.0`);
});

test('новините: уникални id-та с датата отпред, най-новите отгоре, текст на двата езика', () => {
  const ids = new Set(NEWS.map((n) => n.id));
  assert.equal(ids.size, NEWS.length);
  for (const [i, entry] of NEWS.entries()) {
    assert.ok(entry.id.startsWith(`${entry.date}-`), entry.id);
    if (i > 0) assert.ok(NEWS[i - 1]!.date >= entry.date, `${entry.id} е под по-нова`);
    for (const locale of ['bg', 'en'] as const) {
      for (const part of ['area', 'title', 'text']) {
        assert.ok(
          hasKey(locale, `news.entries.${entry.id}.${part}`),
          `${locale} ${entry.id}.${part}`,
        );
      }
    }
  }
  assert.equal(LAST_UPDATE, NEWS[0]!.date);
  assert.ok(NEWS.some((n) => n.id.includes(`versiya-${SOFTWARE_VERSION.replace('.', '-')}`)));
});

test('новините не обявяват функции, които още предстоят (Peppol, НАП, SAF-T)', () => {
  const planned = FEATURES.filter((f) => f.status === 'planned').map((f) => f.code);
  assert.ok(planned.includes('peppol'));
  const all = NEWS.map((n) => n.id).join(' ');
  assert.doesNotMatch(all, /peppol|saf-t|nap-otchitane/i);
});

test('регистрирането: нова инсталация — в деня на новината; обновяване — сега', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const fresh = toRegister(new Set(), now);
  assert.equal(fresh.length, NEWS.length);
  assert.equal(fresh[0]!.publishedAt.getTime(), dayStart(NEWS[0]!.date).getTime());
  const existing = new Set(NEWS.slice(1).map((n) => n.id));
  const update = toRegister(existing, now);
  assert.deepEqual(update, [{ id: NEWS[0]!.id, publishedAt: now }]);
  // Новина „от бъдещето“ на нова инсталация — не по-късно от днес.
  const future = toRegister(new Set(), new Date('2026-11-10T08:00:00Z'));
  assert.ok(future.every((f) => f.publishedAt.getTime() <= dayStart('2026-11-10').getTime()));
});

test('непрочетени: излезлите след „Разбрах“, най-новите първи; по дни за страницата', () => {
  const published = new Map([
    [NEWS[0]!.id, new Date('2026-11-20T10:00:00Z')],
    [NEWS[1]!.id, new Date('2026-11-20T10:00:00Z')],
    [NEWS[2]!.id, new Date('2026-11-01T00:00:00Z')],
  ]);
  const list = unread(published, new Date('2026-11-15T00:00:00Z'));
  assert.deepEqual(
    list.map((n) => n.id),
    [NEWS[0]!.id, NEWS[1]!.id],
  );
  assert.deepEqual(unread(published, new Date('2026-11-21T00:00:00Z')), []);
  const days = byDay();
  assert.equal(
    days.reduce((sum, d) => sum + d.entries.length, 0),
    NEWS.length,
  );
  assert.equal(days[0]!.date, NEWS[0]!.date);
});
