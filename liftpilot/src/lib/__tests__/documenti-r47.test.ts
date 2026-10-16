// Round 47, owner's decision D1: the documents of the existing lift decide the changes of speed, load and travel both
// ways. A change they show none of starts answered «No» («dai documenti», derived, never stored) and stays the user's to
// change; a change they bring stays the rule's locked «Sì» (round 46); one they do not decide, or none documented, stays
// to answer, the list of what is missing naming what is needed. A «Sì» against the documents keeps the engineer's lines
// (speedDocumentati, travelDocumentati, DPR n. 1) / n. 3) to confirm, the rows say so); a new car on unchanged
// documented loads, its mass to confirm (loadCabinaNuova).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { readInputs } from '@/calc/inputs';
import type { FormValues } from '@/calc/types';
import { calcMissing } from '@/lib/calc-blank';
import { PARTI, PARTI_FACOLTATIVE, collaudoOf, interventoTo, rifacimentoTo, type Collaudo, type Parte } from '@/lib/lift';
import { carichiOf, esitoDocumenti, variazioniDi, type Carichi, type Libretto, type Norma10411 } from '@/lib/lift/modifica';
import { obblighiParti } from '@/lib/lift/obblighi';
import { OBBLIGHI_VARIAZIONI } from '@/lib/lift/obblighi-variazioni';
import { daIndicare, dalDocumento, effettiva, esitoParte, rispondi, risposteDopo, risposteIniziali, risposteRifacimento } from '@/lib/lift/risposte';
import { altreModifiche } from '../report/modifica-dpr';
import { variazioniDoc } from '../report/variazioni';
import { etichettaParte, mancaParte } from '@/components/calc/etichette-parti';
import appIt from '../../../messages/it.json';

const V = (v = 1, H = 18, x: FormValues = {}): FormValues => ({ ...PRESETS.C, context: 'repl', keepRopes: true, compare: true, v: String(v), H: String(H), ...x });
const ora = (x: FormValues = {}): Carichi => {
  const c = carichiOf(V(1, 18, x));
  assert.ok(c);
  return c;
};
const C = (parti: Collaudo['parti'], x: Partial<Collaudo> = {}): Collaudo => ({ norma: '10411-1', parti, ...x });
const ASKED = PARTI.filter((p) => !PARTI_FACOLTATIVE.includes(p));
const VAR = ['speed', 'load', 'travel'] as const;
const speed = (n: Norma10411, lib: Libretto, v: number) => esitoDocumenti(n, { libretto: lib }, V(v)).speed;

test('la velocità dai documenti: UNI 10411-1 entro 15.1 e 15.16 con la velocità del libretto, -11 uguale entro l’arrotondamento', () => {
  // -1 with the logbook's speed: within ±5 % «No», past it the rule's «Sì»
  assert.deepEqual([1, 1.03, 1.05, 0.96, 0.95].map((v) => speed('10411-1', { v: 1 }, v)), ['no', 'no', 'no', 'no', 'no']);
  assert.deepEqual([1.06, 0.94].map((v) => speed('10411-1', { v: 1 }, v)), ['si', 'si']);
  // the logbook's speed and the one after 50 Hz: between them no change by UNI 10411-1 (15.1 from the higher)
  assert.equal(speed('10411-1', { v: 0.8, v50: 0.95 }, 0.95), 'no');
  assert.equal(speed('10411-1', { v: 0.8, v50: 0.95 }, 0.99), 'no');
  assert.equal(speed('10411-1', { v: 0.8, v50: 0.95 }, 1.0), 'si', '+5,26 % over the one after 50 Hz');
  // the one after 50 Hz alone: a decrease (15.16) cannot be measured — not decided; an increase over 5 % still is
  assert.deepEqual([0.97, 0.9, 0.95].map((v) => speed('10411-1', { v50: 0.95 }, v)), ['aperta', 'aperta', 'aperta']);
  assert.equal(speed('10411-1', { v50: 0.95 }, 1.01), 'si');
  // -11: any change past 0,005 m/s
  assert.deepEqual([1, 1.004, 0.996].map((v) => speed('10411-11', { v: 1 }, v)), ['no', 'no', 'no']);
  assert.deepEqual([1.006, 0.994, 1.03].map((v) => speed('10411-11', { v: 1 }, v)), ['si', 'si', 'si']);
  // nothing documented for the speed (under -11 the one after 50 Hz is not its): null
  assert.equal(speed('10411-11', { v50: 1 }, 1), null);
  assert.equal(speed('10411-1', { H: 18 }, 1), null);
  // the calculation's speed not entered: waiting for it
  assert.equal(esitoDocumenti('10411-1', { libretto: { v: 1 } }, V(1, 18, { v: '' })).speed, 'attesa');
});

