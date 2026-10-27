// The buffer pages of the RT after the owner's model (round 52): the model's sheets «Amm. a molla cabina/CWT» and «Amm.
// idraulici cabina/CWT» recomputed by LibreOffice on its own file (inputs and results below as literals) give the same
// numbers where no correction applies (relative 1e-9); each correction is shown on a case where the model is wrong
// (hand-computed); the pages carry the model's sentences and the outcomes; the form's schema; the registry and the list
// of the differences.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schemaDati } from '@/lib/rt2/campi';
import { AMM_CABINA, AMM_CWT } from '@/lib/rt2/componenti/ammortizzatori';
import { corsaMinIdraulico } from '@/lib/rt2/componenti/amm-calcolo';
import { DIFFERENZE_AMM } from '@/lib/rt2/differenze-amm';
import { K_AMM, VOCI_AMM } from '@/lib/rt2/norme-amm';
import type { ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2 } from '@/lib/rt2/types';
import { ctxDi } from './rt2-fixtures';

const near = (a: unknown, b: number, rel = 1e-9, msg = ''): void => {
  assert.equal(typeof a, 'number', `${msg}: ${String(a)} non è un numero`);
  assert.ok(Math.abs((a as number) - b) <= rel * Math.max(1, Math.abs(b)), `${msg}: ${String(a)} ≠ ${b}`);
};
const base = ctxDi();
const ctxCon = (d: Partial<ContestoRt2['dopo']>): ContestoRt2 => ({ ...base, dopo: { ...base.dopo, ...d } });
const esito = (e: EsitoRt2, nome: string): string | undefined => e.verifiche.find((v) => v.id.endsWith(`.${nome}`))?.esito;
const P0 = { titolo: 'Documentazione tecnica relativa alla modifica su impianto ascensore preesistente non conforme alla Direttiva Ascensori', norma: 'UNI 10411-1:2024' };

interface Gold { nome: string; m: ModuloRt2; dopo: Partial<ContestoRt2['dopo']>; x: DatiRt2; atteso: Record<string, number>; ok: [boolean, boolean] }
// «Amm. a molla …» I56 Ftot, I66 p, I68 i, I70 vc, I72 f, I74 fmin, I80 Fadm, I82 Fris, I84 ratio; AV4 and AV12 «OK» or not
const MOLLE: Gold[] = [
  { nome: 'cabina A8 (esempio della specifica)', m: AMM_CABINA, dopo: { Q: 480, P: 600, v: 0.6 }, x: { tipo: 'molla', na: 2, springModel: 'A8' }, ok: [true, true],
    atteso: { Ftot: 10594.800000000001, p: 28.774193548387096, i: 7.75, vc: 0.6, f: 78.54999999999998, fmin: 48.6, Fadm: 20391.267225302414, Fris: 5297.400000000001, rapporto: 3.849297244931931 } },
  { nome: 'cabina B3', m: AMM_CABINA, dopo: { Q: 630, P: 900, v: 0.63 }, x: { tipo: 'molla', na: 2, springModel: 'B3' }, ok: [true, false],
    atteso: { Ftot: 15009.300000000001, p: 25, i: 7.5, f: 71.25, fmin: 53.581500000000005, Fadm: 11645.902559448601, Fris: 7504.650000000001, rapporto: 1.5518248765030482 } },
  { nome: 'cabina altro', m: AMM_CABINA, dopo: { Q: 320, P: 450, v: 0.5 }, ok: [true, true],
    x: { tipo: 'molla', na: 2, springModel: 'altro', springDm: 75, springWire: 15, springL0: 300, springPitch: 25, springG: 78500 },
    atteso: { Ftot: 7553.700000000001, i: 11.1, f: 101.85, fmin: 33.75, Fadm: 10804.358108108108, Fris: 3776.8500000000004, rapporto: 2.8606796955420806 } },
  { nome: 'cabina A3, 4 ammortizzatori', m: AMM_CABINA, dopo: { Q: 1000, P: 1200, v: 1 }, x: { tipo: 'molla', na: 4, springModel: 'A3' }, ok: [false, false],
    atteso: { Ftot: 21582, p: 30.21, i: 9.500165508109896, f: 127.7970870572658, fmin: 135, Fadm: 11579.264337094872, Fris: 5395.5, rapporto: 2.1460966244268134 } },
  { nome: 'cabina B9 (AM 0003)', m: AMM_CABINA, dopo: { Q: 400, P: 500, v: 0.8 }, x: { tipo: 'molla', na: 2, springModel: 'B9' }, ok: [false, false],
    atteso: { Ftot: 8829, p: 23.90829694323144, i: 9.16, f: 84.93599999999998, fmin: 86.40000000000002, Fadm: 9765.918530721065, Fris: 4414.5, rapporto: 2.2122366135963447 } },
  { nome: 'contrappeso A5', m: AMM_CWT, dopo: { Mcw: 1215, v: 0.7 }, x: { tipo: 'molla', na: 1, springModel: 'A5' }, ok: [true, false],
    atteso: { Ftot: 11919.150000000001, p: 22.594594594594593, i: 9.25, f: 73.54999999999998, fmin: 66.14999999999999, Fadm: 8374.477317968296, Fris: 11919.150000000001, rapporto: 0.7026069239810133 } },
  { nome: 'contrappeso B7', m: AMM_CWT, dopo: { Mcw: 900, v: 1 }, x: { tipo: 'molla', na: 2, springModel: 'B7' }, ok: [true, true],
    atteso: { Ftot: 8829, p: 29.285714285714285, i: 10.5, f: 141.75, fmin: 135, Fadm: 13601.825552846733, Fris: 4414.5, rapporto: 3.0811701331626984 } },
  { nome: 'contrappeso altro', m: AMM_CWT, dopo: { Mcw: 1500, v: 0.8 }, ok: [true, false],
    x: { tipo: 'molla', na: 2, springModel: 'altro', springDm: 80, springWire: 16, springL0: 260, springPitch: 28, springG: 78500 },
    atteso: { Ftot: 14715, i: 8.428571428571429, f: 95.65714285714284, fmin: 86.40000000000002, Fadm: 14254.535593220337, Fris: 7357.5, rapporto: 1.9374156429793186 } },
  { nome: 'contrappeso A12', m: AMM_CWT, dopo: { Mcw: 2400, v: 0.9 }, x: { tipo: 'molla', na: 2, springModel: 'A12' }, ok: [true, false],
    atteso: { Ftot: 23544, p: 29.107692307692307, i: 16.25, f: 160.25, fmin: 109.35000000000001, Fadm: 19840.12490985577, Fris: 11772, rapporto: 1.6853656906095626 } },
];

