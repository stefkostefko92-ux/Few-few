// The sections of the relazione tecnica di modifica (round 49, RT plan §4.3): every clause token of a case is in that
// case's text of OBBLIGHI_VARIAZIONI and every part token in that part's entry of our registries (consistency of our
// registries, no norm text); for any parts and cases the sections hold at least what the table asks and nothing else;
// a section added by hand never takes one out; the path decides the machine room and the shaft; the scenarios of the
// plan (§11.4) with the cases the documents give; a «Trasformazione completa» has no RT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS } from '@/calc/presets';
import { VOCI_VANO } from '@/shaft/norme';
import { NORMA_SIGLA, PARTI, type Collaudo, type Parte } from '@/lib/lift/collaudo';
import { OBBLIGHI_PARTI } from '@/lib/lift/obblighi';
import { OBBLIGHI_VARIAZIONI } from '@/lib/lift/obblighi-variazioni';
import type { Carichi, Libretto, Norma10411 } from '@/lib/lift/modifica';
import { ADAPT } from '@/lib/present/adapt';
import { OBBLIGHI_RT } from '@/lib/rt/norme';
import { ORDINE_CASI, SEZIONI, SEZIONI_PER_CASO, disponibile, idoneoRt, sezioniDa, sezioniOf, type BaseSezioni, type ContestoSezioni } from '@/lib/rt/sezioni';
import { SEZIONE_KEYS, type SezioneKey } from '@/lib/rt/types';

const CALC = JSON.parse(readFileSync(new URL('../../../messages/calc/it.json', import.meta.url), 'utf8')) as Record<string, string>;
const NORME: readonly Norma10411[] = ['10411-1', '10411-11'];
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A clause token in a registry's reference and text: «16 g)» — the point in the reference, the letter in either;
 *  «6.1», «6.1–6.13», «App. D» — whole, never inside a longer number (6.1 is not in 6.10). */
function trovato(token: string, rif: string, testo: string): boolean {
  const num = (s: string): RegExp => new RegExp(`(?<![\\d.])${esc(s)}(?!\\d|\\.\\d)`);
  const lettera = /^(\d+(?:\.\d+)*) ([a-z]\))$/.exec(token);
  if (lettera) return num(lettera[1] ?? '').test(rif) && new RegExp(`(?<![\\p{L}\\d])${esc(lettera[2] ?? '')}`, 'u').test(`${rif} ${testo}`);
  return num(token).test(`${rif} ${testo}`);
}

/** Where a part's tokens must be: its obligation (OBBLIGHI_PARTI, else the RT's own), the machine's adaptations and the
 *  references of the shaft's registry to its part of UNI 10411 (the machine room). */
function fontiParte(n: Norma10411, p: Parte): { rif: string; testo: string }[] {
  const a = OBBLIGHI_PARTI[n][p], b = p === 'rails' || p === 'buffers' || p === 'cw' || p === 'sling' ? OBBLIGHI_RT[n][p] : undefined;
  const out = [a, b].flatMap((x) => (x ? [{ rif: x.rif, testo: x.testo }] : []));
  if (p === 'machine') {
    out.push({ rif: NORMA_SIGLA[n], testo: n === '10411-1' ? [...ADAPT, 'a_src'].map((k) => CALC[k] ?? '').join(' ') : CALC.a_11 ?? '' });
    for (const v of VOCI_VANO) for (const m of v.riferimento.matchAll(new RegExp(`UNI ${esc(n)}:2024, ([^;]*)`, 'g'))) out.push({ rif: m[1] ?? '', testo: '' });
  }
  return out;
}

test('rt-sezioni: ogni clausola di un caso è nel testo dello stesso caso di OBBLIGHI_VARIAZIONI', () => {
  for (const { key } of SEZIONI) for (const n of NORME) for (const [c, tokens] of Object.entries(SEZIONI_PER_CASO[key].casi[n])) {
    const o = OBBLIGHI_VARIAZIONI[n][c as keyof (typeof OBBLIGHI_VARIAZIONI)[typeof n]];
    assert.ok(o, `${key} ${n}: caso ${c} senza obbligo`);
    for (const t of tokens ?? []) assert.ok(trovato(t, o.rif, o.testo), `${key} ${n} ${c}: «${t}» non in «${o.rif}: ${o.testo}»`);
  }
});

