import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { ITEM_SETS } from '../../seed/sets';
import { REGION_ORDER } from '../regions';

/**
 * Лендингът „Dominion“ тегли сетовете живо (/public/sets/preview), но някои факти са изписани
 * като текст: регионите в досието (client/src/lib/regions.ts) и „N сета“ в лентата
 * (client/src/i18n/locales/dominion/*.json). Тестът сверява и двете със сървъра, за да не
 * обещава лендингът нещо, което играта няма.
 */
const CLIENT = path.resolve(__dirname, '../../../../client/src');

test('регионите в досието на лендинга = REGION_ORDER на сървъра (същият ред)', () => {
  const src = fs.readFileSync(path.join(CLIENT, 'lib/regions.ts'), 'utf8');
  const slugs = [...src.matchAll(/slug:\s*'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(slugs, REGION_ORDER);
});

test('броят сетове в лентата на лендинга = ITEM_SETS.length (на всеки език)', () => {
  for (const lng of ['bg', 'en', 'it']) {
    const j = JSON.parse(fs.readFileSync(path.join(CLIENT, `i18n/locales/dominion/${lng}.json`), 'utf8'));
    const line = (j.nd.ticker as string[]).find((s) => /^\d+\s/.test(s));
    assert.ok(line, `${lng}: няма ред „N сета“ в лентата`);
    assert.equal(Number(line!.split(/\s/)[0]), ITEM_SETS.length, `${lng}: „${line}“`);
  }
});
