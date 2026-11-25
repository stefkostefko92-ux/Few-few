// The sticky bar with "Salva" at the bottom of the long forms is black like the top bar (pages.css,
// `.actions`): its buttons are the bar's own — `btn--inverse` (white) and `btn--bar` (outlined). A
// `btn--primary` or `btn--ghost` there is black on black in the light theme (found in the visual check of
// 10 November 2026 on the intervention and closing-report forms).
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

describe('the sticky bar of a form', () => {
  it('uses only the buttons of the bar', () => {
    let bars = 0;
    for (const path of files(VIEWS)) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/<div class="actions">([\s\S]*?)<\/div>/g)) {
        bars += 1;
        assert.doesNotMatch(match[1]!, /btn--(primary|ghost)\b/, relative(VIEWS, path));
      }
    }
    assert.ok(bars >= 5, `${bars} bars`);
  });
});
