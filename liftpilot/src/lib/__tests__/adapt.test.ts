// The adaptations UNI 10411-1:2024, 14 asks of a replaced machine: one list (`ADAPT`) for the screen of the calculation,
// the form and the documents. The list is read from `ADAPT` itself, so a key added there is held to the same rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import calcIt from '../../../messages/calc/it.json';
import calcEn from '../../../messages/calc/en.json';
import calcBg from '../../../messages/calc/bg.json';
import { PRESETS } from '@/calc/presets';
import { adeguamentiDovuti, collaudoOf, type Collaudo } from '@/lib/lift';
import { ADAPT } from '../present/adapt';
import { makeTr, type CalcDict } from '../present/tr';
import { buildReport } from '../report/build';
import { adaptSection } from '../report/collaudo';
import type { ReportDoc } from '../report/model';

const LANGS = [['it', calcIt], ['en', calcEn], ['bg', calcBg]] as const;
const REPL: Collaudo = collaudoOf({ context: 'repl' });

test('ogni voce di ADAPT esiste in tutte e tre le lingue, non è vuota e non ha segnaposto', () => {
  assert.ok(ADAPT.length > 0);
  for (const [lang, dict] of LANGS) {
    for (const k of ADAPT) {
      const v = (dict as Record<string, string>)[k];
      assert.equal(typeof v, 'string', `${lang}.${k}`);
      assert.ok(v.trim().length > 0, `${lang}.${k} vuota`);
      assert.ok(!/[{}]/.test(v), `${lang}.${k}: segnaposto`);
    }
  }
});

test('ADAPT: nessuna voce due volte, e nessuna dei testi delle altre norme', () => {
  assert.equal(new Set(ADAPT).size, ADAPT.length);
  for (const other of ['a_src', 'a_en81', 'a_11', 'a_other']) assert.ok(!(ADAPT as readonly string[]).includes(other), other);
});

test('la sezione del documento ha esattamente le voci di ADAPT, nel loro ordine, in ogni lingua', () => {
  assert.equal(adeguamentiDovuti(REPL), true, 'la sostituzione della macchina sotto UNI 10411-1 le deve');
  for (const [lang, dict] of LANGS) {
    const t = makeTr(dict as CalcDict);
    const s = adaptSection(REPL, true, t);
    const list = s.blocks.find((b) => b.t === 'list');
    assert.ok(list && list.t === 'list', lang);
    assert.deepEqual(list.items, ADAPT.map((k) => t(k)), lang);
  }
});

test('la relazione di calcolo porta le voci di ADAPT', () => {
  const doc: ReportDoc = buildReport({
    calc: { id: 'cmtest0001', label: null, createdAt: new Date('2026-10-05T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
    project: { name: 'Impianto di prova', address: null, city: null, province: null, plantNumber: null, client: null },
    company: 'Ditta di prova', values: PRESETS.B, reviews: [],
    marks: { pEstimate: false, geometry: [], machineProposed: false, collaudo: REPL },
  });
  const t = makeTr(calcIt as CalcDict);
  const lists = doc.blocks.flatMap((b) => (b.t === 'list' ? [b.items] : []));
  assert.ok(lists.some((items) => JSON.stringify(items) === JSON.stringify(ADAPT.map((k) => t(k)))), 'la lista delle voci è nella relazione');
});

test('senza le voci dovute (altra norma o altre parti) la sezione non le elenca', () => {
  const t = makeTr(calcIt as CalcDict), adapt = JSON.stringify(ADAPT.map((k) => t(k)));
  for (const C of [{ norma: '10411-1', parti: ['ropes'] }, { norma: '10411-11', parti: ['machine'] }, { norma: 'en81', parti: [] }] as Collaudo[]) {
    const s = adaptSection(collaudoOf({ context: 'repl' }, C), true, t);
    assert.ok(!s.blocks.some((b) => b.t === 'list' && JSON.stringify(b.items) === adapt), JSON.stringify(C));
  }
  // round 37 (L2-02): the other parts replaced have their own points — the ropes under UNI 10411-1, 17; the machine alone none
  const ropes = adaptSection(collaudoOf({ context: 'repl' }, { norma: '10411-1', parti: ['ropes'] }), true, t).blocks;
  const items = ropes.flatMap((b) => (b.t === 'list' ? b.items : []));
  assert.equal(items.length, 1);
  assert.ok(items[0]?.startsWith('UNI 10411-1:2024, 17: funi nuove secondo la UNI EN 81-20 5.5.1'), items[0]);
  const machine = adaptSection(collaudoOf({ context: 'repl' }, { norma: '10411-11', parti: ['machine'] }), true, t).blocks;
  assert.ok(!machine.some((b) => b.t === 'list' || b.t === 'h3'));
});