test('rt-sezioni: ogni clausola di una parte è nel suo obbligo (OBBLIGHI_PARTI, OBBLIGHI_RT, adeguamenti della macchina)', () => {
  for (const { key } of SEZIONI) for (const n of NORME) for (const [p, tokens] of Object.entries(SEZIONI_PER_CASO[key].parti[n])) {
    const fonti = fontiParte(n, p as Parte);
    assert.ok(fonti.length, `${key} ${n}: parte ${p} senza obbligo`);
    for (const t of tokens ?? []) assert.ok(fonti.some((f) => trovato(t, f.rif, f.testo)), `${key} ${n} ${p}: «${t}»`);
  }
});

/** What the table asks: the section is in on this path and one of its parts or cases is the record's (the machine room
 *  always on the room path). */
const richiesta = (key: SezioneKey, x: ContestoSezioni): boolean => disponibile(key, x) && ((key === 'locale' && x.path === 'locale')
  || x.parti.some((p) => SEZIONI_PER_CASO[key].parti[x.norma][p]) || x.casi.some((c) => SEZIONI_PER_CASO[key].casi[x.norma][c]));

function rng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

test('rt-sezioni: per ogni insieme di parti e di casi, le sezioni sono esattamente quelle della tabella; quelle a mano non ne tolgono', () => {
  const r = rng(49);
  const casi = [...ORDINE_CASI];
  for (let i = 0; i < 4000; i++) {
    const x: ContestoSezioni = {
      norma: r() < 0.5 ? '10411-1' : '10411-11', path: r() < 0.5 ? 'locale' : 'vano', localeSulVano: r() < 0.5,
      parti: PARTI.filter(() => r() < 0.25), casi: casi.filter(() => r() < 0.2),
    };
    const manuali = SEZIONE_KEYS.filter(() => r() < 0.3).map((key) => ({ key, motivo: `motivo ${key}` }));
    const sole = sezioniDa(x), con = sezioniDa(x, manuali);
    assert.deepEqual(sole.map((s) => s.key), SEZIONI.map((s) => s.key).filter((k) => richiesta(k, x)), JSON.stringify(x));
    assert.ok(sole.every((s) => s.automatica && s.motivi.length && !s.manuale));
    // the hand never takes a section out, nor makes an automatic one manual
    assert.deepEqual(con.filter((s) => s.automatica), sole);
    for (const m of manuali) {
      const s = con.find((y) => y.key === m.key), auto = richiesta(m.key, x);
      if (auto) assert.equal(s?.manuale, undefined, m.key);
      else if (disponibile(m.key, x)) assert.deepEqual([s?.automatica, s?.manuale, s?.motivi[0]?.testo], [false, true, m.motivo], m.key);
      else assert.equal(s, undefined, `${m.key} fuori dal percorso`);
    }
    // the document's order
    const ordine = SEZIONI.map((s) => s.key);
    assert.deepEqual(con.map((s) => s.key), ordine.filter((k) => con.some((s) => s.key === k)));
  }
});