test('rt2-amm: le molle del modello (LibreOffice), cabina e contrappeso', () => {
  for (const g of MOLLE) {
    const e = g.m.calcola(ctxCon(g.dopo), g.x);
    for (const [k, v] of Object.entries(g.atteso)) near(e.valori[k], v, 1e-9, `${g.nome} ${k}`);
    assert.equal(esito(e, 'mollaCorsa') === 'ok', g.ok[0], `${g.nome}: corsa`);
    assert.equal(esito(e, 'mollaCarichi') === 'ok', g.ok[1], `${g.nome}: carichi`);
    assert.deepEqual(e.mancanti, [], g.nome);
  }
});

// «Amm. idraulici …» with «SENZA»: I58 Ftot, I62 Fris, I66 f, I70 fmin, F72; AV4 «OK» in every case
const IDR: { nome: string; m: ModuloRt2; dopo: Partial<ContestoRt2['dopo']>; x: DatiRt2; atteso: Record<string, number> }[] = [
  { nome: 'cabina 150510', m: AMM_CABINA, dopo: { Q: 630, P: 900, v: 1.6 }, x: { tipo: 'idraulici', na: 2, hydrModel: '150510', hydrSlowdown: 'senza' },
    atteso: { Ftot: 15009.300000000001, Fris: 7504.650000000001, vc: 1.6, f: 180, fmin: 172.54400000000004 } },
  { nome: 'cabina 150520', m: AMM_CABINA, dopo: { Q: 1000, P: 1300, v: 2 }, x: { tipo: 'idraulici', na: 2, hydrModel: '150520', hydrSlowdown: 'senza' },
    atteso: { Ftot: 22563, Fris: 11281.5, f: 280, fmin: 269.6 } },
  { nome: 'cabina altro', m: AMM_CABINA, dopo: { Q: 480, P: 650, v: 1 }, x: { tipo: 'idraulici', na: 2, hydrModel: 'altro', hydrStroke: 100, hydrSlowdown: 'senza', certVUrto: 1.2, certMassaMin: 300, certMassaMax: 1000 },
    atteso: { Ftot: 11085.300000000001, Fris: 5542.650000000001, f: 100, fmin: 67.4 } },
  { nome: 'contrappeso 150510', m: AMM_CWT, dopo: { Mcw: 1215, v: 1.6 }, x: { tipo: 'idraulici', na: 1, hydrModel: '150510', hydrSlowdown: 'senza' },
    atteso: { Ftot: 11919.150000000001, Fris: 11919.150000000001, f: 180, fmin: 172.54400000000004 } },
  { nome: 'contrappeso altro', m: AMM_CWT, dopo: { Mcw: 2000, v: 2 }, x: { tipo: 'idraulici', na: 2, hydrModel: 'altro', hydrStroke: 300, hydrSlowdown: 'senza', certVUrto: 2.5, certMassaMin: 500, certMassaMax: 1500 },
    atteso: { Ftot: 19620, Fris: 9810, f: 300, fmin: 269.6 } },
  { nome: 'contrappeso 150520', m: AMM_CWT, dopo: { Mcw: 1500, v: 1.75 }, x: { tipo: 'idraulici', na: 2, hydrModel: '150520', hydrSlowdown: 'senza' },
    atteso: { Ftot: 14715, Fris: 7357.5, f: 280, fmin: 206.41250000000002 } },
];

