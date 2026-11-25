// The pages that stand on their own — without views/partials/top.ejs, which links every stylesheet of the
// portal — link by hand the sheets of what they use. The QR label page used `.select` without forms.css and
// showed the browser's bare drop-down (the visual check of 21 November 2026).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const VIEWS = join(import.meta.dirname, '..', 'views');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : name.endsWith('.ejs') ? [path] : [];
  });

/** Class of the markup → the stylesheet that draws it. */
const FOGLI: [string[], string][] = [
  [
    ['select', 'input', 'textarea', 'field', 'tick', 'choice', 'unit', 'errors', 'grid', 'form'],
    'forms.css',
  ],
  [['btn'], 'buttons.css'],
];
/** The whole class names in the markup, either quotes (not `field.wide` inside an EJS expression). */
const classi = (source: string) =>
  new Set([...source.matchAll(/class=(["'])(.*?)\1/g)].flatMap((m) => m[2]!.split(/\s+/)));

describe('a page on its own', () => {
  it('links the stylesheet of every kind of control it uses', () => {
    let pagine = 0;
    for (const path of files(VIEWS)) {
      const source = readFileSync(path, 'utf8');
      if (!/<!doctype html>/i.test(source)) continue;
      // The shared tops link their sheets from a list (`sheets`), not one by one.
      if (/\bfor \(const sheet of sheets\)/.test(source)) continue;
      pagine += 1;
      const usate = classi(source);
      for (const [nomi, foglio] of FOGLI) {
        if (nomi.some((n) => usate.has(n)))
          assert.ok(
            source.includes(`href="/static/css/${foglio}`),
            `${relative(VIEWS, path)}: ${foglio}`,
          );
      }
    }
    assert.ok(pagine >= 2, `${pagine} pages on their own`);
  });
});
