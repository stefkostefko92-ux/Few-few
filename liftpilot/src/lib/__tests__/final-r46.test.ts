// Round 46 final check: the relazione never calls every part a constructive modification (DPR 162/1999 art. 2 c.1 lett.
// cc)) — the machine replaced is n. 5), with the machine kept the numbered cases among the parts or the engineer's
// confirmation —; a case of the DPR without «da verificare sul testo vigente»; the rated load changed on the documents
// is n. 2) even when the rule does not bring the load; T* = P + Q with both documented roundings under -1; 'load'
// answered by hand with the documented loads unchanged: one point for the engineer, never the prospetti's obligations;
// a design speed above the one after 50 Hz still compared with the logbook's; 15 i) within 5 % under -11; D.1 with the
// deceleration of the band minimum and the limit one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { K, VOCI } from '@/calc/norme';
import { aOfC1 } from '@/calc/d1';
import type { FormValues } from '@/calc/types';
import { collaudoOf, type Collaudo } from '@/lib/lift/collaudo';
import { carichiOf, carichiVariati, variazioneVelocita, type Carichi } from '@/lib/lift/modifica';
import { obblighiParti } from '@/lib/lift/obblighi';
import { d1Di } from '@/lib/lift/rapporto';
import { VOCI_VANO } from '@/shaft/norme';
import { adempimentiBlocks, collaudoRows, collaudoText, riferimentiRows } from '../report/collaudo';
import { d1Blocks, d1Frase } from '../report/cases';
import { makePres } from '../present/tr';
import calcIt from '../../../messages/calc/it.json';
import appIt from '../../../messages/it.json';

