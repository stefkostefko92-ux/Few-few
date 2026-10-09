import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Правилата на изгледите, които се чупят тихо: страницата се зарежда, тестовете на
 * услугите са зелени, а човекът пред екрана не стига до поста или губи предупреждение.
 */
const VIEWS = 'views/admin';
const views = readdirSync(VIEWS)
  .filter((name) => name.endsWith('.ejs'))
  .map((name) => ({ name, source: readFileSync(join(VIEWS, name), 'utf8') }));

test('пост без текст остава достъпен — връзката му никога не е празна', () => {
  const offenders: string[] = [];
  for (const { name, source } of views) {
    for (const [index, line] of source.split('\n').entries()) {
      if (/caption\.slice\(/.test(line) && !line.includes("t('posts.noCaption')")) {
        offenders.push(`${name}:${index + 1}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'откъс от caption без резервен текст — празен caption = празна връзка',
  );
});

test('изчезва само еднократното потвърждение, не постоянните бележки и не грешките', () => {
  const script = readFileSync('public/admin.js', 'utf8');
  assert.ok(
    script.includes('.flash[data-autohide]'),
    'скриптът трябва да избира само [data-autohide]',
  );
  assert.ok(
    !/querySelector\('\.flash'\)/.test(script),
    'голото .flash хваща и изтекъл токен, и провален пост',
  );
  const shell = readFileSync('views/partials/shell-start.ejs', 'utf8');
  assert.match(
    shell,
    /flash\.kind === 'error' \? '' : ' data-autohide'/,
    'грешката остава, докато човекът я прочете',
  );
});

test('бутон само с икона носи достъпно име', () => {
  const offenders: string[] = [];
  for (const { name, source } of views) {
    for (const button of source.match(/<button[\s\S]*?<\/button>/g) ?? []) {
      // Отварящият таг свършва на първото `>`, което не е краят на EJS таг (`%>`).
      const inner = button.replace(/^<button(?:%>|[^>])*>/, '');
      const iconOnly = /^\s*<%- icon\([^)]*\) %>\s*<\/button>$/.test(inner);
      if (iconOnly && !button.includes('aria-label=')) offenders.push(name);
    }
  }
  assert.deepEqual(offenders, []);
});

test('всеки списък като карта на телефон има водеща клетка', () => {
  const lists = views.filter(({ source }) => source.includes('table-wrap to-cards'));
  assert.ok(lists.length >= 9, 'списъците на панела минават в карти под 660 px');
  for (const { name, source } of lists) {
    const tables = source.split('table-wrap to-cards').length - 1;
    const leads = (source.match(/<td class="[^"]*\blead\b/g) ?? []).length;
    // Линтът е изключение: чипът и правилото са заглавието, съобщението заема реда.
    if (name === 'post-detail.ejs') continue;
    assert.ok(leads >= tables, `${name}: ${tables} списъка, ${leads} водещи клетки`);
  }
  const css = readFileSync('public/admin-views.css', 'utf8');
  assert.match(css, /\.to-cards td\[data-label\]::before\s*{[^}]*content: attr\(data-label\)/);
  assert.ok(
    !/(^|\s)\.stack\s/m.test(css),
    '`.stack` е класът на вертикалните форми в admin.css — не се преизползва',
  );
});

test('прегледът на поста пази мястото си и не показва счупено изображение', () => {
  const detail = readFileSync(join(VIEWS, 'post-detail.ejs'), 'utf8');
  // Редът с `<img`, не до първото `>` — EJS тагът `%>` в src иначе реже атрибутите.
  const img = detail.split('\n').filter((line) => line.includes('<img '));
  assert.equal(img.length, 1);
  for (const attr of ['width=', 'height=', 'alt=', 'data-fallback', 'decoding="async"']) {
    assert.ok(img[0]!.includes(attr), `липсва ${attr}`);
  }
  const css = readFileSync('public/admin-views.css', 'utf8');
  assert.match(
    css,
    /\.ig-media\s*{[^}]*aspect-ratio: 4 \/ 5/,
    'рамката държи мястото — нула изместване',
  );
  assert.match(
    css,
    /\.ig-media img\[hidden\]\s*{\s*display: none/,
    'скритата медия не заема рамката',
  );
});
