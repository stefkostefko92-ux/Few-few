// Round 47, after the review: the documents' answer read where it is theirs only. The speed answered «Sì» while the
// documents leave it open (under -1 the speed after 50 Hz alone) is the change the answer declares — the reduction from
// the initial speed (15.16–15.17), DPR n. 1) confirmed —, never the engineer's point against the documents; a design
// equal to the logbook's speed while the lift runs at another after 50 Hz is no «uguale» (both comparisons, the DPR's
// caveat kept); D.1 at the brake test names the C1 the verdict used and says the directions are the software's reading;
// the list of what is missing asks under -11 for the documented speed; the form's «within 5 %» keeps the DPR's caveat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { collaudoOf, type Collaudo, type Parte } from '@/lib/lift';
import { carichiOf, esitoDocumenti, variazioneVelocita, type Carichi, type Libretto } from '@/lib/lift/modifica';
import { obblighiParti } from '@/lib/lift/obblighi';
import { D1_FONTE, D1_NON_REGGE, D1_PROVA_FRENO, OBBLIGHI_VARIAZIONI } from '@/lib/lift/obblighi-variazioni';
import { makeFmt } from '@/lib/present/tr';
import { d1Di } from '../lift/rapporto';
import { d1Sito } from '../report/cases';
import { altreModifiche } from '../report/modifica-dpr';
import { variazioniDoc } from '../report/variazioni';
import { mancaParte } from '@/components/calc/etichette-parti';
import { fraseVelocita } from '@/components/lift/frasi-libretto';
import appIt from '../../../messages/it.json';

const V = (v = 1, H = 18, x: FormValues = {}): FormValues => ({ ...PRESETS.C, context: 'repl', keepRopes: true, compare: true, v: String(v), H: String(H), ...x });
const C = (parti: Parte[], x: Partial<Collaudo> = {}): Collaudo => ({ norma: '10411-1', parti: ['machine', ...parti], ...x });
const O1 = OBBLIGHI_VARIAZIONI['10411-1'];
const has = (pts: { rif: string; testo: string }[], x: { rif: string; testo: string } | undefined): boolean => !!x && pts.some((p) => p.rif === x.rif && p.testo === x.testo);
const n1 = (c: Collaudo, Vx: FormValues) => altreModifiche(c, false, (p) => p, Vx).find((p) => p.rif.endsWith('n. 1)'));
const riga = (c: Collaudo, Vx: FormValues): string => variazioniDoc(c, Vx).find((x) => x.voce === 'velocita')?.text ?? '';
const fmt = makeFmt('it-IT');

test('la velocità aperta (solo dopo 50 Hz) con «Sì»: la riduzione dichiarata, il DPR n. 1) confermato, mai «contro i documenti»', () => {
  const lib: Libretto = { v50: 1 };
  for (const v of [1, 0.92, 1.03]) {
    const Vx = V(v);
    assert.equal(esitoDocumenti('10411-1', { libretto: lib }, Vx).speed, 'aperta', `v ${v}`);
    const si = C(['speed'], { libretto: lib }), pts = obblighiParti(si, Vx);
    assert.ok(has(pts, O1.speedDown) && !has(pts, O1.speedDocumentati) && !has(pts, O1.speedUp), `v ${v}: ${pts.map((p) => p.rif).join(' | ')}`);
    assert.equal(n1(si, Vx)?.stato, 'confermato', `v ${v}`);
    const r = riga(si, Vx);
    assert.ok(r.includes('vale come riduzione di oltre il 5 % sotto la velocità iniziale (UNI 10411-1, 15.16: punti 15.2 e 15.17)') && !r.includes('comunque'), r);
    // without the logbook's speed, a reduction (15.16) is never said to be within 5 %
    assert.ok(!r.includes('entro il 5 % (UNI 10411-1, 15.1 e 15.16)'), r);
    // answered «No»: nothing of the change
    const no = C([], { libretto: lib });
    assert.ok(!has(obblighiParti(no, Vx), O1.speedDown) && n1(no, Vx) === undefined);
  }
  // with the logbook's speed, a «Sì» within the limits is against the documents: the engineer's point, as before
  const contro = C(['speed'], { libretto: { v: 1, v50: 1 } });
  assert.ok(has(obblighiParti(contro, V(1)), O1.speedDocumentati));
  assert.equal(n1(contro, V(1))?.stato, 'da_verificare');
});

