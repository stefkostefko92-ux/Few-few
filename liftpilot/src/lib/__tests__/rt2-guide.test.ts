// The guide-rail and counterweight pages of the RT after the owner's model (round 52): the model's sheets «guide cabina
// 8120», «guide cwt 8120», «Contrappeso solo inserimento» and «VERIFICA CWT» recomputed by LibreOffice on its own file
// give the same numbers where no correction applies (rails of Rm 370 with Jy < Jx, the car's centre on the rails' axes,
// the suspension point on the load's side); every correction is shown on a case where the model is wrong; the pages, the
// fields, the registry and the «?» texts are checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import aiuto from '../../../messages/aiuto/rt-guide.json';
import { conValore, schemaDati } from '@/lib/rt2/campi';
import { GUIDE_CATALOGO, PARACADUTE_CABINA, PARACADUTE_CWT } from '@/lib/rt2/cataloghi/guide';
import { CONTRAPPESO } from '@/lib/rt2/componenti/contrappeso';
import { GUIDE_CABINA } from '@/lib/rt2/componenti/guide-cabina';
import { DIFFERENZE_GUIDE } from '@/lib/rt2/differenze-guide';
import { K_GUIDE, VOCI_GUIDE } from '@/lib/rt2/norme-guide';
import type { ContestoRt2, DatiRt2, EsitoRt2, ModuloRt2 } from '@/lib/rt2/types';
import { ctxDi } from './rt2-fixtures';

const near = (a: unknown, b: number, rel = 1e-9, msg = ''): void => {
  assert.equal(typeof a, 'number', `${msg}: ${String(a)}`);
  assert.ok(Math.abs((a as number) - b) <= rel * Math.max(1, Math.abs(b)), `${msg}: ${String(a)} ≠ ${b}`);
};
const P = { titolo: 'Documentazione tecnica relativa alla modifica su impianto ascensore preesistente non conforme alla Direttiva Ascensori', norma: 'UNI 10411-1:2024' };
const esito = (e: EsitoRt2, id: string): string | undefined => e.verifiche.find((v) => v.id === id)?.esito;
const conProp = (m: ModuloRt2, ctx: ContestoRt2, x: DatiRt2): DatiRt2 => ({ ...(m.proposte?.(ctx) ?? {}), ...x });

// ---- car rails: the model's four input sets (LibreOffice on 'guide cabina 8120'; liftUse 1/2/3 = DG!AD70)
type Car = { V: Record<string, string>; use: 'passengers' | 'goods' | 'goodsHeavy'; x: DatiRt2; out: Record<string, number> };
const car = (Q: number, Pc: number, H: number, use: Car['use'], x: DatiRt2, out: Record<string, number>): Car =>
  ({ V: { Q: String(Q), P: String(Pc), H: String(H), v: '1' }, use, x: { numeroGuide: 2, Xc: 0, Yc: 0, Xs: 0, Ys: 0, allungamento: 'oltre12', ...x }, out });
