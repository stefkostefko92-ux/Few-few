// The registry of the relazione tecnica di modifica (round 49): every number of KR and every check of the RT's own has an
// entry whose text states it; the numbers reused from the shaft's registries are stated as the code has them; KR holds
// the values of the norm expert's answers, clause by clause; the tables (sections, documents, regimes) are in the entries
// that describe them; no entry carries the third-party template's phrases or an edition the RT does not cite; the RT's
// checks and obligations stay out of the acceptance test's scope (ambito-version's key).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KV_VERT } from '@/shaft/norme-vert';
import { AMBITO_10411_1, AMBITO_VERIFICHE } from '@/lib/lift/collaudo';
import { KL } from '@/lib/lift/norme';
import { OBBLIGHI_PARTI } from '@/lib/lift/obblighi';
import { KR, OBBLIGHI_RT, type CostanteRt } from '@/lib/rt/norme';
import { VOCI_RT } from '@/lib/rt/norme-voci';
import { RT_NEW_CHECK_IDS } from '@/lib/rt/types';
import { SEZIONI, SEZIONI_PER_CASO } from '@/lib/rt/sezioni';
import { DOCUMENTI } from '@/lib/rt/documenti';
import { REGIMI } from '@/lib/rt/regimi';
import { RT_ENGINE_VERSION } from '@/lib/rt/version';

const it = (x: number): string => String(x).replace('.', ',');
const pct = (x: number): string => it(Math.round(x * 1000) / 10);
const voce = (id: string) => {
  const v = VOCI_RT.find((x) => x.id === id);
  assert.ok(v, `voce ${id}`);
  return v;
};
const has = (id: string, text: string): void => assert.ok(voce(id).valore.includes(text), `${id}: manca «${text}» in «${voce(id).valore}»`);

test('rt-norme: voci complete, con identificativo unico e uno stato del registro', () => {
  const ids = VOCI_RT.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, 'identificativi duplicati');
  for (const v of VOCI_RT) {
    for (const f of ['titolo', 'valore', 'riferimento', 'fonte'] as const) assert.ok(v[f].trim().length > 0, `${v.id}: ${f} vuoto`);
    assert.ok(['confermato', 'da_verificare', 'stima', 'derivazione', 'scelta', 'prassi'].includes(v.stato), `${v.id}: stato`);
    assert.ok(!/undefined|NaN|\[object/.test(`${v.titolo} ${v.valore} ${v.riferimento} ${v.fonte} ${v.nota ?? ''}`), `${v.id}: testo rotto`);
  }
});

test('rt-norme: ogni costante di KR e ogni verifica propria della relazione hanno la loro voce', () => {
  const used = new Set(VOCI_RT.flatMap((v) => v.costanti ?? []));
  assert.deepEqual((Object.keys(KR) as CostanteRt[]).filter((c) => !used.has(c)), [], 'costanti senza voce');
  const checked = new Set(VOCI_RT.flatMap((v) => v.verifiche ?? []));
  assert.deepEqual(RT_NEW_CHECK_IDS.filter((c) => !checked.has(c)), [], 'verifiche senza voce');
});

test('rt-norme: KR ha i valori delle risposte dell’esperto di norme, punto per punto', () => {
  assert.deepEqual({ ...KR, omega520: undefined }, {
    springStaticMin: 2.5, springStaticMax: 4, // UNI EN 81-20:2020, 5.8.2.1.1.2
    bufImpactRatio: 1.15, // 5.8.2.1.2.1, 5.8.2.2.3
    govForceMin: 300, govForceGear: 2, govRopeSf: 8, // 5.6.2.2.1.1 d), 5.6.2.2.1.3 b)
    ctrlVoltageMax: 250, // 5.10.1.3.2
    lockContactAc: 25, lockContactDc: 50, // UNI 10411-1:2024, 11.1.2
    railRmMin: 370, railRmMax: 520, // UNI EN 81-50:2020, 5.10.3
    railStRun812: 3.75, railStGear812: 3, // UNI EN 81-20:2020, 5.7.4.5 (prospetto 15)
    cwRailDeflNoGear: 10, // 5.7.4.6 b)
    fpTravelMax: 40, // 5.7.2.3.5
    doorHeightEn8121: 1900, // UNI 10411-1:2024, 19.1
    doorHeightMin8121: 1800, doorLintelAngle: 30, // UNI EN 81-21:2022, 5.12
    omega520: undefined,
  });
  // the breakpoints of ω for Rm 520 (50 / 70 / 89, up to λ 250), never the template's 60 / 85 / 115
  assert.deepEqual(KR.omega520.map((r) => r[0]), [50, 70, 89, 250]);
});