const V = (v = 1, x: FormValues = {}): FormValues => ({ ...PRESETS.C, context: 'repl', keepRopes: true, compare: true, v: String(v), H: '18', ...x });
const ora = (): Carichi => {
  const c = carichiOf(V());
  assert.ok(c);
  return c;
};
const items = (C: Collaudo, resta = false, Vx?: FormValues): string[] => adempimentiBlocks(C, true, resta, Vx).flatMap((b) => (b.t === 'list' ? b.items : []));
const cc = (C: Collaudo, resta = false, Vx?: FormValues): string[] => items(C, resta, Vx).filter((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc)'));

test('oggetto dell’ammodernamento: il caso n. 5) della macchina, le altre parti nella sezione degli adempimenti', () => {
  const C: Collaudo = { norma: '10411-1', parti: ['machine', 'alarm', 'ucm', 'ropes'] };
  const t = collaudoText(C, true, undefined, 'AMMODERNAMENTO', V());
  assert.ok(!t.includes('sono modifiche costruttive'), t);
  assert.ok(t.includes('la sostituzione del macchinario ne fa una modifica costruttiva') && t.includes('lettera cc) n. 5))'), t);
  assert.ok(t.includes('nella sezione «Adempimenti e punti da verificare in sito»'), t);
  // the references: the machine n. 5), the other parts by the section — never every part a constructive modification
  const dpr = riferimentiRows(true, C, 'en81-20', false).find((r) => r[0]?.startsWith('DPR 162/1999'))?.[1] ?? '';
  assert.ok(dpr.startsWith('sostituzione del macchinario come modifica costruttiva (art. 2 c.1 lett. cc) n. 5))') && !dpr.includes('altre parti come modifiche'), dpr);
  // the machine alone: no word on the other parts
  assert.ok(!collaudoText({ norma: '10411-1', parti: ['machine'] }, true, undefined, 'AMMODERNAMENTO').includes('altre parti'));
});

test('argano che resta: costruttiva per un caso numerato, altrimenti la conferma il tecnico (oggetto e adempimenti)', () => {
  const solo: Collaudo = { norma: '10411-1', parti: ['alarm', 'ropes'] };
  const t = collaudoText(solo, true, undefined, 'AMMODERNAMENTO', V());
  assert.ok(t.includes('nessuna delle parti sostituite o modificate è un caso numerato già confermato') && t.includes('«altri componenti principali» del n. 5)')
    && t.includes('lo conferma il tecnico'), t);
  const first = cc(solo, true, V())[0] ?? '';
  assert.ok(first.includes('non è il caso n. 5) della sostituzione del macchinario') && first.includes('se la modifica sia costruttiva lo conferma il tecnico'), first);
  assert.ok(!first.includes('la modifica è costruttiva'), first);
  // a controller replaced (n. 5)): constructive by it
  const quadro: Collaudo = { norma: '10411-1', parti: ['controller', 'ropes'] };
  assert.ok(collaudoText(quadro, true, undefined, 'AMMODERNAMENTO', V()).includes('è una modifica costruttiva ai sensi del DPR 162/1999'));
  assert.ok((cc(quadro, true, V())[0] ?? '').includes('la modifica è costruttiva per i casi numerati'));
  // the rated load changed on the documents is a numbered case too
  const portata: Collaudo = collaudoOf(V(1, { Q: 730 }), { norma: '10411-11', parti: ['alarm'], documentato: ora() });
  assert.ok(collaudoText(portata, true, undefined, 'AMMODERNAMENTO', V(1, { Q: 730 })).includes('per i casi numerati'));
});

test('un caso del DPR non porta «da verificare sul testo vigente»; un punto di una norma sì', () => {
  const all = items({ norma: '10411-1', parti: ['machine', 'alarm'], aggiuntive: ['en81-28'] });
  const n5 = all.find((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc) n. 5)')) ?? '';
  assert.ok(n5.endsWith('lo conferma il tecnico nella comunicazione.'), n5);
  assert.ok(all.some((x) => !x.startsWith('DPR') && x.endsWith('(da verificare sul testo vigente).')), 'the standards\' points keep it');
});

test('DPR cc) n. 2): la portata cambiata sui documenti anche se la regola non porta il carico (-11, T* e contrappeso uguali)', () => {
  const doc = { Q: 630, P: 700, Mcw: 1015 }, Vx = V(1, { Q: 730, P: 600, k: '', qeq: 415 });
  const c = carichiOf(Vx);
  assert.ok(c && c.Q === 730 && c.P + c.Q === 1330 && c.Mcw === 1015, JSON.stringify(c));
  const C11 = collaudoOf(Vx, { norma: '10411-11', parti: ['machine'], documentato: doc });
  assert.ok(!C11.parti.includes('load'), 'the rule does not bring the load under -11');
  const n2 = cc(C11, false, Vx).find((x) => x.includes('n. 2)')) ?? '';
  assert.ok(n2.startsWith('DPR 162/1999, art. 2 c.1 lett. cc) n. 2): cambio della portata secondo i carichi documentati') && n2.endsWith('modifica costruttiva.'), n2);
  // under -1 the rule brings it (the ratio): the line of the part as before
  const C1 = collaudoOf(Vx, { norma: '10411-1', parti: ['machine'], documentato: doc });
  assert.ok(C1.parti.includes('load') && cc(C1, false, Vx).some((x) => x.endsWith('n. 2): cambio della portata: modifica costruttiva.')));
});

test('carichiVariati: con la -1 T* = P + Q varia entro i due arrotondamenti; con la -11 come la regola', () => {
  const d = { Q: 630, P: 700, Mcw: 1015 }, poco = { Q: 630.4, P: 700.4, Mcw: 1015.4 };
  assert.equal(carichiVariati('10411-1', d, poco), false, 'Q and P each within its rounding');
  assert.equal(carichiVariati('10411-1', d, { ...d, P: 701.2 }), true, 'P past both');
  assert.equal(carichiVariati('10411-11', d, poco), true, 'under -11 the rule brings it (T* +0,8 kg)');
  // whenever the rule brings the load, the static loads changed (no «invariati» against the rule)
  assert.equal(carichiVariati('10411-1', d, { Q: 629.6, P: 699.6, Mcw: 1015 }), true, 'T* −0,8 kg: the rule\'s decrease');
  // through the relazione: 'load' by hand with Q and P within their roundings — the loads unchanged, for the engineer
  const Vx = V(1, { Q: 630.4, P: 700.4, k: '', qeq: 315 }), C = collaudoOf(Vx, { norma: '10411-1', parti: ['machine', 'load'], documentato: d });
  const n2 = cc(C, false, Vx).find((x) => x.includes('n. 2)')) ?? '';
  assert.ok(n2.includes('portata indicata come variata, ma i carichi documentati') && !cc(C, false, Vx).some((x) => x.includes('carichi statici variati')), n2);
});

test('carico «Sì» a mano con i carichi documentati invariati: un punto per il tecnico, mai i prospetti superati', () => {
  for (const norma of ['10411-1', '10411-11'] as const) {
    const C = collaudoOf(V(), { norma, parti: ['machine', 'car', 'load'], documentato: ora() });
    const ob = obblighiParti(C, V()), load = ob.filter((p) => p.rif.startsWith(`UNI ${norma}:2024, 6.`));
    assert.deepEqual(load.map((p) => [p.rif, p.stato]), [[`UNI ${norma}:2024, 6.1`, 'da_verificare']], JSON.stringify(load));
    assert.ok(load[0]?.testo.startsWith('carichi indicati come variati, ma secondo i carichi documentati'), load[0]?.testo);
    // without the documented loads: the increases, as before
    const nodoc = obblighiParti(collaudoOf(V(), { norma, parti: ['machine', 'load'] }), V()).map((p) => p.rif);
    assert.ok(nodoc.some((r) => r.startsWith(`UNI ${norma}:2024, 6.1`) && r !== `UNI ${norma}:2024, 6.1`), nodoc.join(' | '));
  }
});

test('velocità sopra quella dopo 50 Hz entro il 5 %: anche la differenza dal libretto (0,956 e 0,99 m/s)', () => {
  const lib = { v: 0.8, v50: 0.95 };
  for (const v of [0.956, 0.97, 0.99]) {
    const x = variazioneVelocita('10411-1', lib, v);
    assert.equal(x?.variata, false);
    assert.deepEqual(x?.confronti.map((c) => c.di), ['libretto', '50hz'], `${v}`);
  }
  assert.deepEqual(variazioneVelocita('10411-1', lib, 1)?.confronti.map((c) => c.di), ['50hz'], 'over 5 %: the increase against the reference');
  const Vx = V(0.99), C = collaudoOf(Vx, { norma: '10411-1', parti: ['machine', 'controller'], libretto: lib });
  const row = Object.fromEntries(collaudoRows(C, true, carichiOf(Vx), Vx))['Velocità documentata · variazione'] ?? '';
  assert.match(row, /\+23,\d % rispetto a 0,80 m\/s \(libretto\) e \+4,2 % rispetto a 0,95 m\/s \(dopo 50 Hz\): sopra la velocità del libretto e sopra quella dopo il passaggio a 50 Hz/, row);
  assert.ok(row.includes('ai sensi del DPR 162/1999 lo valuta il tecnico') && !row.startsWith('tra la'), row);
  // the form's notes: both references named, no «entro il 5 %» against the logbook
  const L = appIt.lift as Record<string, string>;
  assert.ok(L.lib_v_tra?.includes('la maggiore delle due') && L.lib_v_tra.includes('DPR 162/1999') && !L.lib_v_tra.includes('→ entro il 5 %'), L.lib_v_tra);
  const avviso = JSON.stringify(appIt).match(/"avviso_velocita_entro5":"([^"]+)"/)?.[1] ?? '';
  assert.ok(avviso.includes('la maggiore tra quella del libretto e quella dopo il passaggio a 50 Hz') && !avviso.includes('riferimento del libretto'), avviso);
});