const CARS: Car[] = [
  car(630, 900, 15, 'passengers', { profilo: '9', paracadute: '2', l: 2500, h: 3000, profondita: 1400, larghezza: 1100, Xi: 700, Yi: 0, testata: 3600, fossa: 1400 },
    { i: 14.82791017480519, lambda: 169, omega: 4.82309607, Mg: 164.33818, colonna: 19.9, 'marcia.Fx': 216.3105, 'marcia.My': 101395.54687499999,
      'marcia.sy': 15.339719648260209, 'marcia.Fy': 339.9165, 'marcia.sx': 16.545779789719624, 'marcia.sm': 31.88549943797983, 'marcia.sf': 6.252725390625,
      'marcia.dx': 1.034454937124589, 'marcia.dy': 0.7927362719574989, 'distr.Fx': 540.77625, 'distr.sm': 79.71374859494959, 'distr.dx': 2.586137342811473,
      Fk: 24126.1075458, sk: 110.61077422865526, 'paracadute.Fx': 540.77625, 'paracadute.Fy': 849.79125, 'paracadute.sm': 79.71374859494959,
      sc: 182.3531479641099, 'paracadute.sf': 15.6318134765625, 'paracadute.dy': 1.981840679893747, Fs: 2472.1200000000003, 'carico.Fx': 288.41400000000004,
      'carico.sm': 20.45295953101362, 'carico.sf': 8.3369671875, 'carico.dx': 1.3792732494994522, 'carico.Fy': 0 }),
  car(1000, 1300, 30, 'goods', { profilo: '16', paracadute: '4', l: 3000, h: 3500, profondita: 2100, larghezza: 1400, Xs: -40, Ys: -25, Xi: 1050, Yi: 100,
    testata: 4000, fossa: 1500 },
  { i: 16.922084155132676, lambda: 177, omega: 5.29052823, Mg: 376.81883999999997, colonna: 35.4, 'marcia.Fx': 596.1677142857143, 'marcia.Fy': 781.9971428571429,
    'marcia.sm': 65.52678142998096, 'marcia.sf': 13.61617619047619, 'marcia.dx': 2.93463713498471, 'marcia.dy': 1.8637349284555602,
    'distr.Fx': 993.6128571428571, 'distr.Mx': 733122.3214285715, 'distr.sm': 109.21130238330161, 'distr.dx': 4.8910618916411845, Fk: 26259.5928204,
    sk: 102.45362619810584, 'paracadute.Fx': 735.75, 'paracadute.Fy': 981, 'paracadute.sm': 81.4986031961665, sc: 175.8023690746557,
    'paracadute.dx': 3.621731301991004, Fs: 5886, 'carico.Fx': 989.4085714285715, 'carico.Fy': 301.3071428571429, 'carico.sm': 69.30267987343228,
    'carico.sf': 22.597603174603176, 'carico.dx': 4.870366284201236, 'carico.dy': 0.7181057520034865 }),
  car(320, 450, 8, 'goodsHeavy', { profilo: '3', paracadute: '1', l: 1800, h: 2400, profondita: 1000, larghezza: 800, Xi: 520, Yi: -60, testata: 3300, fossa: 1200 },
    { i: 9.505416412576073, lambda: 189, omega: 6.03220527, Mg: 41.369499999999995, colonna: 12.4, 'marcia.Fx': 98.1, 'marcia.sm': 40.30018202621177,
      'distr.sm': 167.91742510921577, Fk: 19290.084795, sk: 273.7923556685785, 'paracadute.sm': 167.91742510921577, sc: 424.9180382668727,
      'paracadute.dx': 4.394744576759709, Fs: 2668.3199999999997, 'carico.Fx': 289.068, 'carico.Fy': -66.708, 'carico.sx': -8.898794466403162,
      'carico.sm': 65.95168920324527, 'carico.sf': 21.391032, 'carico.dx': 3.1079633646844655, 'carico.dy': 0.3408581298663847 }),
  car(1600, 1900, 45, 'passengers', { profilo: '20', paracadute: '3', l: 2800, h: 3800, profondita: 2400, larghezza: 1600, Xs: -100, Xi: 1200, Yi: 0,
    testata: 4500, fossa: 1800, fp: 0 },
  { i: 18.26904381141606, lambda: 153, omega: 3.9530778300000002, Mg: 631.0143999999999, colonna: 51.199999999999996, 'marcia.Fx': 1285.6263157894737,
    'marcia.Fy': 991.3263157894737, 'marcia.sm': 93.72202439081647, 'marcia.dx': 3.8128273724777366, 'distr.dx': 6.3547122874628945, Fk: 40525.251264,
    sk: 102.03788046299228, 'paracadute.Fx': 1239.157894736842, 'paracadute.sm': 116.00293910512231, sc: 206.44052565760234,
    'paracadute.sf': 22.92442105263158, Fs: 6278.400000000001, 'carico.Fx': 1319.1868421052632, 'carico.sm': 58.69263492417484, 'carico.dx': 3.912359010715108 }),
];
const ctxCar = (c: Car, V: Record<string, string> = {}): ContestoRt2 => ctxDi({ V: { ...c.V, ...V }, liftUse: c.use });