test('la corsa e i carichi dai documenti: uguali «No», l’accorciamento è una variazione, la portata cambiata non si decide', () => {
  const travel = (n: Norma10411, H: number): ReturnType<typeof esitoDocumenti>['travel'] => esitoDocumenti(n, { libretto: { H: 18 } }, V(1, H)).travel;
  for (const n of ['10411-1', '10411-11'] as const) {
    assert.deepEqual([18, 18.05, 17.95].map((H) => travel(n, H)), ['no', 'no', 'no'], n);
    assert.deepEqual([18.06, 17, 30].map((H) => travel(n, H)), ['si', 'si', 'si'], `${n}: lengthened, shortened (DPR cc) n. 3))`);
  }
  assert.equal(esitoDocumenti('10411-1', { libretto: { H: 18 } }, V(1, 18, { H: '' })).travel, 'attesa');
  const load = (n: Norma10411, doc: Carichi, x: FormValues = {}) => esitoDocumenti(n, { documentato: doc }, V(1, 18, x)).load;
  // the documented loads the design's: «No» under both parts
  assert.equal(load('10411-1', ora()), 'no');
  assert.equal(load('10411-11', ora()), 'no');
  // beyond prospetto 1: the rule's «Sì»
  assert.equal(load('10411-1', ora(), { Q: 730 }), 'si');
  // the rated load changed with T* and the counterweight the same (a measured balance): not decided by the documents
  const bilanciato = ora({ qeq: 315 });
  assert.equal(load('10411-11', bilanciato, { Q: 730, P: 600, qeq: 415 }), 'aperta');
  // under -1 the counterweight 0,6 kg heavier with the ratio kept: the static loads changed within the prospetti, open
  assert.equal(load('10411-1', bilanciato, { qeq: 315.6 }), 'aperta');
  // the calculation's loads not entered: waiting; nothing documented: null
  assert.equal(load('10411-1', ora(), { Q: '' }), 'attesa');
  assert.equal(esitoDocumenti('10411-1', {}, V()).load, null);
});

const rng = (seed: number) => (): number => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('3000 casi: «Sì» dai documenti è esattamente la variazione della regola (variazioniDi), «No» mai una variazione', () => {
  const r = rng(47), pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)] as T;
  const libs: (Libretto | undefined)[] = [undefined, { v: 1 }, { v50: 0.95, H: 21 }, { v: 0.8, v50: 0.95, H: 18 }, { H: 18 }, { v: 1.6, H: 40.5 }];
  const docs: (Carichi | undefined)[] = [undefined, { Q: 630, P: 700, Mcw: 1015 }, { Q: 600, P: 700, Mcw: 1000 }, { Q: 630, P: 650, Mcw: 1015 }];
  for (let i = 0; i < 3000; i++) {
    const n = pick(['10411-1', '10411-11'] as const), doc = { libretto: pick(libs), documentato: pick(docs) };
    const Vx = V(Math.round((0.7 + r() * 1.2) * 100) / 100, Math.round((15 + r() * 8) * 100) / 100, r() < 0.3 ? { Q: pick([600, 630, 660, 700]) } : {});
    const e = esitoDocumenti(n, doc, Vx), d = variazioniDi(n, doc, Vx);
    for (const p of VAR) assert.equal(e[p] === 'si', d[p], `${p} ${n} ${JSON.stringify(doc)} v=${Vx.v} H=${Vx.H} Q=${Vx.Q}`);
  }
});

