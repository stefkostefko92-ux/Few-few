// The document of the differences of the relazione tecnica from the owner's model (round 52) is the one the code's lists
// make (scripts/rt2-differenze.ts), each entry with its ids unique, both sides said, and no text of a standard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIFFERENZE_TUTTE, differenzeMarkdown } from '../rt2/differenze-doc';

test('rt2-differenze: il documento è quello dei registri (npx tsx scripts/rt2-differenze.ts)', () => {
  const doc = readFileSync(new URL('../../../docs/relazione-tecnica-differenze.md', import.meta.url), 'utf8');
  assert.equal(doc, differenzeMarkdown());
});

test('rt2-differenze: ogni punto dice che cosa fa il file e che cosa fa LiftPilot', () => {
  const ids = DIFFERENZE_TUTTE.map((d) => `${d.componente}/${d.id}`);
  assert.equal(new Set(ids).size, ids.length, 'id ripetuti nello stesso componente');
  for (const d of DIFFERENZE_TUTTE) {
    assert.ok(d.modello.trim().length > 8 && d.correzione.trim().length > 3, d.id);
    if (d.norma) assert.match(d.norma, /\b(UNI|EN|DPR|DM)\b/, `${d.id}: ${d.norma}`);
  }
});