test('rt2-amm: gli idraulici del modello (LibreOffice) senza rallentamento', () => {
  for (const g of IDR) {
    const e = g.m.calcola(ctxCon(g.dopo), g.x);
    for (const [k, v] of Object.entries(g.atteso)) near(e.valori[k], v, 1e-9, `${g.nome} ${k}`);
    assert.equal(e.valori.fminTesto, '0,0674 x vc^2', g.nome);
    assert.equal(esito(e, 'idrCorsa'), 'ok', g.nome);
    assert.deepEqual(e.mancanti, [], g.nome);
  }
});

test('rt2-amm: correzioni delle molle (S1, S2, S4, S6, X1, X3)', () => {
  // S4: with VVVF and 0,8 m/s after 0,6 before the model checks at 0,6 (LibreOffice: vc 0,6, «OK»); the rated speed
  // after is 0,8: fmin = 135·0,64 = 86,4 mm > f = 78,55 mm
  const s4 = AMM_CABINA.calcola(ctxCon({ Q: 480, P: 600, v: 0.8, azionamento: 'vvvf' }), { tipo: 'molla', na: 2, springModel: 'A8' });
  near(s4.valori.vc, 0.8, 1e-12, 'S4 vc');
  assert.equal(esito(s4, 'mollaCorsa'), 'fail');
  // X3: RC01714 at 1,02 m/s: f = 141,75 ≥ 135·1,02² = 140,45 (the model «OK»), over 1 m/s for a spring
  const x3 = AMM_CWT.calcola(ctxCon({ Mcw: 900, v: 1.02 }), { tipo: 'molla', na: 2, springModel: 'B7' });
  assert.equal(esito(x3, 'mollaCorsa'), 'ok');
  assert.equal(esito(x3, 'mollaVelocita'), 'fail');
  // S1 and S2: d 10, L0 185, p 17 → i = 10, f = 185 − 10·12 = 65 mm exactly (the model: f > 65 → «NO!»); D 50, G 80000
  // → Fadm = 65·80000·10⁴/(8·50³·10) = 5200 N; the counterweight 1300/9,81 kg on one buffer → ratio 4 (the model «NO!»)
  const molla = { tipo: 'molla', na: 1, springModel: 'altro', springDm: 50, springWire: 10, springL0: 185, springPitch: 17, springG: 80000 };
  const s12 = AMM_CWT.calcola(ctxCon({ Mcw: 1300 / 9.81, v: 0.5 }), molla);
  near(s12.valori.f, 65, 1e-12, 'S1 f');
  near(s12.valori.rapporto, 4, 1e-12, 'S2 ratio');
  assert.equal(esito(s12, 'mollaCorsa'), 'ok');
  assert.equal(esito(s12, 'mollaCarichi'), 'ok');
  assert.equal(esito(AMM_CWT.calcola(ctxCon({ Mcw: 2080 / 9.81, v: 0.5 }), molla), 'mollaCarichi'), 'ok', 'S2 ratio 2,5');
  // S6: «78.026» with 15,25 coils: f = 153,375 mm, Fadm = 11842,56 N; car 400 + 620 kg on 2 → Fris = 5003,1 N: ratio
  // 2,367 < 2,5 (with the model's 14,25: Fadm 14037,04 N, ratio 2,806 «OK»)
  const s6 = AMM_CABINA.calcola(ctxCon({ Q: 400, P: 620, v: 0.8 }), { tipo: 'molla', na: 2, springModel: 'A10' });
  near(s6.valori.i, 15.25, 1e-12, 'S6 i');
  near(s6.valori.f, 153.375, 1e-9, 'S6 f');
  near(s6.valori.Fadm, 11842.561475409831, 1e-9, 'S6 Fadm');
  assert.equal(esito(s6, 'mollaCarichi'), 'fail');
  // X1: no speed (or 0) — the model takes 0 and passes; here missing and not met
  for (const v of [null, 0]) {
    const x1 = AMM_CABINA.calcola(ctxCon({ Q: 480, P: 600, v }), { tipo: 'molla', na: 2, springModel: 'A9' });
    assert.ok(x1.mancanti.includes('calcolo.velocita'));
    assert.equal(esito(x1, 'mollaCorsa'), 'fail');
  }
});