/** The model rounds λ to the integer before ω (round 52, norm expert's answer 13: λ exact): λ, ω and what ω gives (σk,
 *  σc) are checked against the model's by the correction — λ = l/i within half a unit of the model's, ω moving with it
 *  (by at most 2 %), σk/ω and σc − σk as the model's — every other value as LibreOffice gives it. */
const DA_LAMBDA = new Set(['lambda', 'omega', 'sk', 'sc']);
function vettore(tag: string, l: number, valori: Record<string, unknown>, out: Record<string, number | null>): void {
  for (const [k, v] of Object.entries(out)) {
    if (v === null) assert.equal(valori[k], null, `${tag} ${k}`);
    else if (k === 'lambda') assert.ok(Math.abs((valori.lambda as number) - v) <= 0.5 + 1e-9, `${tag} λ ${String(valori.lambda)} / ${v}`);
    else if (!DA_LAMBDA.has(k) || out.omega === null) near(valori[k], v, 1e-9, `${tag} ${k}`);
  }
  const lm = out.lambda, wm = out.omega, la = valori.lambda as number, w = valori.omega as number | null;
  if (typeof lm !== 'number' || typeof wm !== 'number' || w === null) return;
  near(la, l / (valori.i as number), 1e-12, `${tag} λ esatto`);
  assert.ok(Math.abs(la - lm) <= 0.5 + 1e-9 && Math.sign(w - wm) === Math.sign(la - lm) && Math.abs(w - wm) <= 0.02 * wm, `${tag} ω ${w} / ${wm}`);
  const skm = out.sk, scm = out.sc;
  if (typeof skm === 'number') near((valori.sk as number) / w, skm / wm, 1e-9, `${tag} σk/ω`);
  if (typeof skm === 'number' && typeof scm === 'number') near((valori.sc as number) - (valori.sk as number), scm - skm, 1e-9, `${tag} σc − σk`);
}

test('rt2-guide: guide di cabina — i vettori del modello (LibreOffice) dove nessuna correzione cambia il valore', () => {
  for (const [n, c] of CARS.entries()) {
    const e = GUIDE_CABINA.calcola(ctxCar(c), c.x);
    assert.deepEqual(e.mancanti, [], `C${n + 1}`);
    vettore(`C${n + 1}`, c.x.l as number, e.valori, c.out);
  }
});