test('da indicare: senza documenti le tre, con i documenti che non mostrano variazioni nessuna; in attesa del valore del calcolo, nemmeno', () => {
  const amm = C(['machine']), Vx = V(1.03, 18);
  const value = (c: Collaudo, x: FormValues = Vx): Collaudo => collaudoOf(x, effettiva('AMMODERNAMENTO', c, x));
  assert.deepEqual(daIndicare('AMMODERNAMENTO', amm, value(amm), Vx, ['machine']), ASKED.filter((p) => p !== 'machine'));
  const doc = C(['machine'], { libretto: { v: 1, H: 18 }, documentato: ora() });
  const left = daIndicare('AMMODERNAMENTO', doc, value(doc), Vx, ['machine']);
  assert.ok(VAR.every((p) => !left.includes(p)), left.join());
  assert.ok(VAR.every((p) => dalDocumento('AMMODERNAMENTO', value(doc), Vx, p)), 'each a «No» from the documents');
  // the documents past the limits: the rule's locked «Sì», not to answer either, never a «No»
  const oltre = V(1.06, 19);
  assert.ok(!daIndicare('AMMODERNAMENTO', doc, value(doc, oltre), oltre, ['machine']).some((p) => (VAR as readonly Parte[]).includes(p)));
  assert.ok(!dalDocumento('AMMODERNAMENTO', value(doc, oltre), oltre, 'speed') && value(doc, oltre).parti.includes('speed'));
  // the calculation's speed and travel not entered: they wait for them, and those are in the list of what is missing
  const vuoto = V(1, 18, { v: '', H: '' });
  const attesa = daIndicare('AMMODERNAMENTO', doc, value(doc, vuoto), vuoto, ['machine']);
  assert.ok(!attesa.includes('speed') && !attesa.includes('travel'), attesa.join());
  const missing = calcMissing(vuoto, readInputs(vuoto).bad, 'AMMODERNAMENTO', attesa);
  assert.ok(missing.includes('v') && missing.includes('H'), missing.join());
  // «Solo argano» and the transformation: untouched (the documents bring no pre-answer there)
  assert.deepEqual(daIndicare('SOLO_ARGANO', doc, value(doc), Vx, []), ['ropes']);
  assert.ok(VAR.every((p) => esitoParte('SOLO_ARGANO', value(doc), Vx, p) === null && esitoParte('TRASFORMAZIONE_COMPLETA', value(doc), Vx, p) === null));
  // other parts never
  assert.equal(esitoParte('AMMODERNAMENTO', value(doc), Vx, 'car'), null);
});

test('la risposta dell’utente: «Sì» contro i documenti resta, «No» esplicito uguale al «No» dai documenti; il test salvato è lo stesso', () => {
  const doc = C(['machine'], { libretto: { v: 1, H: 18 }, documentato: ora() }), Vx = V(1.03, 18);
  const pre = collaudoOf(Vx, effettiva('AMMODERNAMENTO', doc, Vx));
  const esplicito = collaudoOf(Vx, effettiva('AMMODERNAMENTO', VAR.reduce((c, p) => rispondi(c, p, false), doc), Vx));
  assert.deepEqual(pre, esplicito, 'the record is what the user confirms: nothing new stored');
  assert.ok(VAR.every((p) => !pre.parti.includes(p)));
  // a hand «Sì» on the speed: among the parts, still answered, the documents' «No» no longer applies to the answer
  const si = rispondi(doc, 'speed', true), conSi = collaudoOf(Vx, effettiva('AMMODERNAMENTO', si, Vx));
  assert.ok(conSi.parti.includes('speed'));
  assert.ok(!daIndicare('AMMODERNAMENTO', si, conSi, Vx, ['machine', 'speed']).includes('speed'));
  assert.ok(dalDocumento('AMMODERNAMENTO', conSi, Vx, 'speed'), 'the documents still say «No»: the row says «contro i documenti»');
});

test('Rifacimento con un clic: le parti fisiche risposte, velocità, portata e corsa seguono i documenti', () => {
  const doc = C(['machine'], { libretto: { v: 1, H: 18 }, documentato: ora() }), Vx = V();
  const on = rifacimentoTo(true, doc).collaudo, risposte = risposteRifacimento(true, ['machine']);
  const value = collaudoOf(Vx, effettiva('AMMODERNAMENTO', on, Vx));
  assert.deepEqual(daIndicare('AMMODERNAMENTO', on, value, Vx, risposte), [], 'nothing left: the three from the documents');
  // without documents the three stay to answer
  const senza = rifacimentoTo(true, C(['machine'])).collaudo, v2 = collaudoOf(Vx, effettiva('AMMODERNAMENTO', senza, Vx));
  assert.deepEqual(daIndicare('AMMODERNAMENTO', senza, v2, Vx, risposte), ['speed', 'load', 'travel']);
  // with the travel lengthened on the logbook: the travel the rule's «Sì», speed and load «No» from the documents
  const lungo = V(1, 21), v3 = collaudoOf(lungo, effettiva('AMMODERNAMENTO', on, lungo));
  assert.ok(v3.parti.includes('travel') && !v3.parti.includes('speed') && !v3.parti.includes('load'));
  assert.deepEqual(daIndicare('AMMODERNAMENTO', on, v3, lungo, risposte), []);
});

