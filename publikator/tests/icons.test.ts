import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { hasIcon, iconNames, iconSprite, renderIcon } from '../src/icons.js';

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

test('спрайтът съдържа всяка икона точно веднъж', () => {
  const sprite = iconSprite();
  for (const name of iconNames()) {
    const occurrences = sprite.split(`id="i-${name}"`).length - 1;
    assert.equal(occurrences, 1, `${name}: очаква се един symbol, намерени ${occurrences}`);
  }
  assert.match(sprite, /aria-hidden="true"/);
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
  assert.match(renderIcon('dashboard'), /<use href="#i-dashboard">/);
  assert.match(renderIcon('dashboard', { class: 'ic-sm' }), /class="ic ic-sm"/);
  assert.match(renderIcon('dashboard', { label: 'Табло' }), /role="img" aria-label="Табло"/);
  assert.match(renderIcon('dashboard'), /aria-hidden="true"/);
});

/**
 * CSP-то на панела е `style-src 'self'` — атрибутът `style="…"` се блокира МЪЛЧАЛИВО
 * и оформлението просто не се прилага (така лентите за квота дълго време бяха празни).
 */
test('нито един шаблон не разчита на inline стил', () => {
  const offenders = viewFiles(VIEWS).filter((file) => /style="/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, [], `inline стил в: ${offenders.join(', ')}`);
});
