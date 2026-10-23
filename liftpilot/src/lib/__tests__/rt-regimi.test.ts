// The regime the lift was approved under (round 49, RT plan §4.4; the norm expert's answers §1): the acts of UNI
// 10411-1 in their succession (D.Lgt. 600/1945, DPR 1497/1963, DM 587/1987; DPR 268/1994 offered, never derived), DPR
// 162/1999 for the CE-marked lifts of UNI 10411-11; the year derives a guess, 1999 (KL.ceFrom) none; DM 1635/1979 not
// offered; the issue needs a regime chosen, or derived and confirmed, admitted by the calculation's part of UNI 10411.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KL } from '@/lib/lift/norme';
import { ANNO_CE, ANNO_PRIMO_ATTO, REGIMI, coerenzaRegime, regime, regimeDaAnno, regimeOf, regimiAmmessi } from '@/lib/rt/regimi';
import { REGIME_KEYS } from '@/lib/rt/types';
import { ANNO_MIN } from '@/lib/rt/anagrafica';

test('rt-regimi: gli atti, la loro parte della UNI 10411 e il DM 1635/1979 escluso', () => {
  assert.deepEqual(REGIMI.map((r) => r.key), [...REGIME_KEYS]);
  assert.ok(!REGIME_KEYS.some((k) => k.includes('1635')), 'il DM 1635/1979 riguarda ascensori a vite, a cremagliera e idraulici');
  assert.deepEqual(regimiAmmessi('10411-1'), ['dlgt_600_1945', 'dpr_1497_1963', 'dm_587_1987', 'dpr_268_1994']);
  assert.deepEqual(regimiAmmessi('10411-11'), ['dpr_162_1999']);
  assert.match(regime('dpr_268_1994').nota ?? '', /non più citato nello scopo della UNI 10411-1 dal 2013/);
  assert.equal(regime('dpr_268_1994').anni, null);
  assert.equal(regime('dpr_162_1999').sigla, 'DPR 162/1999 (marcatura CE)');
});

test('rt-regimi: gli anni derivati si susseguono senza buchi fino all’anno della marcatura CE, che non deriva nulla', () => {
  assert.equal(ANNO_CE, Number(KL.ceFrom.slice(0, 4)));
  const anni = REGIMI.flatMap((r) => (r.anni ? [r.anni] : []));
  assert.equal(anni[0]?.[0], ANNO_PRIMO_ATTO, 'il primo atto della successione: prima nessuna derivazione');
  assert.ok(ANNO_PRIMO_ATTO > ANNO_MIN);
  for (let i = 1; i < anni.length; i++) assert.equal(anni[i]?.[0], (anni[i - 1]?.[1] ?? 0) + 1, 'anni contigui');
  assert.equal(anni[anni.length - 1]?.[1], ANNO_CE - 1);
  const casi: [number, string | null][] = [[1930, null], [1944, null], [1945, 'dlgt_600_1945'], [1962, 'dlgt_600_1945'], [1963, 'dpr_1497_1963'], [1987, 'dpr_1497_1963'],
    [1988, 'dm_587_1987'], [1998, 'dm_587_1987'], [1999, null], [2005, null]];
  for (const [anno, atteso] of casi) assert.equal(regimeDaAnno(anno, false), atteso, String(anno));
  assert.equal(regimeDaAnno(undefined, false), null);
  assert.equal(regimeDaAnno(1978, true), 'dpr_162_1999', 'con la marcatura CE vale il DPR 162/1999');
  assert.equal(regimeDaAnno(undefined, true), 'dpr_162_1999');
});

test('rt-regimi: coerenza con la parte della UNI 10411 del calcolo', () => {
  assert.ok(coerenzaRegime('dpr_1497_1963', { norma: '10411-1' }));
  assert.ok(!coerenzaRegime('dpr_162_1999', { norma: '10411-1' }), 'un regime CE su un impianto senza marcatura');
  assert.ok(!coerenzaRegime('dm_587_1987', { norma: '10411-11' }));
  assert.ok(!coerenzaRegime('dpr_1497_1963', { norma: 'en81' }), 'il collaudo come nuovo non ha regime');
});

test('rt-regimi: il regime per l’emissione — scelto, o derivato e confermato, e coerente', () => {
  assert.deepEqual(regimeOf({ annoInstallazione: 1978 }, '10411-1'),
    { legge: 'dpr_1497_1963', origine: 'anno', confermata: false, coerente: true, emettibile: false });
  assert.equal(regimeOf({ annoInstallazione: 1978, leggeConfermata: true }, '10411-1').emettibile, true);
  assert.deepEqual(regimeOf({ legge: 'dpr_268_1994' }, '10411-1'), { legge: 'dpr_268_1994', origine: 'scelta', confermata: false, coerente: true, emettibile: true });
  assert.deepEqual(regimeOf({ legge: 'dpr_162_1999', annoInstallazione: 1978 }, '10411-1'),
    { legge: 'dpr_162_1999', origine: 'scelta', confermata: false, coerente: false, emettibile: false });
  assert.deepEqual(regimeOf({ annoInstallazione: 1999 }, '10411-1'), { legge: null, origine: null, confermata: false, coerente: false, emettibile: false });
  assert.deepEqual(regimeOf({}, '10411-11'), { legge: 'dpr_162_1999', origine: 'anno', confermata: false, coerente: true, emettibile: false });
});