test('cambio di tipo, risposta sulla marcatura CE, bozza e «Nuovo calcolo da questi dati»: la risposta dai documenti si ricalcola', () => {
  const doc = C(['machine', 'ropes'], { libretto: { v: 1, H: 18 }, documentato: ora() }), Vx = V(1.03);
  // a «Solo argano» and back: the documents kept, the answers of the parts both show, the three from the documents again
  const solo = interventoTo('SOLO_ARGANO', doc).collaudo, back = interventoTo('AMMODERNAMENTO', solo).collaudo;
  assert.deepEqual(back.libretto, doc.libretto);
  const risposte = risposteDopo('AMMODERNAMENTO', risposteDopo('SOLO_ARGANO', ['machine', 'ropes']));
  const value = collaudoOf(Vx, effettiva('AMMODERNAMENTO', back, Vx));
  assert.ok(VAR.every((p) => !daIndicare('AMMODERNAMENTO', back, value, Vx, risposte).includes(p)));
  // the CE answer turns -1 into -11: +3 % is no change for 15.1, any change for 15 — the «No» becomes the rule's «Sì»
  const uno = collaudoOf(Vx, effettiva('AMMODERNAMENTO', { ...doc, marcatura: 'no' }, Vx));
  const undici = collaudoOf(Vx, effettiva('AMMODERNAMENTO', { ...doc, marcatura: 'si' }, Vx));
  assert.equal(esitoParte('AMMODERNAMENTO', uno, Vx, 'speed'), 'no');
  assert.equal(esitoParte('AMMODERNAMENTO', undici, Vx, 'speed'), 'si');
  assert.ok(undici.parti.includes('speed') && !uno.parti.includes('speed'));
  // a draft (its answers as typed) and a record opened again (every part answered: its «No» kept, the mark beside it)
  assert.deepEqual(risposteIniziali('AMMODERNAMENTO', doc, true), ASKED);
  // a record of before round 45: only its «Sì» answered — the three come from the documents, not still to answer
  const vecchio = risposteIniziali('AMMODERNAMENTO', doc, false);
  assert.deepEqual(vecchio, ['machine', 'ropes']);
  assert.ok(VAR.every((p) => !daIndicare('AMMODERNAMENTO', doc, uno, Vx, vecchio).includes(p)));
});

test('«Sì» contro i documenti: i punti per il tecnico, il DPR da confermare, la riga lo dice', () => {
  const lib = { v: 1, H: 18 }, si = (n: Norma10411, parti: Parte[], v = 1, H = 18) => ({ C: C(['machine', ...parti], { norma: n, libretto: lib }), Vx: V(v, H) });
  const has = (pts: { rif: string; testo: string }[], x: { rif: string; testo: string } | undefined): boolean => !!x && pts.some((p) => p.rif === x.rif && p.testo === x.testo);
  for (const n of ['10411-1', '10411-11'] as const) {
    const O = OBBLIGHI_VARIAZIONI[n];
    const a = si(n, ['speed', 'travel'], 1.004, 18.02), pts = obblighiParti(a.C, a.Vx);
    assert.ok(has(pts, O.speedDocumentati) && has(pts, O.travelDocumentati), n);
    assert.ok(!has(pts, O.speedUp) && !has(pts, O.travelUp) && !has(pts, O.speedUcm), `${n}: never the cases of a change the documents do not show`);
    // DPR 162/1999 cc) n. 1) and n. 3): equal within the rounding — the engineer confirms
    const cc = altreModifiche(a.C, false, (p) => p, a.Vx);
    assert.deepEqual(cc.filter((p) => /n\. [13]\)$/.test(p.rif)).map((p) => p.stato), ['da_verificare', 'da_verificare'], n);
    // the rows: the change answered by hand, for the engineer; sheet 1's sentence unchanged ('')
    const rows = variazioniDoc(a.C, a.Vx);
    assert.ok(rows.every((x) => x.text.includes('indicata comunque come variata nell’intervento') && x.nota === ''), JSON.stringify(rows));
    assert.ok(variazioniDoc({ norma: n, libretto: lib }, a.Vx).every((x) => !x.text.includes('indicata comunque')), 'answered «No»: as before');
    // without documents the hand's «Sì»: the increases, as before
    assert.ok(has(obblighiParti(C(['machine', 'speed'], { norma: n }), a.Vx), O.speedUp));
  }
  // -1 within 5 % but not equal: a real change of the number — DPR n. 1) stays confirmed (the article has no tolerance)
  const b = si('10411-1', ['speed'], 1.03);
  assert.equal(altreModifiche(b.C, false, (p) => p, b.Vx).find((p) => p.rif.endsWith('n. 1)'))?.stato, 'confermato');
  assert.ok(has(obblighiParti(b.C, b.Vx), OBBLIGHI_VARIAZIONI['10411-1'].speedDocumentati));
  // the one after 50 Hz alone, a hand «Sì» within the limits: the engineer's point, never 15.1–15.15 as if increased
  const c50 = { C: C(['machine', 'speed'], { libretto: { v50: 0.95 } }), Vx: V(0.92) };
  assert.ok(has(obblighiParti(c50.C, c50.Vx), OBBLIGHI_VARIAZIONI['10411-1'].speedDocumentati));
});