test('rt2-guide: guide di cabina — correzioni E-1, E-2, E-4, E-5, E-6, E-7, E-8, E-10, E-12–E-14, E-17–E-20', () => {
  const c1 = CARS[0], ctx = ctxCar(c1), e = GUIDE_CABINA.calcola(ctx, c1.x);
  // E-1: σ = σm + Fk/A = 79,714 + 24126,1/1052 = 102,647 (the model (σm + Fk)/A = 23,009 and passes anyway)
  near(e.valori.s, 79.71374859494959 + 24126.1075458 / 1052, 1e-9, 'σ');
  // E-5: Rm/St = 370/2,25 and 370/1,8 (the model 165/205); RT 40 (Rm 360): 160/200 (the model 165/205, on the unsafe side)
  near(e.valori.sAmmMarcia, 370 / 2.25, 1e-12, 'σamm'); near(e.valori.sAmmParacadute, 370 / 1.8, 1e-12, 'σamm gear');
  const rt40 = GUIDE_CABINA.calcola(ctx, { ...c1.x, profilo: '1' });
  near(rt40.valori.sAmmMarcia, 160, 1e-12, 'Rm 360');
  // E-14: Rm 360 is outside 370–520: no ω, σc not verified
  assert.equal(rt40.valori.omega, null); assert.equal(esito(rt40, 'guideCabina.paracadute.sc'), 'fail'); assert.ok(rt40.avvisi.some((a) => a.includes('omega')));
  // E-2: running deflection 7,45 mm (l 3500 on C4): the model passes it within 10, ours fails it over 5
  const c4 = CARS[3], e4 = GUIDE_CABINA.calcola(ctxCar(c4), { ...c4.x, l: 3500 });
  const dx = e4.valori['marcia.dx'] as number;
  assert.ok(dx > 5 && dx < 10, String(dx)); assert.equal(esito(e4, 'guideCabina.marcia.dx'), 'fail');
  // E-8: «Distribuzione del carico» over its limit is an attention (C4: δx 6,35 mm)
  assert.equal(esito(GUIDE_CABINA.calcola(ctxCar(c4), c4.x), 'guideCabina.distr.dx'), 'warn');
  // E-4: T125/A has Jy > Jx: i = √(Jx/A) (the model √(Jy/A) = 26,39)
  near(GUIDE_CABINA.calcola(ctx, { ...c1.x, profilo: '24' }).valori.i, Math.sqrt(1510000 / 2283), 1e-12, 'i min');
  // E-6: the ropes beyond the load (Xs 300 > XQ 175): the model's Fx = 1,2·9,81·(630·(175 − 300) − 900·300)/6000 < 0 makes σf
  // negative and «verified»; ours takes the load on the other side: |Fx| = 1,2·9,81·(630·475 + 900·300)/6000
  const e6 = GUIDE_CABINA.calcola(ctx, { ...c1.x, Xs: 300 });
  near(e6.valori['marcia.Fx'], -(1.2 * 9.81 * (630 * 475 + 900 * 300)) / 6000, 1e-12, 'Fx'); assert.ok((e6.valori['marcia.sf'] as number) > 0);
  // E-7: the car's centre 100 mm off the axis: the load at 100 + 175 (the model at 175): Fx = 3·9,81·(630·275 + 900·100)/6000
  near(GUIDE_CABINA.calcola(ctx, { ...c1.x, Xc: 100 }).valori['paracadute.Fx'], (3 * 9.81 * (630 * 275 + 900 * 100)) / 6000, 1e-12, 'Fx Xc');
  // E-10: n from its input
  near(GUIDE_CABINA.calcola(ctx, { ...c1.x, numeroGuide: 4 }).valori.Fk, 3 * 9.81 * 1530 / 4 + 164.33818 * 9.81, 1e-12, 'n 4');
  // E-12: λ under 20 takes ω(20); over 250: no ω, the attention «VERIFICA GUIDE e/o STAFFE»
  near(GUIDE_CABINA.calcola(ctx, { ...c1.x, l: 250 }).valori.omega, 0.0001292 * 20 ** 1.89 + 1, 1e-12, 'ω 20');
  const lungo = GUIDE_CABINA.calcola(ctx, { ...c1.x, l: 4000 });
  assert.equal(lungo.valori.omega, null); assert.ok(lungo.avvisi.some((a) => a.includes('VERIFICA GUIDE e/o STAFFE')));
  // E-13: T75-3/B (Rm 430) at λ 100: ω520 of the 520 ranges (0,0002533·λ²), the model the 370 ranges (0,00002447·λ^2,36 + 1,03)
  const t75 = GUIDE_CABINA.calcola(ctx, { ...c1.x, profilo: '14', l: Math.round(100 * Math.sqrt(264900 / 1099)) });
  const l75 = t75.valori.lambda as number;
  near(l75, 100, 1e-2, 'λ 100');
  const w370 = 0.00001711 * l75 ** 2.35 + 1.04;
  near(t75.valori.omega, w370 + (60 / 150) * (0.0002533 * l75 ** 2 - w370), 1e-12, 'ω 430');
  // E-17: over 40 m of travel Fp is asked; E-18: σ = σm + Mg·g/A in running
  assert.ok(GUIDE_CABINA.calcola(ctxCar(c4), { ...c4.x, fp: undefined }).mancanti.includes('fp'));
  near(e.valori.sMarcia, 31.88549943797983 + (164.33818 * 9.81) / 1052, 1e-9, 'σ marcia');
  // E-19: a second entrance is checked too; E-20: instantaneous gear up to 0,63 m/s included
  assert.ok(GUIDE_CABINA.calcola(ctx, { ...c1.x, Xi2: -700 }).verifiche.some((v) => v.id === 'guideCabina.carico2.sm'));
  assert.equal(esito(GUIDE_CABINA.calcola(ctxCar(c1, { v: '0.63' }), c1.x), 'guideCabina.tipoParacadute'), 'ok');
  assert.equal(esito(GUIDE_CABINA.calcola(ctxCar(c1, { v: '0.8' }), c1.x), 'guideCabina.tipoParacadute'), 'fail');
  // E-11, E-16: a car never «senza»; an empty input is missing (the model computes zeros and a negative rail mass)
  assert.equal(PARACADUTE_CABINA.length, 4);
  for (const id of ['h', 'testata']) {
    const vuoto = GUIDE_CABINA.calcola(ctx, { ...c1.x, [id]: undefined });
    assert.ok(vuoto.mancanti.includes(id), id); assert.equal(vuoto.verifiche.length, 0);
  }
  // E-3: the deflections at the safety gear's operation are checked; E-OPZ: each list offers only its own rail typed by hand
  assert.ok(e.verifiche.some((v) => v.id === 'guideCabina.paracadute.dx'));
  const opz = (m: ModuloRt2): string[] => m.campi.flatMap((c) => (c.t === 'scelta' && c.id === 'profilo' ? c.opzioni.map((o) => o.v) : []));
  assert.ok(opz(GUIDE_CABINA).includes('32') && !opz(GUIDE_CABINA).includes('31'));
  assert.ok(opz(CONTRAPPESO).includes('31') && !opz(CONTRAPPESO).includes('32'));
});