test('rt2-amm: correzioni degli idraulici (H1, H2, H3, H4)', () => {
  // H1: no number of buffers entered (the model: #DIV/0!) → the proposal, 2 under the car
  const h1 = AMM_CABINA.calcola(ctxCon({ Q: 630, P: 900, v: 1.6 }), { tipo: 'idraulici', hydrModel: '150510' });
  near(h1.valori.Fris, 7504.650000000001, 1e-9, 'H1 Fris');
  assert.equal(h1.valori.rallentamento, 'SENZA', 'H2: proposta SENZA');
  // H2: «CON» at 1,6 m/s: the model 0,5·172,544 = 86,272 mm (LibreOffice); UNI EN 81-20:2020 5.8.2.2.2 reduces only over
  // 2,5 m/s (norm expert's answer 2): the full stroke 172,544
  const con = { tipo: 'idraulici', na: 2, hydrModel: 'altro', hydrStroke: 100, hydrSlowdown: 'con', certVUrto: 2, certMassaMin: 300, certMassaMax: 2000 };
  const h2 = AMM_CABINA.calcola(ctxCon({ Q: 630, P: 900, v: 1.6 }), con);
  near(h2.valori.fmin, 172.54400000000004, 1e-9, 'H2 fmin');
  assert.equal(esito(h2, 'idrCorsa'), 'fail', 'f = 100 mm: il modello «OK»');
  assert.ok(h2.avvisi.length === 1 && h2.avvisi[0]?.includes('solo oltre 2,5 m/s'));
  assert.ok(!h2.mancanti.includes('hydrVContatto'), 'la velocità di contatto non serve fino a 2,5 m/s');
  // over 2,5 m/s with the contact speed guaranteed: 0,0674·vi², never under 420 mm nor over the full stroke (the model's
  // third at 5 m/s, 561,105 mm, is UNI EN 81-1's)
  near(corsaMinIdraulico(5, true, 3).fmin, 1000 * 0.0674 * 9, 1e-9, 'vi 3 m/s');
  assert.equal(corsaMinIdraulico(5, true, 3).testo, '0,0674 x vi^2');
  near(corsaMinIdraulico(5, true, 1).fmin, 420, 1e-9, 'minimo 420 mm');
  near(corsaMinIdraulico(5, true, 6).fmin, 1685, 1e-9, 'mai oltre la corsa piena');
  near(corsaMinIdraulico(5, true).fmin, 1685, 1e-9, 'senza vi la corsa piena');
  const h5 = AMM_CABINA.calcola(ctxCon({ Q: 630, P: 900, v: 5 }), { ...con, hydrStroke: 561.3, certVUrto: 6 });
  assert.ok(h5.mancanti.includes('hydrVContatto'), 'oltre 2,5 m/s con «CON» si chiede vi');
  assert.equal(esito(AMM_CABINA.calcola(ctxCon({ Q: 630, P: 900, v: 5 }), { ...con, hydrStroke: 561.3, certVUrto: 6, hydrVContatto: 3 }), 'idrCorsa'), 'fail');
  assert.equal(esito(AMM_CABINA.calcola(ctxCon({ Q: 630, P: 900, v: 5 }), { ...con, hydrStroke: 610, certVUrto: 6, hydrVContatto: 3 }), 'idrCorsa'), 'ok');
  // H3: 60 mm at 0,5 m/s: fmin = 16,85 mm (the model also asks f > 65: «NO!»)
  const h3 = AMM_CWT.calcola(ctxCon({ Mcw: 1215, v: 0.5 }), { ...con, hydrStroke: 60, hydrSlowdown: 'senza' });
  assert.equal(esito(h3, 'idrCorsa'), 'ok');
  // H4: 150510 under a car of 500 kg on 2: 250 kg < 300 kg of the catalogue; at 1,7 m/s 1,955 > 1,15·1,6 = 1,84
  const h4 = AMM_CABINA.calcola(ctxCon({ Q: 630, P: 500, v: 1.7 }), { tipo: 'idraulici', na: 2, hydrModel: '150510', hydrSlowdown: 'senza' });
  assert.equal(esito(h4, 'idrMassaVuota'), 'fail');
  assert.equal(esito(h4, 'idrMassaCarica'), 'ok');
  assert.equal(esito(h4, 'idrUrto'), 'fail');
  near(h4.valori.vUrto, 1.15 * 1.6, 1e-12, 'H4 vUrto dal catalogo');
});