test('rt-sezioni: ogni parte e ogni caso da soli, sui due percorsi e con le due parti della UNI 10411', () => {
  for (const norma of NORME) for (const path of ['locale', 'vano'] as const) {
    for (const p of PARTI) {
      const x: ContestoSezioni = { norma, path, parti: [p], casi: [], localeSulVano: false };
      assert.deepEqual(sezioniDa(x).map((s) => s.key), SEZIONI.map((s) => s.key).filter((k) => richiesta(k, x)), `${norma} ${path} ${p}`);
    }
    for (const c of ORDINE_CASI) {
      const x: ContestoSezioni = { norma, path, parti: [], casi: [c], localeSulVano: false };
      assert.deepEqual(sezioniDa(x).map((s) => s.key), SEZIONI.map((s) => s.key).filter((k) => richiesta(k, x)), `${norma} ${path} ${c}`);
    }
  }
  // the cases that only bring points add no section
  for (const c of ['travelOver8', 'travelDown', 'speedWithin', 'speedWithin50', 'speedDocumentati', 'travelDocumentati'] as const) {
    assert.deepEqual(sezioniDa({ norma: '10411-1', path: 'vano', parti: [], casi: [c], localeSulVano: false }), [], c);
  }
});

const DOC: Carichi = { Q: 630, P: 700, Mcw: 1015 }, LIB: Libretto = { v: 1, H: 18 };
const base = (norma: Norma10411, parti: readonly Parte[], o: { path?: 'locale' | 'vano'; doc?: Carichi; lib?: Libretto; V?: Record<string, number>; room?: boolean } = {}): BaseSezioni => ({
  path: o.path ?? 'locale', norma, collaudo: { norma, parti, documentato: o.doc ?? DOC, libretto: o.lib ?? LIB } satisfies Pick<Collaudo, 'norma' | 'parti' | 'documentato' | 'libretto'>,
  values: { ...PRESETS.B, ...o.V }, ...(o.path === 'vano' ? { lift: { layout: { inputs: { room: o.room ? {} : null } } } } : {}),
});
const keys = (b: BaseSezioni): SezioneKey[] => sezioniOf(b).map((s) => s.key);
const motivo = (b: BaseSezioni, k: SezioneKey): string[] => sezioniOf(b).find((s) => s.key === k)?.motivi.map((m) => m.clausola) ?? [];

test('rt-sezioni: scenari — Solo argano sul locale, carichi oltre il prospetto 1, velocità, corsa, -11', () => {
  // «Solo argano» on the room path, the documented loads and speed the calculation's: ropes, machine, machine room
  assert.deepEqual(keys(base('10411-1', ['machine', 'ropes'])), ['funi', 'argano', 'locale']);
  // the rated load beyond prospetto 1 (Q ≤ 500 kg: +12,5 %), with the ratio changed
  const p1 = base('10411-1', ['machine', 'ropes', 'load'], { doc: { Q: 400, P: 600, Mcw: 825 }, V: { Q: 450, P: 600, k: 0.5 } });
  assert.deepEqual(keys(p1), ['quadro', 'cabina', 'funi', 'argano', 'locale', 'guideCabina', 'ammortizzatori', 'limitatore', 'contrappeso']);
  assert.deepEqual(motivo(p1, 'contrappeso'), ['UNI 10411-1:2024, 6.1'], 'il rapporto tra i carichi cambiato');
  assert.deepEqual(motivo(p1, 'quadro'), ['UNI 10411-1:2024, 6.11']);
  assert.deepEqual(motivo(p1, 'ammortizzatori'), ['UNI 10411-1:2024, 6.4', 'UNI 10411-1:2024, 6.1']);
  // the speed up 8 % on the shaft path: every section of 15.2–15.15, the shaft's too
  const up = base('10411-1', ['machine', 'ropes', 'speed'], { path: 'vano', V: { v: 1.08 } });
  assert.deepEqual(keys(up), ['quadro', 'funi', 'argano', 'guideCabina', 'guideContrappeso', 'ammortizzatori', 'limitatore', 'porte', 'contrappeso', 'vano']);
  assert.deepEqual(motivo(up, 'vano'), ['UNI 10411-1:2024, 15.11 e 15.12']);
  // the speed down 6 %: buffers (15.2) and the governor within the limits at installation (15.17)
  const down = base('10411-1', ['machine', 'ropes', 'speed'], { path: 'vano', V: { v: 0.94 } });
  assert.deepEqual(keys(down), ['funi', 'argano', 'ammortizzatori', 'limitatore']);
  assert.deepEqual(motivo(down, 'limitatore'), ['UNI 10411-1:2024, 15.17']);
  // the travel up 9 m: new installation's point (no section of its own) and 16 a)–l)
  const corsa = base('10411-1', ['machine', 'ropes', 'travel'], { path: 'vano', lib: { v: 1, H: 9 } });
  assert.deepEqual(keys(corsa), ['quadro', 'funi', 'argano', 'guideCabina', 'guideContrappeso', 'limitatore', 'porte', 'contrappeso', 'vano']);
  // -11 with T* increased (any increase): 6.2–6.13
  const ce = base('10411-11', ['machine', 'ropes', 'load'], { doc: { Q: 600, P: 700, Mcw: 1015 } });
  assert.deepEqual(keys(ce), ['quadro', 'cabina', 'funi', 'argano', 'locale', 'guideCabina', 'ammortizzatori', 'limitatore']);
  assert.deepEqual(motivo(ce, 'argano'), ['UNI 10411-11:2024, 14', 'UNI 10411-11:2024, 6.10 e 6.12']);
  // -11 with the counterweight increased: 6.2–6.13 but the sling (6.1) — the gear and governor (6.6, 6.7), the load control
  // (6.11), ACOP/UCM and the machine (6.10, 6.12) too, never the car (6.9)
  const cw = sezioniDa({ norma: '10411-11', path: 'locale', parti: [], casi: ['loadP2'], localeSulVano: false }).map((x) => x.key);
  assert.deepEqual(cw, ['quadro', 'funi', 'argano', 'locale', 'guideCabina', 'guideContrappeso', 'ammortizzatori', 'limitatore', 'contrappeso']);
  assert.ok(!cw.includes('cabina'), 'l’arcata (6.9) no');
  const cw1 = sezioniDa({ norma: '10411-1', path: 'locale', parti: [], casi: ['loadP2'], localeSulVano: false }).map((x) => x.key);
  assert.ok(!cw1.includes('limitatore') && !cw1.includes('quadro'), 'con la -1 il prospetto 2 porta 6.4, 6.5, 6.8, 6.13–6.15');
});