// ---- counterweight: the model's input sets (LibreOffice on «guide cwt 8120», «Contrappeso solo inserimento», «VERIFICA CWT»)
type Cw = { V: Record<string, string>; doc: { Q: number; P: number; Mcw: number }; x: DatiRt2; out: Record<string, number | null>; testo: string };
const cw = (V: Record<string, string>, doc: Cw['doc'], x: DatiRt2, out: Cw['out'], testo: string): Cw =>
  ({ V: { k: '0.5', ...V }, doc, x: { numeroGuide: 2, intervento: '1', extracorsaCwt: 300, extracorsaCabina: 300, allungamento: 'oltre12', ...x }, out, testo });
const CWS: Cw[] = [
  cw({ Q: '630', P: '985', H: '15', v: '1' }, { Q: 630, P: 985, Mcw: 1200 }, { profilo: '3', paracadute: '4', dfg: 800, profondita: 200, l: 1500, h: 2000,
    testata: 3600, fossa: 1400, ingombroCwt: 2500, pilastrino: 300, lAmm: 250, frecciaAmm: 80 },
  { i: 9.505416412576073, lambda: 158, omega: 4.21567068, Mg: 66.391375, colonna: 19.9, testataFossa: 5000, M: 1730, Mextra: 1430, margineMinimo: 335 },
  'non rientra nella tolleranza del 10%'),
  cw({ Q: '450', P: '655', H: '12', v: '0.63' }, { Q: 450, P: 655, Mcw: 800 }, { profilo: '15', paracadute: '3', dfg: 600, profondita: 150, l: 2000, h: 2200,
    testata: 3400, fossa: 1300, ingombroCwt: 2200, pilastrino: 500, lAmm: 180, frecciaAmm: 40 },
  { i: 16.302886678528843, lambda: 123, omega: 3.065770818, Mg: 127.96441999999996, colonna: 16.599999999999998, M: 1560, Mextra: 1260, margineMinimo: 313.8915 },
  'rientra nella tolleranza del 25%'),
  cw({ Q: '1000', P: '1000', H: '30', v: '1.6' }, { Q: 1000, P: 1000, Mcw: 1500 }, { profilo: '20', paracadute: '1', dfg: 900, profondita: 250, l: 2500, h: 3000,
    testata: 3800, fossa: 1600, ingombroCwt: 3000, pilastrino: 800, lAmm: 300, frecciaAmm: 100 },
  { i: 18.26904381141606, lambda: 137, omega: 3.16952103, Mg: 435.05484999999993, colonna: 35.3, M: 1100, Mextra: 800, margineMinimo: 389.6 },
  'rientra nella tolleranza del 10%'),
  cw({ Q: '400', P: '1100', H: '15', v: '1' }, { Q: 400, P: 1100, Mcw: 1200 }, { profilo: '3', paracadute: '4', dfg: 800, profondita: 200, l: 2500, h: 2000,
    testata: 3600, fossa: 1400 }, { lambda: 263, omega: null, Mg: 66.391375 }, 'rientra nella tolleranza del 25%'),
];
const ctxCw = (c: Cw, collaudo: object = {}): ContestoRt2 => ctxDi({ V: c.V, collaudo: { documentato: c.doc, ...collaudo } });
const EDIZIONE = 'della norma UNI 10411-1 : 2024';

