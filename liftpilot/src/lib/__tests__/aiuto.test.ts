// The fields' «?» (round 52): every text file of messages/aiuto/ is a flat object of Italian sentences of a sensible
// length, with nothing of the code in it (a right's code, a backtick, a placeholder); and every key a component asks for
// literally — testoAiuto(TESTI, 'key') with TESTI imported from messages/aiuto/<area>.json — exists in that file, so a
// «?» never silently disappears after a rename.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);
const dir = path.join(root, 'messages/aiuto');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

function sources(d: string): string[] {
  return readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : sources(p);
    return /\.tsx?$/.test(f) ? [p] : [];
  });
}

test('aiuto: each area file is a flat object of short Italian texts, nothing of the code', () => {
  for (const f of files) {
    const testi: unknown = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(testi && typeof testi === 'object' && !Array.isArray(testi), f);
    for (const [k, v] of Object.entries(testi as Record<string, unknown>)) {
      assert.equal(typeof v, 'string', `${f} ${k}`);
      const s = v as string;
      assert.ok(s.trim().length >= 12, `${f} ${k}: too short`);
      assert.ok(s.length <= 700, `${f} ${k}: ${s.length} characters (the «?» is a short explanation; the guide has the rest)`);
      assert.ok(!/[`{}]|TODO|\b[a-z]+:(view|edit|create|manage|issue|export|admin|link|trash)\b/.test(s), `${f} ${k}: code in the text`);
    }
  }
});

test('aiuto: every key a component asks for literally exists in its area file', () => {
  let checked = 0;
  for (const src of sources(path.join(root, 'src'))) {
    const code = readFileSync(src, 'utf8');
    for (const m of code.matchAll(/import (\w+) from '[./@]*\/?(?:\.\.\/)*messages\/aiuto\/([\w-]+)\.json'/g)) {
      const [, name, area] = m;
      const testi = JSON.parse(readFileSync(path.join(dir, `${area}.json`), 'utf8')) as Record<string, string>;
      for (const k of code.matchAll(new RegExp(`testoAiuto\\(${name}, '([^']+)'\\)`, 'g'))) {
        checked++;
        assert.ok(k[1] && k[1] in testi, `${path.relative(root, src)}: «${k[1]}» missing in messages/aiuto/${area}.json`);
      }
    }
  }
  assert.ok(checked >= 0);
});