/** ω of a table [λ up to, a, exponent, b] at λ (20 ≤ λ ≤ 250). */
const omega = (t: readonly (readonly number[])[], l: number): number => {
  const r = t.find((x) => l <= (x[0] ?? 0)) ?? t[t.length - 1];
  return (r[1] ?? 0) * l ** (r[2] ?? 0) + (r[3] ?? 0);
};

test('rt-norme: ω per Rm 520 continuo ai punti di passaggio, crescente con λ e mai sotto quello di Rm 370', () => {
  for (const l of [50, 70, 89]) {
    const a = omega(KR.omega520, l), b = omega(KR.omega520, l + 1e-9);
    assert.ok(Math.abs(a - b) / a < 0.01, `salto a λ ${l}: ${a} → ${b}`);
  }
  let prev = 0;
  for (let l = 20; l <= 250; l += 1) {
    const w = omega(KR.omega520, l);
    assert.ok(w > prev, `ω non crescente a λ ${l}`);
    assert.ok(w >= omega(KV_VERT.omega370, l), `ω 520 sotto ω 370 a λ ${l}`);
    prev = w;
  }
});

test('rt-norme: i testi delle voci riportano i numeri del codice', () => {
  for (const t of [`${KR.ctrlVoltageMax} V`, `${KR.lockContactAc} V`, `${KR.lockContactDc} V`]) has('quadro.tensioni', t);
  has('ammortizzatori.molla', `tra ${it(KR.springStaticMin)} e ${KR.springStaticMax} volte`);
  has('ammortizzatori.velocita', `${it(KR.bufImpactRatio)} volte`);
  for (const t of [`${KR.govForceGear} volte`, `${KR.govForceMin} N`]) has('limitatore.forza', t);
  has('limitatore.fune.sicurezza', `almeno ${KR.govRopeSf} volte`);
  for (const t of [`tra ${KR.railRmMin} e ${KR.railRmMax} N/mm²`, `St = ${it(KR.railStRun812)}`, `${KR.railStGear812.toFixed(1).replace('.', ',')} all’intervento`,
    `${it(KV_VERT.railStRun)} e ${it(KV_VERT.railStGear)}`]) has('guide.rm', t);
  for (const [lim, a, e, b] of KR.omega520) {
    has('guide.rm', `${it(a)}·λ^${it(e)}${b ? ` + ${it(b)}` : ''}`);
    has('guide.rm', `fino a ${lim === 50 ? 'λ ' : ''}${lim}`);
  }
  for (const t of [`k2 = ${it(KV_VERT.k2Running)}`, `${pct(KV_VERT.cwEccWidth)} % della larghezza`, `${pct(KV_VERT.cwEccDepth)} % della profondità`,
    `${KR.cwRailDeflNoGear} mm senza`, `${KV_VERT.railDeflection} mm con il paracadute`]) has('guide.contrappeso.marcia', t);
  has('guide.fp', `${KR.fpTravelMax} m`);
  has('guide.pattini', `${it(KV_VERT.railFlange)}·Fx/c²`);
  for (const t of [`${KV_VERT.entranceH} mm`, `${KR.doorHeightEn8121} mm`]) has('porte.altezza', t);
  for (const t of [`${it(KV_VERT.govTripMin)} volte`, `${KV_VERT.govTripInstant.toFixed(2).replace('.', ',')} m/s`, `${KV_VERT.govTripRoller} m/s istantanea a rullo`,
    `${it(KV_VERT.govTripProgressive)} m/s progressiva fino a ${KV_VERT.govTripProgressiveV} m/s`, `${it(KV_VERT.govTripK)}·v + ${it(KV_VERT.govTripC)}/v`]) has('limitatore.taratura', t);
  has('relazione.strutture', `${pct(KL.loadStruct11)} %`);
  has('limitatore.origine', `${pct(KL.speedDec1)} %`);
});

