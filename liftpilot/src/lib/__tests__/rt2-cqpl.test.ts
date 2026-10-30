// The pages «Quadro di manovra», «Cabina», «Limitatore di velocità» and «Porte» of the RT after the owner's model (round
// 52): the model's sheets recomputed by LibreOffice on its own file give the same numbers and texts where no correction
// applies (the literals below: inputs set on the sheets, values read back); each correction is shown on a case where
// the model is wrong; the pages carry the key sentences and the outcomes; the fields' schemas, the registry, the
// differences and the «?» texts are complete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conProposte, conValore, schemaDati } from '@/lib/rt2/campi';
import { PARACADUTI } from '@/lib/rt2/cataloghi/cqpl';
import { caricoModello, ingressoModello, type CaricoModelloIn } from '@/lib/rt2/componenti/cabina-carichi';
import { CABINA } from '@/lib/rt2/componenti/cabina';
import { LIMITATORE } from '@/lib/rt2/componenti/limitatore';
import { limitatoreDi, vMaxModello } from '@/lib/rt2/componenti/limitatore-calcolo';
import { PORTE } from '@/lib/rt2/componenti/porte';
import { QUADRO } from '@/lib/rt2/componenti/quadro';
import { DIFFERENZE_CQPL } from '@/lib/rt2/differenze-cqpl';
import { K_CQPL, VOCI_CQPL } from '@/lib/rt2/norme-cqpl';
import type { FBlock } from '@/lib/report/rt2/model';
import type { ContestoRt2, DatiRt2, ModuloRt2 } from '@/lib/rt2/types';
import { ctxDi } from './rt2-fixtures';

const near = (a: number | null | undefined, b: number, msg: string, rel = 1e-9): void =>
  assert.ok(typeof a === 'number' && Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);
const P = { titolo: 'Documentazione tecnica relativa alla modifica', norma: 'UNI 10411-1:2024' };
const MODULI: readonly ModuloRt2[] = [QUADRO, CABINA, LIMITATORE, PORTE];

/** The module's result and page on the inputs with its proposals, the page's text and its value lines. */
function run(m: ModuloRt2, ctx: ContestoRt2, x0: DatiRt2) {
  const x = conProposte(x0, m.proposte?.(ctx)), e = m.calcola(ctx, x), blocks = m.pagine(ctx, x, e, P);
  const righe = blocks.flatMap((b: FBlock) => (b.t === 'sez' ? b.righe : []));
  const testo = blocks.flatMap((b: FBlock) => (b.t === 'sez' ? b.righe.map((r) => (r.t === 'testo' ? r.s : `${r.l} ${r.sym ?? ''} ${r.v} ${r.u ?? ''}`)) : b.t === 'testo' ? [b.s] : []));
  return { x, e, blocks, righe, testo: testo.join('\n'), esito: (id: string) => e.verifiche.find((v) => v.id === id)?.esito };
}

