// Round 48 review, the norm registry's texts (norms4–norms8): D.2 mandatory both when 12/16 replace 5.12 and when the
// ratio of the loads changes; a V groove with undercut, where D.2 has no formula, said to be the software's choice in
// rapporto.d2 and in the relazione; the profile's documents (DPR 162/1999 as field, new lift and modification, Reg. (UE)
// 2023/1230); the speed bound as a scope exclusion, not a definition; «confermato» covering the official text of an act.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import calcIt from '../../../messages/calc/it.json';
import { PROFILO, VOCI } from '@/calc/norme';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { VOCI_VANO } from '@/shaft';
import { collaudoOf, type Collaudo } from '@/lib/lift';
import { NO_MARKS } from '../lift/marks';
import { carichiOf, type Carichi } from '../lift/modifica';
import { d2Di } from '../lift/rapporto';
import { buildReport } from '../report/build';
import type { ReportDoc } from '../report/model';

const DAY = new Date('2026-10-16T08:00:00Z');
const project = { name: 'Impianto r48', address: null, city: 'Monza', province: 'MB', plantNumber: null, client: null };
const calc = { id: 'cmtestr48n', label: null, createdAt: DAY, sha256: 'f'.repeat(64), engineVersion: '1.8.0', profileId: 'IT-2026.1', author: null };
const text = (doc: ReportDoc): string => JSON.stringify(doc.blocks);
const report = (V: FormValues, C: Collaudo): ReportDoc =>
  buildReport({ calc, project, company: 'Ditta di prova', values: V, reviews: [], marks: { ...NO_MARKS, collaudo: C }, tipo: null });
const voce = (id: string) => {
  const v = [...VOCI, ...VOCI_VANO].find((x) => x.id === id);
  assert.ok(v, id);
  return v;
};
const SCELTA_VN = 'gola a V con sottosquadro: la D.2 non ha una formula; il maggiore dei due valori è una scelta del software (voce gole.pressione), '
  + 'da confermare con il soggetto della verifica';

test('norms4: la D.2 è obbligatoria con i minimi 12 e 16 (6.2, 14.1) e con il rapporto cambiato (6.1)', () => {
  const v = voce('gole.pressione');
  assert.ok(!v.nota?.includes('obbligatoria solo'));
  for (const s of ['6.2 e 14.1 c)–d)', 'quando cambia il rapporto tra i carichi (6.1, voce rapporto.d2']) assert.ok(v.nota?.includes(s), s);
  for (const s of ['6.1', '6.2', '14.1 c)–d)', 'D.2']) assert.ok(v.riferimento.includes(s), s);
});

test('norms5: la gola a V con sottosquadro nella voce rapporto.d2 e nella relazione, solo per quella gola', () => {
  assert.equal(voce('rapporto.d2').nota, SCELTA_VN);
  const base: FormValues = { ...PRESETS.C, context: 'repl', compare: false }, o = carichiOf(base) as Carichi;
  const C = collaudoOf(base, { norma: '10411-1', parti: ['machine'], documentato: { Q: o.Q, P: o.P - 100, Mcw: o.Mcw } });
  for (const g of ['U', 'UU', 'VH', 'VN'] as const) {
    const V: FormValues = { ...base, n_groove: g, n_beta: 90, n_gamma: 40 };
    assert.equal(d2Di(C, V)?.gola, g, g);
    assert.equal(text(report(V, C)).includes(SCELTA_VN), g === 'VN', g);
  }
});

test('norms6: i documenti del profilo — DPR 162/1999 per campo, nuovo e modifica; Regolamento (UE) 2023/1230', () => {
  const dpr = PROFILO.documenti.find((d) => d.sigla.startsWith('DPR 162/1999'));
  for (const s of ['campo (art. 1)', 'organismo notificato (All. V, VIII)', 'art. 2 c.1 cc)', 'verifica straordinaria (art. 14)']) assert.ok(dpr?.ambito.includes(s), s);
  const reg = PROFILO.documenti.find((d) => d.sigla === 'Regolamento (UE) 2023/1230');
  assert.ok(reg?.ambito.includes('art. 51 par. 2') && reg.ambito.includes('20/01/2027'));
});

test('norms7: 0,15 m/s è fuori dal campo di applicazione, non una definizione; per il pre-CE è una scelta', () => {
  const v = voce('modello.velocita.minima');
  for (const t of [v.valore, calcIt.err_v]) {
    assert.ok(!t.includes('non è un ascensore'));
    for (const s of ['fuori dal campo di applicazione', 'UNI EN 81-20 (1.3 a) 2))', '2014/33/UE (art. 1 par. 2 a))', 'DPR 162/1999 (art. 1 c.3 a)']) assert.ok(t.includes(s), s);
  }
  assert.ok(v.nota?.includes('scelta del software'));
});

test('norms8: «confermato» comprende il testo ufficiale dell’atto, nella lista generata e nel foglio', () => {
  const md = readFileSync(join(process.cwd(), 'docs/lista-verifica-normativa.md'), 'utf8').replace(/\s+/g, ' ');
  assert.ok(md.includes('o letto sul testo ufficiale dell’atto (Normattiva, EUR-Lex)'));
  const py = readFileSync(join(process.cwd(), 'scripts/lista-verifica-xlsx.py'), 'utf8');
  assert.ok(py.includes('o letto sul testo ufficiale dell’atto (Normattiva, EUR-Lex)'));
});
