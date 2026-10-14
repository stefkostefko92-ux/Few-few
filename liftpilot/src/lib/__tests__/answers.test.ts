// The plain-text answers of the API routes (src/lib/answers.ts): Italian, the product's only language, since a failed
// download shows them as they are — and no route answers in English any more (the Stripe webhook answers Stripe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import it from '../../../messages/it.json';
import { ANSWER } from '../answers';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : sources(p);
    return /\.tsx?$/.test(f) ? [p] : [];
  });
}

test('ogni risposta breve è un testo italiano di messages/it.json', () => {
  const errors = new Set(Object.values(it.errors));
  for (const [k, v] of Object.entries(ANSWER)) {
    assert.ok(errors.has(v), `${k}: from errors.*`);
    assert.ok(v.length > 10 && /[a-zà-ù]/.test(v), k);
  }
});

test('nessuna route risponde con un testo inglese', () => {
  const english = /(?:text\(\d{3}, |new Response\()'(?:Unauthorized|Forbidden|Not found|Too many requests|Busy|Failed|Export failed|[A-Z][a-z]+ (?:generation )?failed|The running engines?)/;
  for (const f of sources(path.join(root, 'src'))) {
    if (f.endsWith(path.join('billing', 'webhook', 'route.ts'))) continue; // Stripe's endpoint: the answers are for Stripe
    assert.ok(!english.test(readFileSync(f, 'utf8')), path.relative(root, f));
  }
});