test('uguale alla velocità del libretto ma non a quella dopo 50 Hz: nessun «uguale», i due confronti, la nota del DPR', () => {
  const lib: Libretto = { v: 0.8, v50: 0.95 }, Vx = V(0.8), x = variazioneVelocita('10411-1', lib, 0.8);
  assert.ok(x && !x.variata && !x.uguale);
  assert.deepEqual(x.confronti.map((c) => c.di), ['libretto', '50hz']);
  // the documents still decide «No» (15.1 and 15.16), now with the DPR's caveat in the form, the obligations and the row
  assert.equal(esitoDocumenti('10411-1', { libretto: lib }, Vx).speed, 'no');
  const no = C([], { libretto: lib });
  assert.ok(has(obblighiParti(no, Vx), O1.speedWithin));
  const r = riga(no, Vx);
  assert.ok(r.includes('uguale alla velocità del libretto entro l’arrotondamento dei dati, non a quella dopo il passaggio a 50 Hz') && r.includes('−15,8 %')
    && r.includes('lo valuta il tecnico') && !r.includes('la velocità non cambia'), r);
  const f = fraseVelocita('10411-1', lib, 0.8, fmt);
  assert.equal(f?.key, 'lib_v_tra');
  // a hand «Sì»: DPR n. 1) confirmed (the speed changes from the one the lift runs at)
  assert.equal(n1(C(['speed'], { libretto: lib }), Vx)?.stato, 'confermato');
  // equal to both: «uguale» as before
  const pari = variazioneVelocita('10411-1', { v: 0.95, v50: 0.95 }, 0.95);
  assert.ok(pari?.uguale);
  assert.ok(riga(C([], { libretto: { v: 1 } }), V(1)).endsWith('la velocità non cambia.'));
});

test('D.1 alla prova del freno: il C1 della verifica, i versi di marcia come scelta del software, la fonte', () => {
  const Vx: FormValues = { ...PRESETS.C, context: 'repl', compare: false, k: '0.5', v: '1' }, o = carichiOf(Vx) as Carichi;
  const Cd = collaudoOf(Vx, { norma: '10411-1', parti: ['machine'], documentato: { Q: o.Q, P: o.P - 100, Mcw: o.Mcw } });
  const d = d1Di(Cd, Vx), p = d1Sito(Cd, Vx);
  assert.ok(d && p && d.aLim !== null && d.C1 === d.c1Min, 'the fixture: C1 at the band minimum');
  // round 47 recheck: the outcome in words — met here
  assert.ok(p.testo.includes('nel calcolo è soddisfatta con C1 = 1,150, il minimo della fascia, che equivale a 0,68 m/s² (con a = 0,50 m/s² sarebbe minore)'), p.testo);
  // over the band minimum: C1 with the calculation's a
  const V6: FormValues = { ...Vx, k: '0.45', v: '0.6' }, o6 = carichiOf(V6) as Carichi;
  const C6 = collaudoOf(V6, { norma: '10411-1', parti: ['machine'], documentato: { Q: o6.Q, P: o6.P - 20, Mcw: o6.Mcw } }), d6 = d1Di(C6, V6), p6 = d1Sito(C6, V6);
  assert.ok(d6 && p6 && d6.C1 > d6.c1Min && p6.testo.includes(`C1 = ${fmt(d6.C1, 3)} (a = 0,50 m/s²)`), p6?.testo);
  // the brake test's directions: the software's reading, D.1 gives the loads and where the car stands
  assert.ok(D1_PROVA_FRENO.testo.includes('con i carichi dei due casi della D.1 (1,25·Q e cabina vuota)') && D1_PROVA_FRENO.testo.includes('scelta del software')
    && D1_PROVA_FRENO.testo.includes('non il verso di marcia') && !D1_PROVA_FRENO.testo.includes('come nei due casi della D.1'));
  const { righe } = JSON.parse(readFileSync(new URL('../../../docs/lista-verifica-normativa.json', import.meta.url), 'utf8')) as { righe: { valore: string; fonte: string }[] };
  for (const t of [D1_PROVA_FRENO, D1_NON_REGGE]) {
    assert.equal(t.fonte, D1_FONTE);
    assert.equal(righe.find((r) => r.valore === t.testo)?.fonte, D1_FONTE, t.testo);
  }
});

test('l’elenco di ciò che manca per la -11 chiede la velocità documentata; «entro il 5 %» con la nota del DPR', () => {
  const ti = appIt.calculations.intervento as Record<string, string>, tl = appIt.lift as Record<string, string>;
  const t = (k: string, v: Record<string, string> = {}): string => (ti[k] ?? `?${k}`).replace(/\{(\w+)\}/g, (_, x: string) => v[x] ?? `{${x}}`);
  const l = (k: string): string => tl[k] ?? `?${k}`;
  assert.equal(mancaParte(t, l, 'AMMODERNAMENTO', 'speed', null, '10411-11'), 'Velocità nominale variata: «Sì» o «No», oppure la velocità documentata');
  assert.match(mancaParte(t, l, 'AMMODERNAMENTO', 'speed', null, '10411-1'), /la velocità del libretto \(iniziale o accertata con verbale\)$/);
  assert.match(mancaParte(t, l, 'AMMODERNAMENTO', 'load', null, '10411-11'), /oppure i carichi documentati/);
  assert.ok(tl.lib_v_entro?.endsWith('Se sia un cambio della velocità ai sensi del DPR 162/1999 lo valuta il tecnico.'), tl.lib_v_entro);
  assert.ok(ti.perche_carichi_cabina_arcata?.includes('(UNI 10411, 6.1)') && !ti.perche_carichi_cabina_arcata.includes('22'));
  // the speed after 50 Hz alone, up to 5 % over it: the form says a reduction is not measured
  assert.equal(fraseVelocita('10411-1', { v50: 1 }, 1.03, fmt)?.key, 'lib_v_sotto50');
});
