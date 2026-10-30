// Round 47, after the independent recheck: the speed «not changed» point says the two limits it rests on (15.1 above
// the reference, 15.16 below the logbook's initial speed), never «within 5 % of the reference» — a design up to 5 %
// above the reference may be far below it —, and with the speed after 50 Hz alone it says the reduction is not
// measured (speedWithin50); D.1 at the brake test says the verdict's outcome in words — when the calculation's own a is
// already over a_lim, «non è soddisfatta», never words that read as a pass; the documents' «Sì» on a record opened
// again stays theirs (risposteIniziali), so a part the rule locked is asked again once they stop deciding it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { collaudoOf, type Collaudo, type Parte } from '@/lib/lift';
import { carichiOf, esitoDocumenti, variazioneVelocita, type Carichi, type Libretto } from '@/lib/lift/modifica';
import { obblighiParti } from '@/lib/lift/obblighi';
import { OBBLIGHI_VARIAZIONI } from '@/lib/lift/obblighi-variazioni';
import { daIndicare, effettiva, risposteIniziali, sceltaSalvata } from '@/lib/lift/risposte';
import { d1Di } from '../lift/rapporto';
import { d1Sito } from '../report/cases';
import { variazioniDoc } from '../report/variazioni';

const V = (v: number, x: FormValues = {}): FormValues => ({ ...PRESETS.C, context: 'repl', keepRopes: true, compare: true, v: String(v), H: '18', ...x });
const C = (parti: Parte[], x: Partial<Collaudo> = {}): Collaudo => ({ norma: '10411-1', parti: ['machine', ...parti], ...x });
const O1 = OBBLIGHI_VARIAZIONI['10411-1'];
const speedPts = (c: Collaudo, Vx: FormValues): string[] => obblighiParti(c, Vx).filter((p) => p.rif.startsWith('UNI 10411-1:2024, 15.')).map((p) => p.testo);

test('velocità non variata: i due limiti (15.1 e 15.16), mai «entro il 5 % del riferimento»', () => {
  for (const t of Object.values(O1)) assert.ok(!t?.testo.includes('entro il 5 % del riferimento'), t?.testo);
  // F4: logbook 0,80, after 50 Hz 0,95, design 0,80 — −15,8 % from the reference 0,95, not a change by either limit
  const lib: Libretto = { v: 0.8, v50: 0.95 }, Vx = V(0.8), x = variazioneVelocita('10411-1', lib, 0.8);
  assert.ok(x && !x.variata && !x.uguale && x.dv < -0.15, 'the fixture: far below the reference, within both limits');
  assert.equal(esitoDocumenti('10411-1', { libretto: lib }, Vx).speed, 'no');
  assert.deepEqual(speedPts(C([], { libretto: lib }), Vx), [O1.speedWithin?.testo]);
  assert.ok(O1.speedWithin?.testo.startsWith('velocità né oltre il 5 % sopra il riferimento (15.1) né oltre il 5 % sotto la velocità iniziale del libretto'));
  // the row beside it keeps both comparisons, as before
  assert.ok((variazioniDoc(C([], { libretto: lib }), Vx).find((r) => r.voce === 'velocita')?.text ?? '').includes('−15,8 %'));
  // within 5 % above and below a logbook's speed alone: the same point
  assert.deepEqual(speedPts(C([], { libretto: { v: 1 } }), V(0.97)), [O1.speedWithin?.testo]);
});

test('velocità solo dopo 50 Hz, indicata come non variata: la riduzione dalla velocità iniziale non si misura', () => {
  // F9b: 1,00 after 50 Hz alone, design 0,90 answered «No» — −10 % from the reference; and 1,03 within 5 % above it
  for (const v of [0.9, 1.03]) {
    const Vx = V(v), lib: Libretto = { v50: 1 };
    assert.equal(esitoDocumenti('10411-1', { libretto: lib }, Vx).speed, 'aperta', `v ${v}`);
    const pts = speedPts(C([], { libretto: lib }), Vx);
    assert.deepEqual(pts, [O1.speedWithin50?.testo], `v ${v}`);
    assert.ok(pts[0]?.includes('la riduzione dalla velocità iniziale (15.16) non si misura senza la velocità del libretto') && pts[0].includes('i punti da 15.2 a 15.15'));
  }
  // equal to the speed after 50 Hz: «uguale», no point (as before)
  assert.deepEqual(speedPts(C([], { libretto: { v50: 1 } }), V(1)), []);
  // under -11 no such point
  assert.equal(OBBLIGHI_VARIAZIONI['10411-11'].speedWithin50, undefined);
});

test('D.1 alla prova del freno: l’esito a parole — con a già oltre a_lim «non è soddisfatta», mai «la verifica»', () => {
  const Vd = (ae: string): FormValues => ({ ...PRESETS.C, context: 'repl', compare: false, k: '0.5', v: '1', ae, buffers: true });
  for (const [ae, aTxt] of [['1.0', '1,00'], ['0.9', '0,90']] as const) {
    const Vx = Vd(ae), o = carichiOf(Vx) as Carichi, c = collaudoOf(Vx, { norma: '10411-1', parti: ['machine'], documentato: { Q: o.Q, P: o.P - 100, Mcw: o.Mcw } });
    const d = d1Di(c, Vx), p = d1Sito(c, Vx);
    assert.ok(d && p && d.aLim !== null && d.a > d.aLim && d.worst.util > 1, `ae ${ae}: the fixture, a over a_lim`);
    assert.ok(p.testo.includes(`nel calcolo, con C1 = `) && p.testo.includes(`(a = ${aTxt} m/s²), non è soddisfatta: a supera già a_lim`), p.testo);
    assert.ok(!p.testo.includes('la verifica con') && !p.testo.includes('è soddisfatta con'), p.testo);
  }
  // within a_lim: the outcome says it is met
  const Vx = { ...PRESETS.C, context: 'repl', compare: false, k: '0.5', v: '1' }, o = carichiOf(Vx) as Carichi;
  const ok = collaudoOf(Vx, { norma: '10411-1', parti: ['machine'], documentato: { Q: o.Q, P: o.P - 100, Mcw: o.Mcw } });
  assert.ok(d1Sito(ok, Vx)?.testo.includes('nel calcolo è soddisfatta con C1 = 1,150, il minimo della fascia'));
});

test('il «Sì» dei documenti nel calcolo riaperto resta loro: chiesto di nuovo quando non decidono più, mai un «No» non dato', () => {
  const Vx = V(1, { H: '20' }), docs = { libretto: { v: 1, H: 18 } };
  const stored = collaudoOf(Vx, C([], docs));
  assert.ok(stored.parti.includes('travel'), 'the record stores the travel the rule brings');
  const chosen = sceltaSalvata(Vx, stored), risposte = risposteIniziali('AMMODERNAMENTO', chosen, true, Vx);
  assert.ok(!chosen.parti.includes('travel') && !risposte.includes('travel'), risposte.join());
  const left = (c: Collaudo): Parte[] => daIndicare('AMMODERNAMENTO', c, collaudoOf(Vx, effettiva('AMMODERNAMENTO', c, Vx)), Vx, risposte);
  assert.ok(!left(chosen).includes('travel'), 'locked while the logbook says 18 m');
  assert.ok(left({ ...chosen, libretto: { v: 1 } }).includes('travel'), 'the logbook’s travel cleared: to answer again');
  // an explicit «No» where the documents decide nothing stays the user's answer
  assert.ok(risposteIniziali('AMMODERNAMENTO', chosen, true, Vx).includes('load'));
});
