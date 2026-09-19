import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertNeonComplete,
  hasIcon,
  iconNames,
  iconSprite,
  neonIconNames,
  renderIcon,
} from '../src/icons.js';

const VIEWS = 'views';
const ICON_DIR = 'public/icons';

function viewFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? viewFiles(path) : entry.name.endsWith('.ejs') ? [path] : [];
  });
}

test('всяка икона е 24×24 и се оцветява от контекста', () => {
  for (const file of readdirSync(ICON_DIR)) {
    const svg = readFileSync(join(ICON_DIR, file), 'utf8');
    assert.match(svg, /viewBox="0 0 24 24"/, `${file}: липсва viewBox 0 0 24 24`);
    assert.match(svg, /stroke="currentColor"/, `${file}: щрихът трябва да е currentColor`);
    // Твърд цвят би игнорирал темата; единственото позволено запълване е currentColor.
    assert.doesNotMatch(svg, /(fill|stroke)="#[0-9a-f]/i, `${file}: твърд цвят в иконата`);
  }
});

test('спрайтът покрива точно това, което наистина ползва `<use>`', () => {
  const sprite = iconSprite();
  const vector = iconNames().filter((name) => !neonIconNames().includes(name));
  if (vector.length === 0) {
    // Пълен неонов набор: нито един `<use>` не се рендира, значи спрайтът е мъртъв
    // товар на всяка страница и трябва да отпадне.
    assert.equal(sprite, '', 'при пълен неонов набор спрайтът трябва да е празен');
    return;
  }
  for (const name of vector) {
    const occurrences = sprite.split(`id="i-${name}"`).length - 1;
    assert.equal(occurrences, 1, `${name}: очаква се един symbol, намерени ${occurrences}`);
  }
  assert.match(sprite, /aria-hidden="true"/);
});

/**
 * Инвариант на слоя: или всяко име има рисувана икона, или нито едно. Половин набор
 * дава изглед с част светещи и част бледи икони — това не е стил, а дефект, и трябва
 * да падне тук, а не да стигне до екран.
 */
test('неоновият набор покрива всички имена', () => {
  const neon = neonIconNames();
  if (neon.length === 0) return; // слоят не се ползва — редовно състояние
  assert.deepEqual(
    iconNames().filter((name) => !neon.includes(name)),
    [],
    'имена без рисувана икона',
  );
  assert.deepEqual(
    neon.filter((name) => !iconNames().includes(name)),
    [],
    'рисувани икони без име в набора',
  );
  assert.doesNotThrow(() => assertNeonComplete());
});

test('всяка рисувана икона е WebP с алфа', () => {
  for (const name of neonIconNames()) {
    const header = readFileSync(join('public/icons-neon', `${name}.webp`)).subarray(0, 32);
    assert.equal(header.subarray(0, 4).toString('latin1'), 'RIFF', `${name}: не е WebP`);
    assert.equal(header.subarray(8, 12).toString('latin1'), 'WEBP', `${name}: не е WebP`);
    const chunk = header.subarray(12, 16).toString('latin1');
    const hasAlpha =
      (chunk === 'VP8X' && (header[20]! & 0b0001_0000) !== 0) ||
      (chunk === 'VP8L' && (header[24]! & 0b0001_0000) !== 0);
    // Без алфа иконата носи черен квадрат и стои като кръпка върху стъклото.
    assert.ok(hasAlpha, `${name}: WebP без алфа-канал (${chunk})`);
  }
});

/** Гейтът, който пази панела от счупена препратка: шаблон не може да иска липсваща икона. */
test('всяка икона, поискана от шаблон, съществува като файл', () => {
  const used = new Set<string>();
  for (const file of viewFiles(VIEWS)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/icon\(\s*'([a-z0-9-]+)'/g)) used.add(match[1]!);
  }
  assert.ok(used.size >= 20, `очаквахме много ползвани икони, намерени ${used.size}`);
  const missing = [...used].filter((name) => !hasIcon(name));
  assert.deepEqual(missing, [], `шаблон иска икони, които ги няма: ${missing.join(', ')}`);
});

/** Наборът се сменя от дизайнер — документацията трябва да го догонва, не да лъже. */
test('всяка икона е описана в ICONS.md', () => {
  const doc = readFileSync('ICONS.md', 'utf8');
  const documented = new Set([...doc.matchAll(/`([a-z][a-z0-9-]+)`/g)].map((m) => m[1]!));
  const missing = iconNames().filter((name) => !documented.has(name));
  assert.deepEqual(missing, [], `неописани икони в ICONS.md: ${missing.join(', ')}`);
});

test('липсваща или подозрителна икона не чупи страницата', () => {
  assert.match(renderIcon('няма-такава'), /^<!-- липсва икона/);
  assert.match(renderIcon('../../etc/passwd'), /^<!-- липсва икона/);
  assert.match(renderIcon('dashboard', { class: 'ic-sm' }), /class="ic ic-sm"/);

  if (neonIconNames().includes('dashboard')) {
    // Рисуваната идва като `<img>`: размерът пак е от класа, а етикетът — през `alt`,
    // защото `aria-label` не важи за изображение без роля.
    assert.match(
      renderIcon('dashboard'),
      /^<img class="ic" src="\/static\/icons-neon\/dashboard\.webp"/,
    );
    assert.match(renderIcon('dashboard'), /alt=""/);
    assert.match(renderIcon('dashboard', { label: 'Табло' }), /alt="Табло"/);
  } else {
    assert.match(renderIcon('dashboard'), /<use href="#i-dashboard">/);
    assert.match(renderIcon('dashboard', { label: 'Табло' }), /role="img" aria-label="Табло"/);
    assert.match(renderIcon('dashboard'), /aria-hidden="true"/);
  }
});

/**
 * CSP-то на панела е `style-src 'self'` — атрибутът `style="…"` се блокира МЪЛЧАЛИВО
 * и оформлението просто не се прилага (така лентите за квота дълго време бяха празни).
 */
test('нито един шаблон не разчита на inline стил', () => {
  const offenders = viewFiles(VIEWS).filter((file) => /style="/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, [], `inline стил в: ${offenders.join(', ')}`);
});