// Cabina!O71:O82 by LibreOffice: [inputs, R73, R74, O73, O74, O78, O79, O81, O82]
const CAB: [string, CaricoModelloIn, number[]][] = [
  ['A 1:1', { qOld: 480, qNew: 480, pOld: 600, pNew: 650, hOld: 20, hNew: 20, nNew: 3, mNew: 0.34, nOld: 4, mOld: 0.39, ctNew: 1, ctOld: 1, ctOldRaw: 1, kLocOld: 1 },
    [31.200000000000003, 20.400000000000002, 10900.872000000001, 11285.424, 3.527717782577391, 0, 721.9200000000002, 499.68000000000006]],
  ['B 1:2', { qOld: 480, qNew: 480, pOld: 600, pNew: 650, hOld: 20, hNew: 20, nNew: 3, mNew: 0.34, nOld: 4, mOld: 0.39, ctNew: 2, ctOld: 2, ctOldRaw: 2, kLocOld: 1 },
    [31.200000000000003, 20.400000000000002, 5450.436000000001, 5642.712, 3.527717782577391, 0, 721.9200000000002, 507.3600000000001]],
  ['C basso', { qOld: 630, qNew: 700, pOld: 900, pNew: 950, hOld: 25, hNew: 25, nNew: 4, mNew: 0.34, nOld: 4, mOld: 0.34, ctNew: 1, ctOld: 1, ctOldRaw: 1, kLocOld: 2 },
    [34, 34, 15342.84, 16520.04, 7.672634271099748, 11.11111111111111, 989.8000000000002, 673.6000000000001]],
  ['D 1:1→1:2', { qOld: 400, qNew: 450, pOld: 500, pNew: 620, hOld: 18, hNew: 20, nNew: 3, mNew: 0.42, nOld: 3, mOld: 0.5, ctNew: 2, ctOld: 1, ctOldRaw: 1, kLocOld: 1 },
    [27, 25.200000000000003, 9093.87, 5371.956, -40.9277238403452, 12.5, 544.5, 359.1000000000001]],
  ['E 1:4', { qOld: 1000, qNew: 1000, pOld: 1200, pNew: 1500, hOld: 40, hNew: 40, nNew: 6, mNew: 0.49, nOld: 5, mOld: 0.42, ctNew: 4, ctOld: 4, ctOldRaw: 4, kLocOld: 1 },
    [84, 117.60000000000001, 5601.51, 6419.664, 14.605954465849377, 0, 1394.8000000000002, 812]],
];

test('rt2-cqpl: Cabina — le formule del modello (LibreOffice) sui suoi dati', () => {
  for (const [n, i, [R73, R74, O73, O74, O78, O79, O81, O82]] of CAB) {
    const o = caricoModello(i);
    near(o.pfOld, R73, `${n} R73`); near(o.pfNew, R74, `${n} R74`); near(o.Told, O73, `${n} O73`); near(o.Tnew, O74, `${n} O74`);
    near(o.varT, O78, `${n} O78`); near(o.varQ, O79, `${n} O79`); near(o.incrT, O78 / 100, `${n} U10`); near(o.pMax, O81, `${n} O81`); near(o.pMin, O82, `${n} O82`);
  }
});

const DOC = { Q: 630, P: 900, Mcw: 1215 };
test('rt2-cqpl: Cabina — correzioni: T* = P + Q, funi e carichi preesistenti vuoti, punti, dichiarazione', () => {
  // E-C1: ropes 4 × 0,22 → 4 × 0,34 kg/m and P 900 → 1050: the model's T grows by 10,31 % (> 10 %: «Non rientrando…»),
  // T* = P + Q by (1680 − 1530)/1530 = 9,80 %: within prospetto 1 (Q > 500 kg: 10 %)
  const c1 = ctxDi({ V: { P: '1050' }, collaudo: { parti: ['car'], documentato: DOC } });
  const r1 = run(CABINA, c1, { funiPreesNumero: 4, funiPreesMassa: 0.22, paracadute: '3' });
  near(r1.e.valori.varTModello as number, ((630 + 1050 + 27.2) - (630 + 900 + 17.6)) / (630 + 900 + 17.6) * 100, 'T del modello');
  assert.ok((r1.e.valori.varTModello as number) > 10);
  near(r1.e.valori.dT as number, 150 / 1530 * 100, 'ΔT*');
  assert.ok(r1.testo.includes('rientra nella tolleranza del 10%') && !r1.testo.includes('Non rientrando'), 'T* entro il prospetto 1');
  // E-C7: Pmax = 1,10·1530 − 630, Pmin = 1530 − 630 (the model: 0,9/1,1 with the ropes by the machine room's index)
  near(r1.e.valori.pMax as number, 1.1 * 1530 - 630, 'Pmax'); near(r1.e.valori.pMin as number, 900, 'Pmin');
  // E-C2/E-C3/E-C4: the old ropes empty are the new ones (the model: 0), nothing documented is the same as after (the model: 0 → #DIV/0!)
  const c2 = ctxDi({ collaudo: { parti: ['car'] } }), i2 = ingressoModello(c2, {});
  assert.ok(i2);
  assert.deepEqual([i2.nOld, i2.mOld, i2.qOld, i2.pOld], [4, 0.34, 630, 900]);
  near(caricoModello(i2).varT, 0, 'T invariata');
  // E-C10/E-C11/E-C12: the rated load 630 → 700 kg (+11,1 % > 5 %): points 6.3–6.12 and 6.15, never «10411.4», no building declaration
  const c3 = ctxDi({ V: { Q: '700' }, collaudo: { parti: ['car'], documentato: DOC } }), r3 = run(CABINA, c3, { paracadute: '3' });
  assert.ok(r3.testo.includes('Non rientrando nella tolleranza del 5% della portata preesistente'));
  assert.ok(r3.testo.includes('punti da 6.3 a 6.12 e 6.15') && !r3.testo.includes('10411.4') && !r3.testo.includes('6.4, 6.5, 6.6'));
  assert.ok(!r3.testo.includes('Si dichiara che la variazione') && r3.testo.includes('idoneità statica'));
  assert.ok(r3.e.avvisi.includes('ATTENZIONE, PORTATA ECCEDE 5%'), 'E-C8');
  // E-C1: a decrease of T* (P 900 → 800) brings the buffers and the progressive gear (the model: within, nothing to do)
  const r4 = run(CABINA, ctxDi({ V: { P: '800' }, collaudo: { parti: ['car'], documentato: DOC } }), { paracadute: '3' });
  assert.ok(r4.testo.includes('sono diminuiti') && !r4.testo.includes('Pertanto non si rende necessario'));
  // E-C22: the car that stays is not described as new
  const r5 = run(CABINA, ctxDi(), {});
  assert.ok(r5.testo.includes('La cabina preesistente resta in opera.') && !r5.testo.includes('La nuova cabina'));
});

