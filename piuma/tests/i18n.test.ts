import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_LOCALE, LOCALES, keysOf, localeFromHeader, translate } from '../src/i18n.js';

test('трите езика са пълни огледала на българския', () => {
  const source = keysOf(DEFAULT_LOCALE);
  assert.ok(source.length > 200, `очаквахме богат речник, а той е ${source.length} ключа`);
  for (const locale of LOCALES) {
    const keys = keysOf(locale);
    assert.deepEqual(
      keys.filter((key) => !source.includes(key)),
      [],
      `${locale}: ключове, които ги няма в българския`,
    );
    assert.deepEqual(
      source.filter((key) => !keys.includes(key)),
      [],
      `${locale}: непреведени ключове`,
    );
  }
});

test('нито един превод не е оставен на български в чуждите езици', () => {
  const cyrillic = /[а-яА-Я]/;
  for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    const leftovers = keysOf(locale).filter((key) => cyrillic.test(translate(locale, key)));
    assert.deepEqual(leftovers, [], `${locale}: кирилица в превода на ${leftovers.join(', ')}`);
  }
});

test('заместителите оцеляват в трите езика', () => {
  const source = keysOf(DEFAULT_LOCALE);
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
  for (const key of source) {
    const expected = placeholders(translate(DEFAULT_LOCALE, key));
    if (!expected.length) continue;
    for (const locale of LOCALES) {
      assert.deepEqual(
        placeholders(translate(locale, key)),
        expected,
        `${locale}/${key}: заместителите се разминават с българския`,
      );
    }
  }
});

test('заместването работи, а липсващият ключ не чупи страницата', () => {
  assert.equal(translate('bg', 'users.sessions', { count: 3 }), '3 сесии');
  assert.equal(translate('en', 'users.sessions', { count: 3 }), '3 sessions');
  assert.equal(translate('it', 'users.sessions', { count: 3 }), '3 sessioni');
  assert.equal(translate('bg', 'няма.такъв.ключ'), 'няма.такъв.ключ');
  // Липсващ параметър оставя мястото видимо, вместо да пише „undefined“.
  assert.equal(translate('bg', 'users.sessions'), '{count} сесии');
});

test('езикът на браузъра се чете по тегло', () => {
  assert.equal(localeFromHeader('it-IT,it;q=0.9,en;q=0.8'), 'it');
  assert.equal(localeFromHeader('en-GB,en;q=0.9'), 'en');
  assert.equal(localeFromHeader('de-DE,de;q=0.9,bg;q=0.5'), 'bg');
  assert.equal(localeFromHeader('fr-FR'), 'bg');
  assert.equal(localeFromHeader(undefined), 'bg');
  assert.equal(localeFromHeader('en;q=0.3,it;q=0.9'), 'it');
});

test('всеки речник е валиден JSON без празни стойности', () => {
  for (const file of readdirSync('locales')) {
    const raw = readFileSync(join('locales', file), 'utf8');
    JSON.parse(raw);
    assert.doesNotMatch(raw, /:\s*""/, `${file}: празна стойност`);
  }
});

/**
 * Гейтът срещу забравен превод: щом шаблоните са преведени, в тях няма какво да търси
 * кирилица. Изключение прави само примерът за хаштагове — той е част от съдържанието,
 * не от езика на панела.
 */
test('нито един шаблон не съдържа зашит текст', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? files(path) : entry.name.endsWith('.ejs') ? [path] : [];
    });
  const ALLOWED = /#[а-я]+/; // хаштаг-пример в placeholder
  const offenders: string[] = [];
  for (const file of files('views')) {
    for (const [index, line] of readFileSync(file, 'utf8').split('\n').entries()) {
      const withoutAllowed = line.replace(new RegExp(ALLOWED, 'g'), '');
      if (/[а-яА-Я]/.test(withoutAllowed)) offenders.push(`${file}:${index + 1}`);
    }
  }
  assert.deepEqual(offenders, [], `текст извън речниците: ${offenders.join(', ')}`);
});

/**
 * Гейтът за маршрутите: съобщението към човека минава през речника. Изключенията са
 * логовете и одитът — те са за нас, не за екрана, и остават на български.
 */
test('нито едно съобщение към потребителя не е зашито в маршрут', () => {
  const offenders: string[] = [];
  for (const file of readdirSync('src/admin').filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(join('src/admin', file), 'utf8');
    for (const [index, line] of source.split('\n').entries()) {
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
      const isLogOrAudit = /logger\.|action:|detail:|reason:|err:|label:/.test(line);
      if (isComment || isLogOrAudit) continue;
      if (/(setFlash|title:|message:|error:)[^\n]*['`][^'`]*[а-яА-Я]/.test(line)) {
        offenders.push(`${file}:${index + 1}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `текст извън речниците: ${offenders.join(', ')}`);
});
