// The editor's own words (editor/text.js → editor.ui.* in locales): every key the editor's code asks for exists in
// every language, a count has both forms, and a key built at run time (`drill.group.${role}`) has the whole family.
// tx() shows a missing key as itself, so without this a gap would only be seen on the screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, textsUnder } from '../src/i18n.js';
import { ROOT } from '../src/paths.js';

const SOURCES = readdirSync(join(ROOT, 'editor'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => [name, readFileSync(join(ROOT, 'editor', name), 'utf8')] as const);

function literalKeys(): Array<{ file: string; key: string; count: boolean }> {
  const out: Array<{ file: string; key: string; count: boolean }> = [];
  for (const [file, text] of SOURCES) {
    for (const m of text.matchAll(/\btx\(\s*'([\w.-]+)'/g))
      out.push({ file, key: m[1] ?? '', count: false });
    for (const m of text.matchAll(/\btx\(\s*[\w.() ]+\s*\?\s*'([\w.-]+)'\s*:\s*'([\w.-]+)'/g)) {
      out.push({ file, key: m[1] ?? '', count: false }, { file, key: m[2] ?? '', count: false });
    }
    for (const m of text.matchAll(/\btxCount\([^,]+,\s*'([\w.-]+)'/g))
      out.push({ file, key: m[1] ?? '', count: true });
  }
  return out;
}

test('every word the editor asks for exists in every language', () => {
  const keys = literalKeys();
  assert.ok(
    keys.length > 100,
    `only ${keys.length} keys found — the scan no longer sees the editor`,
  );
  for (const locale of LOCALES) {
    const text = textsUnder(locale, 'editor.ui.');
    const missing = keys
      .flatMap(({ file, key, count }) =>
        (count ? [`${key}.one`, `${key}.other`] : [key]).map((k) => [file, k]),
      )
      .filter(([, k]) => !(k! in text))
      .map(([file, k]) => `${locale} ${file}: ${k}`);
    assert.deepEqual(missing, []);
  }
});

test('the keys the editor builds at run time have every member of their family', () => {
  const families: Record<string, readonly string[]> = {
    'level.': ['error', 'warn', 'info'],
    'decor.': ['uni', 'wood', 'stone', 'concrete', 'metal', 'fantasy', 'textile', 'paint', 'other'],
    'handleType.': ['bar', 'knob', 'profile', 'edge', 'shell', 'recessed', 'gola', 'ring', 'other'],
    'ralGroup.': ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'cat.': ['handles', 'hinges', 'slides', 'bed', 'decors'],
    'drill.group.': ['door', 'drawer-front', 'side', 'partition', 'other'],
    'drill.card.': ['hinge', 'handle', 'slide'],
    'drill.cup.': ['left', 'right'],
    'drill.pilots.': ['through', 'blind'],
    'drill.plateHoles.': ['through', 'blind'],
    'post.': ['iso', 'grbl'],
  };
  for (const locale of LOCALES) {
    const text = textsUnder(locale, 'editor.ui.');
    for (const [prefix, members] of Object.entries(families)) {
      for (const m of members) assert.ok(`${prefix}${m}` in text, `${locale}: ${prefix}${m}`);
    }
    // the furniture groups of the type picker come from common.json (furniture.group.*)
    for (const g of ['kitchen', 'bedroom', 'living', 'custom']) {
      assert.ok(g in textsUnder(locale, 'furniture.group.'), `${locale}: furniture.group.${g}`);
    }
  }
});

test('the editor writes no Bulgarian word of its own', () => {
  // the texture and metal modules read the catalogue's decor names (data, in any language) — not words of the editor
  const DATA = new Set([
    'tex-wood-species.js',
    'tex-surface.js',
    'tex-stone.js',
    'viewer-metals.js',
    'viewer-hw.js',
    'viewer-surfaces.js',
    'viewer-slides.js',
    'viewer-parts.js',
    'viewer-handles.js',
  ]);
  const offenders: string[] = [];
  for (const [file, text] of SOURCES) {
    if (DATA.has(file)) continue;
    text.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').trim();
      if (code.startsWith('*') || code.startsWith('/*')) return;
      if (/[Ѐ-ӿ]/.test(code)) offenders.push(`${file}:${i + 1}: ${code.slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, []);
});