test('rt2-cqpl: Cabina — superficie, capienza e tipo di paracadute (E-C21, E-C23)', () => {
  const ctx = ctxDi({ collaudo: { parti: ['car', 'safetyGear'] }, tecnici: { dopo: { superficie: 1.66, capienza: 8 } } });
  const r = run(CABINA, ctx, { paracadute: '2' });
  assert.equal(r.esito('cabina.superficie'), 'ok'); assert.equal(r.esito('cabina.capienza'), 'ok');
  // an instantaneous gear at 1 m/s (instantaneous up to 0,63 m/s), with the gear replaced: not met
  assert.equal(r.esito('cabina.paracadute'), 'fail');
  assert.equal(run(CABINA, ctx, { paracadute: '3' }).esito('cabina.paracadute'), undefined, 'progressivo: nessun limite');
  const big = run(CABINA, ctxDi({ collaudo: { parti: ['car'] }, tecnici: { dopo: { superficie: 1.9, capienza: 8 } } }), { paracadute: '3' });
  assert.equal(big.esito('cabina.superficie'), 'fail');
  assert.ok(big.testo.includes('confrontate con quanto') && !big.testo.includes('sono conformi con quanto'));
});

// Limitatore!H65:H90 by LibreOffice: [name, S72, S88, v, TABELLE!B71, d, Fad, FRm, x, Dmin, H81, H87, H90]
const LIM: [string, string, string, number, string, number, number, number, number, number, number, number, number][] = [
  ['A', '1', '5', 0.6, '2', 7, 1292, 25400, 19.659442724458206, 210, 42.857142857142854, 0.69, 1],
  ['B', '2', '1', 0.5, '1', 6, 300, 21100, 70.33333333333333, 180, 42.5, 0.575, 0.8],
  ['C', '4', '6', 1.0, '3', 8, 1233, 33200, 26.92619626926196, 240, 25, 1.15, 1.5],
  ['D', '5', '2', 0.8, '3', 7, 1766, 29420, 16.65911664779162, 210, 35.714285714285715, 0.9199999999999999, 1.5],
  ['E', '6', '4', 0.63, '2', 6, 1668, 18700, 11.211031175059953, 180, 50, 0.7244999999999999, 1],
];

