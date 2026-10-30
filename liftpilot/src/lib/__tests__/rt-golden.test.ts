// The golden of the relazione tecnica di modifica (RT plan §10, S3): the four fixtures (fixtures/rt/scenari.ts) derived by
// the RT engine give the pinned results — a readable summary and the SHA-256 of everything the document prints —; the
// derivation is deterministic, every check has its clause and sits in an included section, the verdict counts what the
// modification requires, nothing prints NaN or a silent zero; the shaft path without options repeats sheet 1's rails bit
// for bit; the snapshot names the files by their place, never by a database id. After an intended change: bump
// RT_ENGINE_VERSION, `npx tsx scripts/rt-golden-export.ts "<motivo>"`, pin the version again (rt-version.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { railChecks } from '../tavole/rail-check';
import { sheetRails } from '../tavole/sheet-loads';
import { deriveRt } from '../rt/derive';
import { inputsDelSnapshot, rtResults, rtSnapshot, rtVerdict } from '../rt/snapshot';
import type { RtDerived } from '../rt/types';
import { resultsSha, riassunto } from './fixtures/rt/riassunto';
import { SCENARI, type Scenario } from './fixtures/rt/scenari';

interface GoldenCase { nome: string; resultsSha: string; riassunto: ReturnType<typeof riassunto> }
const golden = JSON.parse(readFileSync(new URL('./fixtures/rt/golden.json', import.meta.url), 'utf8')) as { engine: string; cases: GoldenCase[] };
const runs: { s: Scenario; d: RtDerived }[] = SCENARI.map((f) => { const s = f(); return { s, d: deriveRt(s.base, s.inputs, s.anagrafica, s.plant, s.allegati) }; });
const run = (nome: string): { s: Scenario; d: RtDerived } => { const r = runs.find((x) => x.s.nome === nome); assert.ok(r, nome); return r; };

test('golden RT: i quattro impianti danno i risultati fissati', () => {
  assert.deepEqual(runs.map((r) => r.s.nome), golden.cases.map((c) => c.nome));
  for (const { s, d } of runs) {
    const g = golden.cases.find((c) => c.nome === s.nome);
    assert.ok(g);
    assert.deepEqual(riassunto(d), g.riassunto, `${s.nome}: riassunto`);
    assert.equal(resultsSha(d), g.resultsSha, `${s.nome}: SHA dei risultati`);
  }
});

