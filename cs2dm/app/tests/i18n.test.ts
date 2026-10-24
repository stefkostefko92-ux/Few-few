import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_LOCALE, LOCALES, keysOf, localeFromHeader, translate } from '../src/i18n.js';

test('трите езика са пълни огледала на българския (паритет на ключовете)', () => {
  const source = keysOf(DEFAULT_LOCALE);
  assert.ok(source.length > 250, `очаквахме пълен речник, а той е ${source.length} ключа`);
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

test('нито един превод не е оставен на кирилица в английския и италианския', () => {
  for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    const leftovers = keysOf(locale).filter((key) => /[а-яА-Я]/.test(translate(locale, key)));
    assert.deepEqual(leftovers, [], `${locale}: кирилица в ${leftovers.join(', ')}`);
  }
});

test('заместителите оцеляват в трите езика', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
  for (const key of keysOf(DEFAULT_LOCALE)) {
    const expected = placeholders(translate(DEFAULT_LOCALE, key));
    for (const locale of LOCALES) {
      assert.deepEqual(
        placeholders(translate(locale, key)),
        expected,
        `${locale}/${key}: заместителите се разминават с българския`,
      );
    }
  }
});

test('всеки речник е валиден JSON без празни стойности', () => {
  for (const file of readdirSync('locales')) {
    const raw = readFileSync(join('locales', file), 'utf8');
    JSON.parse(raw);
    assert.doesNotMatch(raw, /:\s*""/, `${file}: празна стойност`);
  }
});

test('кавичките следват езика: „…“ на български, «…» на италиански', () => {
  for (const key of keysOf('bg')) {
    assert.doesNotMatch(translate('bg', key), /"/, `bg/${key}: права кавичка вместо „…“`);
  }
  for (const key of keysOf('it')) {
    assert.doesNotMatch(translate('it', key), /["„“]/, `it/${key}: кавички вместо «…»`);
  }
});

test('езикът на браузъра се чете по тегло; непознатият пада към българския', () => {
  assert.equal(localeFromHeader('it-IT,it;q=0.9,en;q=0.8'), 'it');
  assert.equal(localeFromHeader('en-GB,en;q=0.9'), 'en');
  assert.equal(localeFromHeader('de-DE,de;q=0.9,bg;q=0.5'), 'bg');
  assert.equal(localeFromHeader('fr-FR'), 'bg');
  assert.equal(localeFromHeader(undefined), 'bg');
  assert.equal(localeFromHeader('en;q=0.3,it;q=0.9'), 'it');
  assert.equal(localeFromHeader('en;q=0'), 'bg');
  assert.equal(localeFromHeader('x'.repeat(2000)), 'bg');
});

function files(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path, ext) : entry.name.endsWith(ext) ? [path] : [];
  });
}

/**
 * Гейтът срещу забравен превод: в шаблоните няма какво да търси кирилица. Изключения са само
 * коментарите — EJS (`<%# … %>`) и маркерите „ПОТВЪРДИ“ за собственика (`<!-- … -->`).
 */
test('нито един шаблон не съдържа зашит текст', () => {
  const offenders: string[] = [];
  for (const file of files('views', '.ejs')) {
    const source = readFileSync(file, 'utf8')
      .replace(/<%#[\s\S]*?%>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    source.split('\n').forEach((line, index) => {
      if (/[а-яА-Я]/.test(line)) offenders.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `текст извън речниците: ${offenders.join(', ')}`);
});

test('маркерът „ПОТВЪРДИ: държава на хостинга“ стои в шаблона на поверителността', () => {
  const view = readFileSync('views/privacy.ejs', 'utf8');
  assert.match(view, /<!-- ПОТВЪРДИ: държава на хостинга -->/);
});

test('нито едно съобщение към посетителя не е зашито в маршрут (и в панела)', () => {
  const offenders: string[] = [];
  const sources = [
    ...files('src/routes', '.ts'),
    ...files('src/admin', '.ts'),
    'src/server.ts',
    'src/view.ts',
  ];
  for (const file of sources) {
    // Многоредовите извиквания на logger (pino) са за нас — съобщението им е на отделен ред.
    const text = readFileSync(file, 'utf8').replace(/logger\.\w+\([\s\S]*?\);/g, (call) =>
      call.replace(/[^\n]/g, ''),
    );
    text.split('\n').forEach((line, index) => {
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
      // Логовете и етикетите им (`settle('…')`) са за нас, не за екрана — остават на български.
      const isLog = /logger\.|settle\(|'четене'|err:/.test(line);
      // Вътрешните грешки отиват в лога; посетителят вижда страница от речника.
      const isInternalError = /new Error\(|super\(/.test(line);
      if (isComment || isLog || isInternalError) return;
      if (/['`][^'`]*[а-яА-Я][^'`]*['`]/.test(line)) offenders.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `текст извън речниците: ${offenders.join(', ')}`);
});