test('rt2-cqpl: Limitatore — le formule del modello (LibreOffice) sui suoi dati', () => {
  for (const [n, tipo, fune, v, par, d, Fad, FRm, x, Dmin, H81, H87, H90] of LIM) {
    const p = PARACADUTI.find((g) => g.v === par) ?? null, o = limitatoreDi(ctxDi({ V: { v: String(v) } }), { tipo, fune, paracadute: par }, p);
    near(o.d, d, `${n} H65`); near(o.Fad, Fad, `${n} H73`); near(o.FRm, FRm, `${n} H75`); near(o.x, x, `${n} H77`); near(o.Dmin, Dmin, `${n} H79`);
    near(o.rapportoD, H81, `${n} H81`); near(o.vMin, H87, `${n} H87`); near(o.vMaxModello, H90, `${n} H90`); near(o.vMax, H90, `${n} norma`);
    assert.equal(o.formazione, '6 * ( 9 + 9 + 1 ) + AT = 114 fili'); assert.equal(o.trefoli, 6);
  }
  // S96 = 1,25·(v + 0,25/v) at the model's speeds
  for (const [v, S96] of [[0.6, 1.2708333333333333], [0.8, 1.390625], [1, 1.5625], [0.63, 1.2835317460317461], [1.6, 2.1953125]]) near(vMaxModello(PARACADUTI[3], v), S96, `S96 ${v}`);
  // the model's texts by the regime (D91) and the ratio (J81: C under 30)
  const C = run(LIMITATORE, ctxDi({ anagrafica: { legge: 'dm_587_1987' } }), { tipo: '4', fune: '6', paracadute: '3', vScatto: 1.3, forzaPresa: 300 });
  assert.ok(C.testo.includes('rispetto al paragrafo 5.6.2.2.1.1 punti a) b) c) d)') && C.testo.includes('NO, diametro carrucola non corretto'));
  assert.ok(C.testo.includes('della norma UNI EN 81.20 : 2020'), 'E-L9');
  const A = run(LIMITATORE, ctxDi({ V: { v: '0.6' } }), { paracadute: '2', vScatto: 0.75, forzaPresa: 300 });
  assert.ok(A.testo.includes('UNI EN 81.20 : 2020 punto 5.6.2.2.1.1') && A.testo.includes('=> 30') && A.testo.includes('Preformata'));
});

test('rt2-cqpl: Limitatore — correzioni', () => {
  // E-L1: v 1,6 m/s, progressive gear: 1,25·1,6 + 0,25/1,6 = 2,15625 (the model 2,1953125; with «<= 1 m/s» chosen 1,5)
  const v16 = ctxDi({ V: { v: '1.6' }, collaudo: { parti: ['governor'] } });
  near(limitatoreDi(v16, { tipo: '3', fune: '5' }, PARACADUTI[3]).vMax, 2.15625, 'E-L1');
  near(limitatoreDi(v16, { tipo: '3', fune: '5' }, PARACADUTI[2]).vMax, 2.15625, 'E-L1 fascia');
  // E-L3/E-L4: «altro» governor (sheave 240 mm) and rope (8 mm): D/d = 30 (the model: W72 = 0, H81 #VALUE!); x = 30000/600 = 50 as the model
  const altro = { tipo: '7', altroForza: 600, altroDiametro: 240, fune: '7', funeDiametro: 8, funeTrefoli: 6, funeFormazione: '8x19', funeRottura: 30000 };
  const g = limitatoreDi(ctxDi(), altro, PARACADUTI[2]);
  near(g.rapportoD, 30, 'E-L3'); near(g.x, 50, 'H77'); near(g.Dmin, 240, 'H79');
  // E-L7: the plate tripping speed in [1,15·v, limit): v 1, progressive ≤ 1 m/s → [1,15; 1,5)
  const gov = ctxDi({ collaudo: { parti: ['governor'] } }), base = { tipo: '2', fune: '1', paracadute: '3', forzaPresa: 100 };
  assert.equal(run(LIMITATORE, gov, { ...base, vScatto: 1.2 }).esito('limitatore.scatto'), 'ok');
  assert.equal(run(LIMITATORE, gov, { ...base, vScatto: 1.5 }).esito('limitatore.scatto'), 'fail');
  assert.equal(run(LIMITATORE, gov, { ...base, vScatto: 1.1 }).esito('limitatore.scatto'), 'fail');
  // E-L2: PFB R3 (300 N) against a gear needing 200 N: 2 × 200 = 400 N > 300 N, not met; 100 N: max(200, 300) = 300 N, met
  assert.equal(run(LIMITATORE, gov, { ...base, vScatto: 1.2, forzaPresa: 200 }).esito('limitatore.forza'), 'fail');
  assert.equal(run(LIMITATORE, gov, { ...base, vScatto: 1.2 }).esito('limitatore.forza'), 'ok');
  // E-L5: the rope without a breaking load is not offered; E-L11: no «senza»
  assert.ok(!schemaDati(LIMITATORE.campi).safeParse({ fune: '3' }).success && !schemaDati(LIMITATORE.campi).safeParse({ paracadute: '5' }).success);
  // E-L13: an existing governor is not certified as installed
  const kept = run(LIMITATORE, ctxDi(), base);
  assert.ok(kept.testo.includes('esistente resta in opera') && !kept.testo.includes('dichiarazione CE'));
  assert.equal(kept.esito('limitatore.scatto'), 'info');
});

