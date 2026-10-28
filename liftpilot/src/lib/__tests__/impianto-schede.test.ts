// The bar of an installation (round 53): the tabs in the order of the work with their states, and the one next step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Passi } from '@/lib/collega/passi';
import { SCHEDE, prossimoDi, schedeDi, type SchedeInput } from '@/lib/impianto/schede';

const HREF = Object.fromEntries(SCHEDE.map((k) => [k, `/app/projects/x/${k}`])) as SchedeInput['href'];
const NUOVO: Passi = { rilievo: 'daFare', calcolo: 'daFare', progetto: 'daFare', documenti: 'daFare' };
const input = (x: Partial<SchedeInput> = {}): SchedeInput => ({
  passi: NUOVO, tipo: null, disegno: null, progetto: null,
  simulazione: { salvato: null, bozza: false }, relazione: { emessa: null, bozza: false }, href: HREF, ...x,
});
const stati = (x: SchedeInput): Record<string, string | null> => Object.fromEntries(schedeDi(x).map((s) => [s.key, s.stato ? `${s.stato.tono}:${s.stato.key}${s.stato.n ? s.stato.n : ''}` : null]));

test('schede: the tabs in the order of the work, numbered from the survey', () => {
  const s = schedeDi(input());
  assert.deepEqual(s.map((q) => q.key), ['panoramica', 'rilievo', 'calcolo', 'progetto', 'simulazione', 'relazione', 'documenti']);
  assert.deepEqual(s.map((q) => q.n), [null, 1, 2, 3, 4, 5, 6]);
  assert.equal(s[0].stato, null, 'the overview has no state');
});

test('schede: a new installation — the calculation to do, the rest after it', () => {
  assert.deepEqual(stati(input()), {
    panoramica: null, rilievo: 'todo:daFare', calcolo: 'todo:daFare', progetto: 'off:dopoCalcolo',
    simulazione: 'off:dopoProgetto', relazione: 'off:dopoCalcolo', documenti: 'off:dopoProgetto',
  });
  assert.equal(prossimoDi(input(), 0).key, 'calcola');
});

test('schede: a modernisation drawn with checks not met — the Progetto says how many, the next step opens it', () => {
  const x = input({
    passi: { rilievo: 'fatto', calcolo: 'fatto', progetto: 'fatto', documenti: 'fatto' }, tipo: 'AMMODERNAMENTO', disegno: 'vano',
    progetto: { fails: 2 }, simulazione: { salvato: { old: false }, bozza: false },
  });
  const s = stati(x);
  assert.equal(s.progetto, 'fail:nonSuperate2');
  assert.equal(s.simulazione, 'ok:pronta');
  assert.equal(s.relazione, 'todo:daFare');
  assert.deepEqual(prossimoDi(x, 0), { key: 'progettoNonSupera', scheda: 'progetto', n: 2 });
  // its checks met: the relazione tecnica, then the sets, then everything ready
  const ok = { ...x, progetto: { fails: 0 } };
  assert.equal(prossimoDi(ok, 0).key, 'relazione');
  const emessa = { ...ok, relazione: { emessa: { old: false }, bozza: false } };
  assert.equal(stati(emessa).relazione, 'ok:emessa');
  assert.equal(prossimoDi(emessa, 0).key, 'tavole');
  assert.equal(prossimoDi(emessa, 1).key, 'pronto');
});

test('schede: a «Trasformazione completa» has no relazione tecnica; a machine room alone simulates with the shaft drawn', () => {
  const t = input({ passi: { rilievo: 'fatto', calcolo: 'fatto', progetto: 'fatto', documenti: 'fatto' }, tipo: 'TRASFORMAZIONE_COMPLETA', disegno: 'vano', progetto: { fails: 0 } });
  assert.equal(stati(t).relazione, 'off:nonServe');
  assert.equal(prossimoDi(t, 0).key, 'tavole', 'no relazione tecnica on the way');
  const locale = input({ passi: { ...NUOVO, calcolo: 'fatto' }, tipo: 'SOLO_ARGANO', disegno: 'locale' });
  assert.equal(stati(locale).simulazione, 'off:soloVano');
  assert.equal(prossimoDi(locale, 0).key, 'progettoFaiLocale');
  assert.equal(stati({ ...locale, simulazione: { salvato: null, bozza: true } }).simulazione, 'todo:bozza', 'a drawing in progress simulates');
});

test('schede: records to update — the calculation first, then the Progetto, then the relazione and the sets', () => {
  const fatto: Passi = { rilievo: 'fatto', calcolo: 'fatto', progetto: 'fatto', documenti: 'fatto' };
  const base = input({ passi: fatto, tipo: 'AMMODERNAMENTO', disegno: 'vano', progetto: { fails: 0 }, relazione: { emessa: { old: false }, bozza: false } });
  assert.equal(prossimoDi({ ...base, passi: { ...fatto, calcolo: 'differenze', documenti: 'daAggiornare' } }, 1).key, 'calcoloAggiorna');
  assert.equal(stati({ ...base, passi: { ...fatto, calcolo: 'differenze' } }).calcolo, 'fail:differenze');
  assert.equal(prossimoDi({ ...base, passi: { ...fatto, progetto: 'superato' } }, 1).key, 'progettoAggiorna');
  assert.equal(prossimoDi({ ...base, relazione: { emessa: { old: true }, bozza: false } }, 1).key, 'relazioneAggiorna');
  assert.equal(prossimoDi({ ...base, passi: { ...fatto, documenti: 'daAggiornare' } }, 1).key, 'tavoleAggiorna');
  assert.equal(stati({ ...base, simulazione: { salvato: { old: true }, bozza: true } }).simulazione, 'warn:daAggiornare');
});