test('golden RT: derivazione deterministica, riferimenti, sezioni, esito, nessun NaN', () => {
  for (const { s, d } of runs) {
    const again = SCENARI.map((f) => f()).find((x) => x.nome === s.nome);
    assert.ok(again);
    assert.equal(resultsSha(deriveRt(again.base, again.inputs, again.anagrafica, again.plant, again.allegati)), resultsSha(d), `${s.nome}: deterministica`);
    const keys = d.sezioni.map((x) => x.key);
    for (const c of d.checks) {
      assert.ok(c.ref.length > 3, `${s.nome}/${c.id}: riferimento`);
      assert.ok(keys.includes(c.sezione), `${s.nome}/${c.id}: sezione ${c.sezione} non inclusa`);
      if (c.mancanti) assert.ok(c.value === null && c.status === 'warn', `${s.nome}/${c.id}: dati mancanti, mai uno zero`);
    }
    assert.deepEqual(d.componenti.map((c) => c.sezione), keys, `${s.nome}: un componente per sezione, nell’ordine`);
    const v = rtVerdict(d.checks);
    assert.deepEqual([d.verdict, d.failCount, d.warnCount], [v.verdict, v.failCount, v.warnCount]);
    assert.ok(!/NaN|Infinity|undefined|\[object/.test(JSON.stringify(rtResults(d))), `${s.nome}: valori stampabili`);
    assert.ok(d.punti.every((p) => p.punto.rif && p.punto.testo), `${s.nome}: punti con riferimento e testo`);
  }
});

test('Solo argano nel locale: funi, argano e locale; con la portata oltre il prospetto 1 le sezioni dei casi di carico', () => {
  const a = run('locale-solo-argano').d, p = run('locale-solo-argano-p1').d;
  assert.deepEqual(a.sezioni.map((x) => x.key), ['funi', 'argano', 'locale']);
  for (const k of ['quadro', 'cabina', 'guideCabina', 'ammortizzatori', 'limitatore'] as const) {
    const sez = p.sezioni.find((x) => x.key === k);
    assert.ok(sez?.motivi.some((m) => m.chiave === 'loadP1'), `${k} per 6.x`);
  }
  assert.equal(p.strutture.esito, 'documento');
  assert.equal(p.documenti.find((x) => x.id === 'idoneita_strutture')?.stato, 'da_allegare');
  // the ratio changed: D.1 and D.2 in the ropes' section
  assert.ok(p.checks.some((c) => c.id === 'tr_d1' && c.sezione === 'funi') && p.checks.some((c) => c.id === 'tr_d2'));
  // the springs' force missing on the counterweight's side: a warning with its field and a point on site
  const m = p.checks.find((c) => c.id === 'rt_buf_spring' && c.caso === 'contrappeso');
  assert.deepEqual(m?.mancanti, ['componenti.ammortizzatori.contrappeso.forzaCorsaCompleta']);
  assert.ok(p.punti.some((x) => x.tipo === 'sito' && x.sezione === 'ammortizzatori' && x.punto.testo.includes('forza a corsa completa — ammortizzatori del contrappeso')));
});

test('Ammodernamento nel vano con la velocità +8 %: 15.x, limitatore richiesto, guide come il foglio 1 bit per bit', () => {
  const { s, d } = run('vano-ammodernamento-velocita');
  assert.ok(d.sezioni.find((x) => x.key === 'limitatore')?.motivi.some((m) => m.chiave === 'speedUp' && m.clausola.includes('15.13')));
  assert.equal(d.checks.find((c) => c.id === 'rt_gov_trip')?.ambito, 'richiesta');
  assert.equal(d.checks.find((c) => c.id === 'rt_gov_origin')?.status, 'ok', 'limitatore nuovo (18): il limite d’origine');
  const L = s.base.lift?.layout;
  assert.ok(L);
  const { I } = s.base.analysis.ctx, R = sheetRails(L, I.P, I.Q, s.plant);
  const sheet = railChecks(R.rc, R.gear, I.v).filter((c) => c.id !== 'sg_type');
  const rt = d.checks.filter((c) => c.sezione === 'guideCabina');
  assert.deepEqual(rt.map((c) => [c.id, c.value, c.limit, c.status]), sheet.map((c) => [c.id, c.value, c.limit, c.status]));
});

test('impianto CE (UNI 10411-11) con i carichi aumentati: regime DPR 162/1999, nessuna regola d’origine del limitatore', () => {
  const { d } = run('vano-ce-carico');
  assert.equal(d.norma, '10411-11');
  assert.deepEqual([d.regime.legge, d.regime.coerente, d.regime.emettibile], ['dpr_162_1999', true, true]);
  assert.ok(!d.checks.some((c) => c.id === 'rt_gov_origin'));
  assert.ok(d.sezioni.find((x) => x.key === 'cabina')?.motivi.some((m) => m.chiave === 'car'));
  assert.ok(d.checks.some((c) => c.id === 'v_area' && c.ambito === 'richiesta'));
});

test('snapshot: i file per posto nella relazione, mai per id; i record della base con id, SHA e motore', () => {
  const { s, d } = run('locale-solo-argano');
  const inputs = { ...s.inputs, documenti: { libretto: 'att0libretto', funi_cert: 'separato' as const }, componenti: { quadro: { fonte: { tipo: 'targa' as const, rif: 'Targa', attachmentId: 'att0funi' } } } };
  const x = inputsDelSnapshot(inputs, s.allegati);
  assert.ok(!JSON.stringify(x).includes('att0'), 'nessun id di file');
  assert.deepEqual((x as { documenti: unknown }).documenti, { libretto: 1, funi_cert: 'separato' });
  assert.ok(JSON.stringify(x).includes('"allegato":2'));
  const snap = rtSnapshot({ number: '26-001', revision: 0, revisions: [], base: s.base, tipo: s.base.tipo, collaudo: s.base.collaudo, anagrafica: s.anagrafica,
    projectData: { name: 'R' }, plant: s.plant, company: { name: 'S', logoSha256: null }, inputs, allegati: s.allegati, results: rtResults(d), docSha: 'f'.repeat(64) });
  const base = (snap as { base: Record<string, unknown> }).base;
  assert.deepEqual(Object.keys(base), ['path', 'calc', 'room']);
  assert.deepEqual(Object.keys(base.calc as object), ['id', 'sha256', 'engineVersion']);
  assert.equal((snap as { engine: string }).engine, golden.engine);
});