test('rt2-cqpl: Quadro — testi del modello e tensioni (E-Q7, E-Q9, E-Q10)', () => {
  const nuovo = ctxDi({ collaudo: { parti: ['controller'] } });
  const a = run(QUADRO, nuovo, { tensioneManovra: 110 });
  assert.ok(a.testo.includes('Universale a pulsanti') && a.testo.includes('Durante il movimento della cabina, per non meno di 4 secondi dopo la'));
  assert.ok(a.testo.includes('fermata della cabina e dopo la chiusura delle porte') && a.testo.includes('sono conformi alla normativa UNI EN 81-20 : 2020'));
  assert.ok(a.testo.includes('Il nuovo quadro di manovra è conforme alla norma UNI EN 81-20 : 2020') && a.testo.includes('380 V   50 Hz'));
  const b = run(QUADRO, nuovo, { tipoManovra: '3', tensioneManovra: 300, frequenzaManovra: 'cc', contattiAccessibili: true, tensioneContatti: 48, correnteContatti: 'cc' });
  assert.ok(b.testo.includes('Simplex - Prenotazione salita/discesa') && b.testo.includes('Non esiste; manovra con prenotazione'));
  assert.equal(b.esito('quadro.tensioneManovra'), 'fail'); assert.equal(b.esito('quadro.contattiSerrature'), 'ok', '48 V c.c. ≤ 50 V');
  // the contacts' own voltage and current, never the control voltage's (norm expert's answer 5): 48 V c.c. of control,
  // the chain 42 V without its current said → the a.c. limit 25 V
  assert.equal(run(QUADRO, nuovo, { tensioneManovra: 48, frequenzaManovra: 'cc', contattiAccessibili: true, tensioneContatti: 42 }).esito('quadro.contattiSerrature'), 'fail', '42 V c.a. > 25 V');
  assert.equal(run(QUADRO, nuovo, { tensioneManovra: 48, contattiAccessibili: true, tensioneContatti: 24 }).esito('quadro.contattiSerrature'), 'ok', '24 V c.a. ≤ 25 V');
  assert.ok(QUADRO.calcola(nuovo, { tensioneManovra: 48, contattiAccessibili: true }).mancanti.includes('tensioneContatti'), 'tensione ai contatti richiesta');
  const esistente = run(QUADRO, ctxDi(), { tensioneManovra: 300 });
  assert.equal(esistente.esito('quadro.tensioneManovra'), 'info'); assert.ok(!esistente.testo.includes('del nuovo'));
});

