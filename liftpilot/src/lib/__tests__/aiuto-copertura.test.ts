// The fields' «?» whose key is made at runtime (round 52): every field the forms render from a list has its text — the
// RT's components («<component>.<field>»), its first page («doc.»), its technical data («tecnici.») and signatures
// («firme.»), the calculator's fields (by their label key or id), the survey cards' fields, the permissions matrix's
// rows, the parts of the acceptance test. aiuto.test.ts checks the literal keys; a field added without its «?» fails
// here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FUNI_10411, LAYOUT, MACHINE, PLANT, ROPES, SERVICE, shown } from '@/components/calc/fields';
import { aiutoRt2 } from '@/components/rt2/aiuto';
import { PARTI } from '@/lib/lift/collaudo';
import { PERMISSION_GROUPS } from '@/lib/permissions';
import { FIELDS } from '@/lib/rilievi/fields';
import { conValore } from '@/lib/rt2/campi';
import { MODULI } from '@/lib/rt2/componenti';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);
const area = (a: string): Record<string, string> => JSON.parse(readFileSync(path.join(root, `messages/aiuto/${a}.json`), 'utf8')) as Record<string, string>;
const mancano = (keys: readonly string[], has: (k: string) => boolean): string[] => keys.filter((k) => !has(k));

/** The ids of a component's list `nome` (`const nome … = [ … ];`) read from its source. */
function idsDi(file: string, nome: string): string[] {
  const src = readFileSync(path.join(root, file), 'utf8'), at = src.indexOf('= [', src.indexOf(`const ${nome}`));
  assert.ok(at >= 0, `${file}: ${nome}`);
  const body = src.slice(at, src.indexOf('];', at));
  return [...body.matchAll(/\bid: '(\w+)'/g)].map((m) => m[1] ?? '');
}

test('aiuto: ogni campo dei componenti della relazione tecnica ha il suo «?»', () => {
  const keys = Object.values(MODULI).flatMap((m) => (m ? m.campi.filter(conValore).map((c) => `${m.id}.${c.id}`) : []));
  assert.ok(keys.length > 80, String(keys.length));
  assert.deepEqual(mancano(keys, (k) => aiutoRt2(k) !== null), []);
});

test('aiuto: Dati Generali, dati tecnici e firme della relazione tecnica', () => {
  const doc = idsDi('src/components/rt2/CardGenerale.tsx', 'CAMPI').map((id) => `doc.${id}`);
  const red = idsDi('src/components/rt2/CardFirme.tsx', 'RED').map((id) => `firme.redatto.${id}`);
  const ver = idsDi('src/components/rt2/CardFirme.tsx', 'VER').map((id) => `firme.verificato.${id}`);
  const tecnici = [...readFileSync(path.join(root, 'src/components/rt2/CardTecnici.tsx'), 'utf8').matchAll(/\['((?:prima|dopo)\.\w+)', \{/g)].map((m) => `tecnici.${m[1] ?? ''}`);
  assert.ok(doc.length >= 5 && red.length === 2 && ver.length === 5 && tecnici.length >= 6, JSON.stringify({ doc, red, ver, tecnici }));
  assert.deepEqual(mancano([...doc, ...red, ...ver, ...tecnici, 'doc.data', 'revisione.testo'], (k) => aiutoRt2(k) !== null), []);
});

test('aiuto: ogni campo del Calcolo argano che il modulo mostra', () => {
  const calc = area('calcolo');
  // the type of the intervention is chosen above the form (InterventoChoice), never as the field «context»
  assert.equal(shown('context', { context: 'repl' }), false);
  const campi = [PLANT, LAYOUT, MACHINE('n_'), MACHINE('o_'), ROPES('n_'), ROPES('o_'), SERVICE, FUNI_10411].flat().filter((f) => f.id !== 'context');
  assert.deepEqual(mancano(campi.map((f) => f.key ?? f.id), (k) => k in calc), []);
  assert.deepEqual(mancano(PARTI.map((p) => `parte_${p}`), (k) => k in calc), []);
});

test('aiuto: ogni campo delle schede di rilievo e ogni riga dei permessi', () => {
  const ril = area('rilievi'), az = area('azienda');
  assert.deepEqual(mancano(FIELDS.map((f) => f.key), (k) => k in ril), []);
  assert.deepEqual(mancano(PERMISSION_GROUPS.flatMap((g) => g.rows).map((c) => `permessi.${c}`), (k) => k in az), []);
});