test('rt2-guide: contrappeso — i vettori del modello (LibreOffice) dove nessuna correzione cambia il valore', () => {
  for (const [n, c] of CWS.entries()) {
    const ctx = ctxCw(c), e = CONTRAPPESO.calcola(ctx, c.x);
    assert.deepEqual(e.mancanti, [], `W${n + 1}`);
    vettore(`W${n + 1}`, c.x.l as number, e.valori, c.out);
    const txt = JSON.stringify(CONTRAPPESO.pagine(ctx, c.x, e, P));
    assert.ok(txt.includes(`Il nuovo valore del carico statico Tcp, nel tratto delle funi lato contrappeso, ${c.testo}`), `W${n + 1} testo`);
    assert.ok(txt.includes(EDIZIONE), 'E-36');
  }
  // «VERIFICA CWT»: OK in W1, INSUFFICIENTE in W3 (an attention)
  assert.equal(esito(CONTRAPPESO.calcola(ctxCw(CWS[0]), CWS[0].x), 'contrappeso.margine'), 'ok');
  assert.equal(esito(CONTRAPPESO.calcola(ctxCw(CWS[2]), CWS[2].x), 'contrappeso.margine'), 'warn');
});

test('rt2-guide: contrappeso — correzioni E-23–E-30, E-33, E-34', () => {
  const c = CWS[0], e = CONTRAPPESO.calcola(ctxCw(c), c.x);
  // E-23, E-29, E-30: Fx = 1,2·9,81·1300·(0,10·200)/(2·2000), Fy = 1,2·9,81·1300·(0,05·800)/(1·2000) (the model 117,49 and 234,97 «N»:
  // divided by the rail's weight, never by h, with half the offsets and Fy over n)
  near(e.valori['marcia.Fx'], (1.2 * 9.81 * 1300 * 20) / 4000, 1e-12, 'Fx'); near(e.valori['marcia.Fy'], (1.2 * 9.81 * 1300 * 40) / 2000, 1e-12, 'Fy');
  // E-24, E-28: every check computed; without a safety gear δ ≤ 10 mm and no page of its operation
  const dx = e.verifiche.find((v) => v.id === 'contrappeso.marcia.dx');
  assert.equal(dx?.limite, 10); assert.ok(!e.verifiche.some((v) => v.id.startsWith('contrappeso.paracadute')));
  const pg = CONTRAPPESO.pagine(ctxCw(c), c.x, e, P), tp = JSON.stringify(pg);
  assert.equal(pg.filter((b) => b.t === 'pagina').length, 2);
  // E-31: no «< = σamm/3,75»; E-38: the margin's label in mm
  assert.ok(!tp.includes('< =') && tp.includes('300 + 35 * V^2'));
  // E-15: λ 20 (l 190 on T45/A) takes ω(20) (the model #N/D)
  near(CONTRAPPESO.calcola(ctxCw(c), { ...c.x, l: 190 }).valori.omega, 0.0001292 * 20 ** 1.89 + 1, 1e-12, 'ω 20');
  // E-25, E-27, E-26: with a safety gear (W3, wedges K1 5) buckling within Rm/1,8; T78/B Rm 430: 430/2,25 (the model 195)
  const w3 = CWS[2], e3 = CONTRAPPESO.calcola(ctxCw(w3), w3.x);
  near(e3.valori.Fv, (5 * 9.81 * 1500) / 2 + 435.05484999999993 * 9.81, 1e-9, 'Fv');
  assert.equal(e3.verifiche.find((v) => v.id === 'contrappeso.paracadute.sc')?.limite, 370 / 1.8);
  assert.equal(e3.verifiche.find((v) => v.id === 'contrappeso.marcia.dx')?.limite, 5);
  near(CONTRAPPESO.calcola(ctxCw(CWS[1]), CWS[1].x).valori.sAmmMarcia, 430 / 2.25, 1e-12, 'Rm 430');
  // E-33: «cwt sostituzione» with the mass within: the model prints «non rientra»; ours from the masses (50 kg ≤ 10 % of 630)
  const w4 = { ...c, doc: { ...c.doc, P: 935 }, V: { ...c.V, P: '935' } }, x4 = { ...c.x, intervento: '3' };
  const e4 = CONTRAPPESO.calcola(ctxCw(w4), x4);
  assert.equal(esito(e4, 'contrappeso.peso'), 'ok');
  assert.ok(JSON.stringify(CONTRAPPESO.pagine(ctxCw(w4), x4, e4, P)).includes('rientra nella tolleranza del 10%'));
  // E-34: Q 400 → 600, cwt 1000 → 1090: the model takes 25 % of 400 (verified) and prints 10 %; ours 10 % of the smaller 400 = 40 kg
  const w6: Cw = { ...c, V: { Q: '600', P: '790', H: '10', v: '0.8', k: '0.5' }, doc: { Q: 400, P: 790, Mcw: 1000 } };
  const e6 = CONTRAPPESO.calcola(ctxCw(w6), w6.x);
  assert.equal(esito(e6, 'contrappeso.peso'), 'warn'); near(e6.valori.aumento, 90 / 400, 1e-12, 'ΔTcp');
  // UNI 10411-11: any increase brings the checks of 6.2–6.13
  const e11 = CONTRAPPESO.calcola(ctxCw(c, { norma: '10411-11' }), c.x);
  assert.ok(JSON.stringify(CONTRAPPESO.pagine(ctxCw(c, { norma: '10411-11' }), c.x, e11, P)).includes('punti da 6.2 a 6.13'));
});