test('rt2-cqpl: Porte — testi del modello (LibreOffice) e correzioni', () => {
  const ctx = ctxDi({ collaudo: { parti: ['carDoors', 'landingDoors'] } }), nuove = { fuocoEsistente: '1', altezzaEsistenti: 2000, altezzaNuove: 2000 };
  const a = run(PORTE, ctx, nuove);
  for (const s of ['La nuova porta di cabina è realizzata in lamiera d\'acciaio. L\'apertura è', 'scorrevole orizzontale ad ante multiple azionate da un motore elettrico.',
    '230 V   50 Hz.', 'La spinta e l\'energia cinetica delle porte in chiusura sono non maggiori dei', 'Le nuove porte di piano sono realizzate in lamiera d\'acciaio e sono del tipo',
    'ad ante scorrevoli orizzontali', 'Nella sezione allegati sono contenuti i certificati delle serrature in oggetto', 'Nessuna']) assert.ok(a.testo.includes(s), s);
  const b = run(PORTE, ctx, { ...nuove, tipoPortaCabina: '2', tensioneOperatore: 24, frequenzaOperatore: 'cc', tipoPortePiano: '4', protezioneFuoco: '4' });
  for (const s of ['La porta è azionata da un motore elettrico.', '24 V   c.c.', 'Le porte sono azionate da motori elettrici.', 'REI 120\'',
    'Nella sezione allegati sono contenuti i certificati di resistenza al fuoco.']) assert.ok(b.testo.includes(s), s);
  // E-P1/E-P2/E-P3: car door that stays, manual car door, landing doors that stay
  const c = run(PORTE, ctxDi(), {});
  assert.ok(c.testo.includes('preesistente') && !c.testo.includes('La spinta') && !c.testo.includes('serrature in oggetto'));
  assert.ok(run(PORTE, ctx, { ...nuove, tipoPortaCabina: '3' }).testo.includes('nessun motore'));
  // E-P6: EI 120' existing, EI 60' new: lower, not met; E-P7: 1950 under 2000 above the existing 1900 attention, 1850 under it not met
  assert.equal(run(PORTE, ctx, { ...nuove, fuocoEsistente: '3', protezioneFuoco: '2' }).esito('porte.fuoco'), 'fail');
  assert.equal(run(PORTE, ctx, { ...nuove, altezzaEsistenti: 1900, altezzaNuove: 1950 }).esito('porte.altezza'), 'warn');
  assert.equal(run(PORTE, ctx, { ...nuove, altezzaEsistenti: 1900, altezzaNuove: 1850 }).esito('porte.altezza'), 'fail');
  assert.equal(a.esito('porte.altezza'), 'ok');
});