test('rt-sezioni: il locale del macchinario sul vano solo con il locale disegnato e la macchina o il locale tra le parti; il vano mai sul locale', () => {
  assert.ok(!keys(base('10411-1', ['machine', 'ropes', 'controller'], { path: 'vano', room: false })).includes('locale'));
  assert.ok(keys(base('10411-1', ['machine', 'ropes', 'controller'], { path: 'vano', room: true })).includes('locale'));
  assert.ok(!keys(base('10411-1', ['controller', 'landingDoors'], { path: 'vano', room: true })).includes('locale'));
  const s = sezioniOf(base('10411-1', ['machine'], { V: { v: 1.08 } }), { sezioniManuali: [{ key: 'vano', motivo: 'spazi in testata' }] });
  assert.ok(!s.some((x) => x.key === 'vano'), 'il vano non si aggiunge sul percorso del locale');
  // the machine room on the room path even without a part of its own: the survey is the RT's
  const l = sezioniDa({ norma: '10411-1', path: 'locale', parti: ['ropes'], casi: [], localeSulVano: false }).find((x) => x.key === 'locale');
  assert.deepEqual(l?.motivi.map((m) => m.tipo), ['percorso']);
});

test('rt-sezioni: la «Trasformazione completa» e il collaudo secondo la UNI EN 81-20/50 non hanno la relazione', () => {
  assert.equal(idoneoRt('TRASFORMAZIONE_COMPLETA', 'en81'), 'trasformazione');
  assert.equal(idoneoRt('TRASFORMAZIONE_COMPLETA', '10411-1'), 'trasformazione');
  assert.equal(idoneoRt('AMMODERNAMENTO', 'en81'), 'en81');
  assert.equal(idoneoRt('SOLO_ARGANO', '10411-1'), null);
  assert.equal(idoneoRt('AMMODERNAMENTO', '10411-11'), null);
});