test('-11: velocità variata entro il 5 %, la protezione UCM dove la 5.6.7 era già applicata (15 i))', () => {
  const C = collaudoOf(V(1.03), { norma: '10411-11', parti: ['machine', 'controller'], libretto: { v: 1 } });
  const row = Object.fromEntries(collaudoRows(C, true, carichiOf(V(1.03)), V(1.03)))['Velocità documentata · variazione'] ?? '';
  assert.ok(row.includes('entro il 5 % la protezione UCM della UNI EN 81-20, 5.6.7 serve dove la 5.6.7 era già applicata (15 i)): lo conferma il tecnico'), row);
  const over = collaudoOf(V(1.2), { norma: '10411-11', parti: ['machine', 'controller'], libretto: { v: 1 } });
  assert.ok((Object.fromEntries(collaudoRows(over, true, carichiOf(V(1.2)), V(1.2)))['Velocità documentata · variazione'] ?? '').includes('oltre il 5 % serve la protezione UCM'));
});

test('D.1 nella relazione: la decelerazione del C1 minimo e quella limite, l’esito come prima', () => {
  const Vx = V(1), C = collaudoOf(Vx, { norma: '10411-1', parti: ['machine'], documentato: { ...ora(), P: ora().P + 60, Mcw: ora().Mcw + 20 } });
  const d = d1Di(C, Vx);
  assert.ok(d && d.aLim !== null);
  const f = d1Frase(C, Vx);
  assert.ok(f.includes('il C1 minimo della fascia, 1,15, equivale a una decelerazione di 0,68 m/s²'), f);
  assert.ok(f.includes(`regge fino a una decelerazione di frenatura di ${d.aLim.toFixed(2).replace('.', ',')} m/s², da confrontare con quella misurata alla prova del freno`), f);
  const note = d1Blocks(makePres(calcIt, 'it-IT'), C, Vx).flatMap((b) => (b.t === 'p' ? [b.text] : [])).join(' ');
  assert.ok(note.includes('il minimo della fascia, che equivale a una decelerazione di 0,68 m/s²') && note.includes('Regge fino a C1 = '), note);
  assert.ok(note.includes('può confrontarla con quella misurata alla prova del freno'), note);
  // the registry: the four decelerations of the bands, the limit one; the check's entry points to it
  const nota = VOCI.find((v) => v.id === 'modifica.d1')?.nota ?? '';
  const quattro = K.c1Bands.map(([, c]) => aOfC1(c).toFixed(2).replace('.', ',')).join(' / ');
  assert.ok(quattro === '0,47 / 0,68 / 0,89 / 1,09' && nota.includes(`${quattro} m/s²`) && nota.includes('può confrontare con la decelerazione misurata alla prova del freno'), nota);
  assert.ok((VOCI_VANO.find((v) => v.id === 'rapporto.d1')?.nota ?? '').includes('quella limite fino a cui la condizione regge'));
});

test('argano che resta: la verifica straordinaria solo se la modifica è costruttiva (riferimenti)', () => {
  const C: Collaudo = { norma: '10411-1', parti: ['alarm', 'ropes'] };
  const dpr = riferimentiRows(true, C, 'en81-20', false, true).find((r) => r[0]?.startsWith('DPR 162/1999'))?.[1] ?? '';
  assert.ok(dpr.includes('verifica straordinaria (art. 14) se la modifica è costruttiva') && !dpr.includes('della modifica costruttiva'), dpr);
});