test('rt2-cqpl: pagine senza testi rotti, esiti sulle righe delle verifiche', () => {
  const ctx = ctxDi({ collaudo: { parti: ['controller', 'car', 'governor', 'landingDoors', 'carDoors', 'safetyGear'], documentato: DOC }, tecnici: { dopo: { superficie: 1.66, capienza: 8 } } });
  const dati: Record<string, DatiRt2> = { quadro: { tensioneManovra: 48 }, cabina: { paracadute: '3' }, limitatore: { paracadute: '3', vScatto: 1.3, forzaPresa: 300, limiteOrigine: 1.4, fonteOrigine: 'DM 587/1987, art. 8' },
    porte: { fuocoEsistente: '1', altezzaEsistenti: 2000, altezzaNuove: 2000 } };
  for (const m of MODULI) {
    const r = run(m, ctx, dati[m.id] ?? {});
    assert.deepEqual(r.blocks.slice(0, 2).map((b) => b.t), ['pagina', 'titolo'], m.id);
    assert.ok(!/undefined|NaN|\[object/.test(JSON.stringify(r.blocks)), `${m.id}: testo rotto`);
    assert.deepEqual(r.e.mancanti, [], `${m.id}: ${r.e.mancanti.join(', ')}`);
    for (const v of r.e.verifiche.filter((k) => k.esito !== 'info')) {
      assert.ok(r.righe.some((k) => k.t === 'val' && k.esito === v.esito), `${m.id}: ${v.id} senza esito sulla pagina`);
    }
  }
  assert.ok(run(LIMITATORE, ctx, dati.limitatore).righe.some((k) => k.t === 'val' && k.l === 'Coefficiente di sicurezza:' && k.esito === 'ok'));
  // a new governor under UNI 10411-1: the limit of the rule at the installation with its source (18, 15.17; norm expert's
  // answer 8), not met over it; none with a governor that stays and the speed as documented
  const oltre = run(LIMITATORE, ctx, { ...dati.limitatore, limiteOrigine: 1.25 });
  assert.equal(oltre.esito('limitatore.origine'), 'fail');
  assert.ok(oltre.testo.includes('(DM 587/1987, art. 8)'));
  assert.equal(run(LIMITATORE, ctxDi(), { paracadute: '3', vScatto: 1.3 }).esito('limitatore.origine'), undefined);
});

test('rt2-cqpl: campi — lo schema accetta un dato completo e rifiuta uno fuori campo', () => {
  const pieni: Record<string, DatiRt2> = {
    quadro: { tipoManovra: '2', tensioneForzaMotrice: 400, tensioneLuce: 230, tensioneManovra: 48, frequenzaManovra: 'cc', tensioneOperatore: 230, frequenzaOperatore: '50', contattiAccessibili: true, tensioneContatti: 24, correnteContatti: 'cc' },
    cabina: { funiPreesNumero: 4, funiPreesMassa: 0.39, paracadute: '4' },
    limitatore: { tipo: '7', altroForza: 600, altroDiametro: 240, fune: '7', funeDiametro: 8, funeTrefoli: 6, funeFormazione: '6x19', funeRottura: 30000, paracadute: '3', vScatto: 1.2, forzaPresa: 250, limiteOrigine: 1.4, fonteOrigine: 'DM 587/1987' },
    porte: { tipoPortaCabina: '1', tensioneOperatore: 230, frequenzaOperatore: '50', tipoPortePiano: '1', protezioneFuoco: '2', fuocoEsistente: '2', altezzaEsistenti: 2000, altezzaNuove: 2000 },
  };
  const fuori: Record<string, DatiRt2> = { quadro: { tensioneManovra: 5000 }, cabina: { funiPreesNumero: 2.5 }, limitatore: { vScatto: 50 }, porte: { altezzaNuove: 900 } };
  for (const m of MODULI) {
    const s = schemaDati(m.campi);
    assert.ok(s.safeParse(pieni[m.id]).success, `${m.id}: dato completo`);
    assert.equal(Object.keys(pieni[m.id] ?? {}).length, m.campi.filter(conValore).length, `${m.id}: ogni campo nel dato completo`);
    assert.ok(!s.safeParse(fuori[m.id]).success && !s.safeParse({ estraneo: 1 }).success, `${m.id}: fuori campo`);
  }
});

test('rt2-cqpl: registro, differenze e testi «?» completi', () => {
  const it = (x: number): string => String(x).replace('.', ',');
  for (const k of Object.keys(K_CQPL) as (keyof typeof K_CQPL)[]) {
    const v = VOCI_CQPL.find((x) => x.costanti?.includes(k));
    assert.ok(v && v.valore.includes(it(K_CQPL[k])), `costante ${k}`);
  }
  const ctx = ctxDi({ collaudo: { parti: ['controller', 'car', 'governor', 'landingDoors'], documentato: DOC }, tecnici: { dopo: { superficie: 2, capienza: 8 } } });
  const ids = new Set(VOCI_CQPL.flatMap((v) => v.verifiche ?? []));
  const x: Record<string, DatiRt2> = { quadro: { tensioneManovra: 48 }, cabina: { paracadute: '1' }, limitatore: { paracadute: '3' }, porte: { fuocoEsistente: '1' } };
  for (const m of MODULI) for (const v of m.calcola(ctx, conProposte(x[m.id] ?? {}, m.proposte?.(ctx))).verifiche) assert.ok(ids.has(v.id), `verifica ${v.id} senza voce`);
  for (const v of VOCI_CQPL) assert.ok(!/undefined|NaN|\[object/.test(`${v.titolo} ${v.valore} ${v.riferimento} ${v.nota ?? ''}`), v.id);
  assert.equal(new Set(DIFFERENZE_CQPL.map((d) => d.id)).size, DIFFERENZE_CQPL.length, 'differenze uniche');
  for (const d of DIFFERENZE_CQPL) assert.ok(d.modello.length > 10 && d.correzione.length > 3 && /^E-[CQLP]\d+$/.test(d.id), d.id);
  const aiuto = JSON.parse(readFileSync(new URL('../../../messages/aiuto/rt-cqpl.json', import.meta.url), 'utf8')) as Record<string, string>;
  const chiavi = MODULI.flatMap((m) => m.campi.filter(conValore).map((c) => `${m.id}.${c.id}`));
  assert.deepEqual(chiavi.filter((k) => !aiuto[k]), [], '«?» mancanti');
  assert.deepEqual(Object.keys(aiuto).filter((k) => !chiavi.includes(k)), [], '«?» senza campo');
  for (const [k, s] of Object.entries(aiuto)) assert.ok(s.length <= 400, `${k}: ${s.length}`);
});

test('rt2-cqpl: correzioni minori — riga del prospetto, sospensione prima, refusi, elenchi, dati condivisi', () => {
  // E-C13/E-C9: 520 → 480 kg with T* +10,7 %: the model takes the row of the new 480 kg (15 %: within), the stricter
  // row of the documented 520 kg is 10 %: beyond, and the screen says so
  const r = run(CABINA, ctxDi({ V: { Q: '480', P: '760' }, collaudo: { parti: ['car'], documentato: { Q: 520, P: 600, Mcw: 860 } } }), { paracadute: '3' });
  assert.ok(r.testo.includes('Non rientrando nella tolleranza del 10% del carico statico T*'));
  assert.ok(r.e.avvisi.includes('Servono le verifiche di calcolo secondo la UNI 10411.1'));
  // E-C20: the roping before from the first page (the model kept its default 1:1)
  assert.equal(ingressoModello(ctxDi({ tecnici: { prima: { r: 2 } } }), {})?.ctOld, 2);
  // E-C18: the typos fixed
  const n = run(CABINA, ctxDi({ collaudo: { parti: ['car'] } }), { paracadute: '3' });
  assert.ok(n.testo.includes('realizzata in lamiera') && !n.testo.includes('il lamiera') && !n.testo.includes('Superfice'));
  // E-Q2, E-L10: required, no default; E-Q3, E-Q6, E-P5: the lists without blank items
  assert.ok(run(QUADRO, ctxDi(), {}).e.mancanti.includes('tensioneManovra') && run(LIMITATORE, ctxDi(), {}).e.mancanti.includes('paracadute'));
  const opz = (m: ModuloRt2, id: string): string[] => m.campi.flatMap((c) => (c.id === id && c.t === 'scelta' ? c.opzioni.map((o) => `${o.v}:${o.t}`) : []));
  assert.deepEqual(opz(QUADRO, 'frequenzaManovra'), ['50:50', 'cc:c.c.']);
  assert.deepEqual(opz(QUADRO, 'tipoManovra').map((o) => o.split(':')[0]), ['1', '2', '3', '4', '5']);
  assert.deepEqual(opz(PORTE, 'protezioneFuoco'), ['1:Nessuna', '2:EI 60\'', '3:EI 120\'', '4:REI 120\'']);
  assert.ok(opz(PORTE, 'tipoPortaCabina').includes('4:preesistente/i'));
  // E-L12: the label's typo fixed
  assert.ok(LIMITATORE.campi.some((c) => c.id === 'funeRottura' && c.label === 'Carico di rottura:'));
  // E-Q8/E-P4: the door operator's voltage and frequency under the same ids on both pages; the car's gear on Cabina and Limitatore
  const ids = (m: ModuloRt2): string[] => m.campi.map((c) => c.id);
  for (const id of ['tensioneOperatore', 'frequenzaOperatore']) assert.ok(ids(QUADRO).includes(id) && ids(PORTE).includes(id), id);
  assert.ok(ids(CABINA).includes('paracadute') && ids(LIMITATORE).includes('paracadute'));
});