test('rt2-amm: gli autan verificati (A1) e i dati richiesti', () => {
  const x = { tipo: 'autan', na: 2, autanModel: '1', certVUrto: 1.15, certMassaMin: 200, certMassaMax: 1000 };
  const a = AMM_CABINA.calcola(ctxCon({ Q: 630, P: 900, v: 1 }), x);
  assert.deepEqual(a.verifiche.map((v) => v.esito), ['ok', 'ok', 'ok', 'ok']);
  assert.equal(a.valori.f, 152);
  const veloce = AMM_CABINA.calcola(ctxCon({ Q: 630, P: 900, v: 1.2 }), x);
  assert.equal(esito(veloce, 'autanVelocita'), 'fail');
  assert.equal(esito(veloce, 'autanUrto'), 'fail');
  const cw = AMM_CWT.calcola(ctxCon({ Mcw: 1215, v: 0.8 }), { tipo: 'autan', autanModel: '3' });
  assert.ok(['certVUrto', 'certMassaMin', 'certMassaMax'].every((c) => cw.mancanti.includes(c)));
  assert.equal(esito(cw, 'autanMassa'), 'fail');
  assert.ok(AMM_CABINA.calcola(base, {}).mancanti.includes('tipo'));
  const man = AMM_CABINA.calcola(base, { tipo: 'molla', springModel: 'altro' });
  assert.ok(['springDm', 'springWire', 'springL0', 'springPitch', 'springG'].every((c) => man.mancanti.includes(c)));
});