test('rt-norme: le tabelle della relazione sono nelle voci che le descrivono', () => {
  const sez = voce('relazione.sezioni').valore;
  for (const { key, titolo } of SEZIONI) {
    assert.ok(sez.includes(`«${titolo}»`), titolo);
    for (const n of ['10411-1', '10411-11'] as const) {
      for (const t of [...Object.values(SEZIONI_PER_CASO[key].parti[n]), ...Object.values(SEZIONI_PER_CASO[key].casi[n])]) {
        for (const tok of t ?? []) assert.ok(sez.includes(tok), `${key} ${n}: ${tok}`);
      }
    }
  }
  for (const d of DOCUMENTI) for (const t of [d.titolo, d.clausola['10411-1'], d.clausola['10411-11']]) has('relazione.documenti', t);
  for (const r of REGIMI) has('impianto.regime', r.sigla);
  for (const p of ['rails', 'buffers', 'cw'] as const) for (const n of ['10411-1', '10411-11'] as const) has(`obblighi.rt.${p}`, OBBLIGHI_RT[n][p]?.testo ?? '—');
  has('obblighi.rt.sling', OBBLIGHI_RT['10411-11'].sling?.testo ?? '—');
});

/** Phrases of the third-party template the RT never reproduces (RT plan §5.2), and editions the RT does not cite. */
const DENYLIST = ['Il presente fascicolo si compone', 'non conforme alla Direttiva Ascensori', 'Allegato alla Relazione di Calcolo', 'garantiscono un funzionamento sicuro',
  'paragrafo 6, punto 6.1', 'UNI 10411.1', 'UNI EN 81.20', 'UNI 10411 : 1994', '10411-1:2014', '10411-1:2021', 'DM 1635/1979 (', 'nessuna variazione significativa per le strutture'];
const EDIZIONI: readonly [RegExp, readonly string[]][] = [
  [/UNI 10411-1:(\d{4})/g, ['2024']], [/UNI 10411-11:(\d{4})/g, ['2024']], [/UNI EN 81-20:(\d{4})/g, ['2020']], [/UNI EN 81-50:(\d{4})/g, ['2020']],
  [/UNI EN 81-21:(\d{4})/g, ['2022']], [/UNI EN 81-1:(\d{4})/g, ['1987', '2008', '2010']],
];

test('rt-norme: nessuna frase del modello di terzi, edizioni solo quelle della relazione', () => {
  const testi = [
    ...VOCI_RT.flatMap((v) => [v.titolo, v.valore, v.riferimento, v.fonte, v.nota ?? '']),
    ...Object.values(OBBLIGHI_RT).flatMap((o) => Object.values(o).flatMap((p) => (p ? [p.rif, p.testo] : []))),
    ...DOCUMENTI.flatMap((d) => [d.titolo, d.quando, ...Object.values(d.clausola)]), ...REGIMI.flatMap((r) => [r.sigla, r.nota ?? '']),
  ];
  for (const t of testi) {
    for (const d of DENYLIST) assert.ok(!t.includes(d), `«${d}» in «${t}»`);
    for (const [re, ok] of EDIZIONI) for (const m of t.matchAll(re)) assert.ok(ok.includes(m[1] ?? ''), `${m[0]} in «${t}»`);
  }
});

test('rt-norme: verifiche e obblighi della relazione fuori dal perimetro del collaudo (chiave di ambito-version)', () => {
  const ambito: Readonly<Record<string, unknown>> = { ...AMBITO_VERIFICHE, ...AMBITO_10411_1 };
  for (const id of RT_NEW_CHECK_IDS) assert.ok(!(id in ambito), id);
  for (const n of ['10411-1', '10411-11'] as const) for (const p of ['rails', 'buffers', 'cw'] as const) assert.equal(OBBLIGHI_PARTI[n][p], undefined, `${n} ${p}`);
  assert.match(RT_ENGINE_VERSION, /^\d+\.\d+\.\d+$/);
});