test('cabina nuova sui carichi documentati uguali: P da confermare; senza cabina nuova nessun punto', () => {
  for (const n of ['10411-1', '10411-11'] as const) {
    const pts = obblighiParti(C(['machine', 'car', 'sling'], { norma: n, documentato: ora() }), V());
    assert.ok(pts.some((p) => p.testo === OBBLIGHI_VARIAZIONI[n].loadCabinaNuova?.testo), n);
    assert.ok(!obblighiParti(C(['machine', 'controller'], { norma: n, documentato: ora() }), V()).some((p) => p.testo === OBBLIGHI_VARIAZIONI[n].loadCabinaNuova?.testo));
    // the loads changed on the documents: not this point (the rule's cases, or the part to answer)
    assert.ok(!obblighiParti(C(['machine', 'car'], { norma: n, documentato: ora() }), V(1, 18, { Q: 730 })).some((p) => p.testo === OBBLIGHI_VARIAZIONI[n].loadCabinaNuova?.testo));
  }
});

test('l’elenco di ciò che manca dice che cosa serve: il dato dei documenti o «Sì»/«No»', () => {
  const ti = appIt.calculations.intervento as Record<string, string>, tl = appIt.lift as Record<string, string>;
  const t = (k: string, v: Record<string, string> = {}): string => (ti[k] ?? `?${k}`).replace(/\{(\w+)\}/g, (_, x: string) => v[x] ?? `{${x}}`);
  const l = (k: string): string => tl[k] ?? `?${k}`;
  assert.match(mancaParte(t, l, 'AMMODERNAMENTO', 'speed', null, '10411-1'), /^Velocità nominale variata: «Sì» o «No», oppure la velocità del libretto/);
  assert.match(mancaParte(t, l, 'AMMODERNAMENTO', 'load', null, '10411-1'), /oppure i carichi documentati/);
  assert.match(mancaParte(t, l, 'AMMODERNAMENTO', 'travel', null, '10411-1'), /la corsa del primo collaudo/);
  assert.match(mancaParte(t, l, 'AMMODERNAMENTO', 'travel', null, '10411-11'), /la corsa documentata$/);
  assert.equal(mancaParte(t, l, 'AMMODERNAMENTO', 'load', 'aperta', '10411-1'), 'Portata variata: «Sì» o «No» (i documenti non lo decidono)');
  // any other part, or another type: its name, as the row's
  assert.equal(mancaParte(t, l, 'AMMODERNAMENTO', 'car', null, '10411-1'), etichettaParte(t, l, 'AMMODERNAMENTO', 'car'));
  assert.equal(mancaParte(t, l, 'SOLO_ARGANO', 'ropes', null, '10411-1'), t('funi'));
  for (const k of ['doc_no', 'contro_doc', 'perche_carichi_uguali', 'perche_carichi_cabina', 'perche_carichi_aperta', 'perche_portata_aperta', 'perche_velocita_aperta',
    'attesa_speed', 'attesa_travel', 'attesa_load']) assert.ok(ti[k], k);
});