test('rt2-amm: le pagine stampate', () => {
  const casi: [ModuloRt2, ContestoRt2, DatiRt2, string[]][] = [
    [AMM_CABINA, ctxCon({ Q: 480, P: 600, v: 0.6 }), { tipo: 'molla', na: 2, springModel: 'A8' },
      ['Ammortizzatori installati sotto:', 'ad elica cilindrica', 'Gli ammortizzatori ad elica cilindrica sono calcolati secondo la norma',
        'UNI EN 81.20 : 2020 - punto 5.8.2.1.1', 'fmin = 135 v²:', 'Fadm = ( f G d⁴ ) / ( 8 D³ i ):', '2,5 ≤ Fadm/Fris ≤ 4:', '78.024 Centoducati', '10594,8', '20391,3']],
    [AMM_CWT, ctxCon({ Mcw: 1215, v: 0.8 }), { tipo: 'autan', autanModel: '2', certVUrto: 1.2, certMassaMin: 300, certMassaMax: 1500 },
      ['contrappeso', 'ad accumulazione di energia con caratteristica non lineare', 'Caratteristiche ammortizzatori come da certificato allegato',
        'MAA 320 H2 (300 172)', 'Verifiche secondo la norma:']],
    [AMM_CABINA, ctxCon({ Q: 630, P: 900, v: 1.6 }), { tipo: 'idraulici', na: 2, hydrModel: '150510', hydrSlowdown: 'con' },
      ['a dissipazione di energia (idraulici)', 'Gli ammortizzatori a dissipazione di energia sono conformi alla', 'norma UNI EN 81.20 : 2020 - punto 5.8.2.2',
        'Si allega certificato di esame di tipo dell\'ammortizzatore in oggetto', '0,0674 x vc^2', 'CON', '172,54']],
    [AMM_CABINA, ctxCon({ Q: 630, P: 900, v: 3 }), { tipo: 'idraulici', na: 2, hydrModel: 'altro', hydrStroke: 500, hydrSlowdown: 'con', hydrVContatto: 2.4,
      certVUrto: 3.5, certMassaMin: 300, certMassaMax: 2000 },
      ['0,0674 x vi^2', 'Velocità di contatto garantita:', '2,40', 'e comunque non minore di 420 mm', '420,00']],
  ];
  for (const [m, ctx, x, frasi] of casi) {
    const e = m.calcola(ctx, x), blocks = m.pagine(ctx, x, e, P0), text = JSON.stringify(blocks);
    for (const f of frasi) assert.ok(text.includes(JSON.stringify(f).slice(1, -1)), `${m.id}: «${f}»`);
    assert.ok(!/undefined|NaN|\[object/.test(text), m.id);
    assert.equal(blocks.filter((b) => b.t === 'pagina').length, 1);
    assert.deepEqual(blocks[1], { t: 'titolo', s: P0.titolo });
    const righe = blocks.flatMap((b) => (b.t === 'sez' ? b.righe : []));
    assert.equal(righe.filter((r) => r.t === 'val' && r.esito).length, e.verifiche.length, `${m.id}: un esito per verifica`);
  }
  assert.deepEqual(AMM_CABINA.pagine(base, {}, AMM_CABINA.calcola(base, {}), P0), []);
});

test('rt2-amm: lo schema dei campi', () => {
  for (const m of [AMM_CABINA, AMM_CWT]) {
    const s = schemaDati(m.campi);
    const pieno = { tipo: 'molla', na: 2, springModel: 'altro', springDm: 75, springWire: 15, springL0: 300, springPitch: 25, springG: 78500,
      autanModel: '1', autanStroke: 152, autanF1: 32200, hydrModel: '150510', hydrStroke: 180, hydrSlowdown: 'con', certVUrto: 1.84, certMassaMin: 300, certMassaMax: 2000 };
    assert.ok(s.safeParse(pieno).success, m.id);
    assert.ok(!s.safeParse({ ...pieno, na: 0 }).success);
    assert.ok(!s.safeParse({ ...pieno, springG: 5000 }).success);
    assert.ok(!s.safeParse({ ...pieno, tipo: 'gomma' }).success);
    assert.ok(!s.safeParse({ ...pieno, springModel: 'A13' }).success, 'le righe senza dati non sono offerte');
  }
  assert.equal(AMM_CABINA.campi.find((c) => c.id === 'na')?.label, '53. Numero ammortizzatori:');
  assert.equal(AMM_CWT.campi.find((c) => c.id === 'na')?.label, '64. Numero ammortizzatori:');
  assert.deepEqual(AMM_CWT.proposte?.(base), { na: 1, hydrSlowdown: 'senza' });
});

test('rt2-amm: registro e differenze', () => {
  const ids = new Set(VOCI_AMM.flatMap((v) => v.verifiche ?? []));
  const casi: [ModuloRt2, DatiRt2][] = [
    [AMM_CABINA, { tipo: 'molla', springModel: 'A1' }], [AMM_CWT, { tipo: 'molla', springModel: 'A1' }],
    [AMM_CABINA, { tipo: 'autan', autanModel: '1' }], [AMM_CWT, { tipo: 'autan', autanModel: '1' }],
    [AMM_CABINA, { tipo: 'idraulici', hydrModel: '150510' }], [AMM_CWT, { tipo: 'idraulici', hydrModel: '150510' }],
  ];
  const prodotte = new Set(casi.flatMap(([m, x]) => m.calcola(base, x).verifiche.map((v) => v.id)));
  for (const id of prodotte) assert.ok(ids.has(id), `${id} senza voce`);
  for (const id of ids) assert.ok(prodotte.has(id), `${id} nella voce ma mai calcolata`);
  const costanti = new Set(VOCI_AMM.flatMap((v) => v.costanti ?? []));
  for (const k of Object.keys(K_AMM)) assert.ok(costanti.has(k), `${k} senza voce`);
  for (const v of VOCI_AMM) {
    for (const k of v.costanti ?? []) {
      const n = String(K_AMM[k as keyof typeof K_AMM]).replace('.', ',');
      assert.ok(v.valore.includes(n), `${v.id}: ${k} = ${n}`);
    }
  }
  const dif = DIFFERENZE_AMM.map((d) => d.id);
  assert.equal(new Set(dif).size, dif.length);
  for (const id of ['X1', 'X2', 'X3', 'X5', 'X6', 'S1', 'S2', 'S4', 'S5', 'S6', 'H1', 'H2', 'H3', 'H4', 'H5', 'A1']) assert.ok(dif.includes(id), id);
});