test('rt2-guide: pagine — testi del modello, esiti sulle righe, niente undefined', () => {
  const c1 = CARS[0], e = GUIDE_CABINA.calcola(ctxCar(c1), c1.x), blocks = GUIDE_CABINA.pagine(ctxCar(c1), c1.x, e, P), txt = JSON.stringify(blocks);
  assert.equal(blocks.filter((b) => b.t === 'pagina').length, 3);
  for (const s of ['Calcolo in accordo con appendice C , EN 81.50', 'Peso della cabina, cavi flessibili, catena/fune compensazione', 'RIEPILOGO VERIFICHE',
    'Fv = [ K1 gN  [ P + Q + Pcp + Maux  ] /  n ] + [Mg gn] + Fp', 'Fs  = 0,4 gn Q', 'Calcolo GUIDE CABINA durante la fase di carico', 'ISO T70-2/A; TLH70; RT 70']) {
    assert.ok(txt.includes(s), s);
  }
  const w = CWS[2], ew = CONTRAPPESO.calcola(ctxCw(w), w.x), bw = CONTRAPPESO.pagine(ctxCw(w), w.x, ew, P), tw = JSON.stringify(bw);
  assert.equal(bw.filter((b) => b.t === 'pagina').length, 3);
  for (const s of ['Sezione critica della guida', 'Peso cwt modificato kg:', 'VERIFICA MARGINE INIZIALE CONTRAPPESO', 'ATTENZIONE, MARGINE CWT INSUFFICIENTE']) assert.ok(tw.includes(s), s);
  for (const t of [txt, tw]) assert.ok(!/undefined|NaN|\[object/.test(t));
  const conEsito = (bs: typeof blocks): number => bs.flatMap((b) => (b.t === 'sez' ? b.righe : [])).filter((r) => r.t === 'val' && r.esito).length;
  assert.ok(conEsito(blocks) >= 20 && conEsito(bw) >= 10);
});

test('rt2-guide: campi, proposte, catalogo, registro, differenze e testi «?»', () => {
  const ctx = ctxCar(CARS[0]);
  for (const [m, x] of [[GUIDE_CABINA, CARS[0].x], [CONTRAPPESO, CWS[0].x]] as const) {
    const s = schemaDati(m.campi);
    assert.ok(s.safeParse(conProp(m, ctx, x)).success, m.id);
    assert.ok(!s.safeParse({ ...x, l: 50 }).success, `${m.id} l`);
    for (const c of m.campi.filter(conValore)) {
      const t = (aiuto as Record<string, string>)[`${m.id}.${c.id}`];
      assert.ok(t && t.length <= 400, `aiuto ${m.id}.${c.id}`);
    }
  }
  assert.equal(GUIDE_CATALOGO.length, 30);
  assert.deepEqual(GUIDE_CATALOGO[8], { n: 9, tipo: 'ISO T70-2/A; TLH70; RT 70', dimensioni: '70 x 70 x 8', lavorazione: 'trafilate', Jx: 474300, Jy: 231300,
    Wx: 9630, Wy: 6610, A: 1052, Rm: 370, lsc: 62, c: 8 });
  assert.deepEqual(PARACADUTE_CABINA.map((r) => r.K1), [5, 3, 2, 2]); assert.deepEqual(PARACADUTE_CWT.map((r) => r.K1), [5, 3, 2, null]);
  const it = (x: number): string => String(x).replace('.', ',');
  for (const k of Object.keys(K_GUIDE) as (keyof typeof K_GUIDE)[]) {
    const v = VOCI_GUIDE.find((x) => x.costanti?.includes(k));
    assert.ok(v && v.valore.includes(it(K_GUIDE[k])), k);
  }
  const ids = new Set(VOCI_GUIDE.flatMap((v) => v.verifiche ?? []));
  const tutte = [GUIDE_CABINA.calcola(ctx, { ...CARS[0].x, Xi2: 500 }), CONTRAPPESO.calcola(ctxCw(CWS[2]), CWS[2].x)].flatMap((e) => e.verifiche);
  for (const v of tutte) assert.ok(ids.has(v.id), v.id);
  assert.equal(new Set(DIFFERENZE_GUIDE.map((d) => d.id)).size, DIFFERENZE_GUIDE.length);
  for (const d of DIFFERENZE_GUIDE) assert.ok(d.modello && d.correzione && ['guideCabina', 'contrappeso'].includes(d.componente), d.id);
});
