// Golden test: the engine against the reference results, number for number. fixtures/golden-v12.json comes from the
// prototype v12 (the calculator published for Panev): the three examples in full, the other cases as SHA-256 of
// the same canonical JSON. An intended change of results regenerates it with scripts/golden-export.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEYS, runCase, sha256 } from './project';
import type { Json } from './project';
import type { FormValues } from '../index';

interface GoldenCase { name: string; V: FormValues; inputs?: Json; res?: Json; old?: Json; window?: Json; sens?: Json; sizing?: Json; sizingFree?: Json }
const golden = JSON.parse(readFileSync(new URL('./fixtures/golden-v12.json', import.meta.url), 'utf8')) as { cases: GoldenCase[] };

test('golden: esempi A, B, C identici al riferimento, campo per campo', () => {
  for (const c of golden.cases.slice(0, 3)) {
    const out = runCase(c.V, c.sizing !== undefined);
    for (const key of KEYS) if (c[key] !== undefined) assert.deepStrictEqual(out[key], c[key], `${c.name}: ${key}`);
  }
});

test(`golden: altri ${golden.cases.length - 3} casi (casuali, varianti, dati non validi) con lo stesso hash`, () => {
  const wrong: string[] = [];
  for (const c of golden.cases.slice(3)) {
    const out = runCase(c.V, c.sizing !== undefined);
    for (const key of KEYS) {
      const want = c[key] as { sha256: string } | undefined;
      if (want !== undefined && sha256(out[key] ?? null) !== want.sha256) wrong.push(`${c.name}: ${key}`);
    }
  }
  assert.deepStrictEqual(wrong, [], `diversi dal riferimento: ${wrong.slice(0, 10).join('; ')}`);
});
