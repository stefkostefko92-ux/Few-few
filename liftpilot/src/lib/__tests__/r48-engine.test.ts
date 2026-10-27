// Round 48, the engine's corrections: D.2 (UNI 10411-1:2024, 6.1 and App. D) met or not beside D.1 whenever the ratio of
// the suspended loads changes (tr_d2); the rated speed over 0,15 m/s on every input path (UNI EN 81-20:2020, 1.3 a) 2));
// the notified body's points of a lift placed on the market only for a lift tested as new; the brake's row of the
// summary «Attenzione» when no torque keeps the traction at the real deceleration; the acceptance test's sub-case of UNI
// EN 81-20:2020 6.3.3 named as shown; the checklist's «confermato» as the registry's; the profile's title.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import appIt from '../../../messages/it.json';
import calcIt from '../../../messages/calc/it.json';
import { brakeWindow, compute } from '@/calc/compute';
import { readInputs } from '@/calc/inputs';
import { K, PROFILO, VOCI } from '@/calc/norme';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { PLANT } from '@/components/calc/fields';
import { VOCI_VANO } from '@/shaft';
import { ambitoOf, collaudoOf, defaultLift, deriveLift, type Collaudo, type LiftInputs } from '@/lib/lift';
import { shaftInputsSchema } from '../shaft-input';
import { NO_MARKS } from '../lift/marks';
import { carichiOf, type Carichi } from '../lift/modifica';
import { d1Check, d2Check, d2Di, rapportoChecks } from '../lift/rapporto';
import { snapshotOf } from '@/calc/snapshot';
import type { ShaftCheck } from '@/shaft/types';
import { calcExtra, calcVerdictOf } from '../lift/calc-verdict';
import { senzaSostituite } from '../lift/sostituite';
import { analyse } from '../present/analysis';
import { quickRows } from '../present/quick';
import { summaryText } from '../present/summary';
import { textsFor, verdictStatus } from '../present/texts';
import { agrees, calcList, countsExtra } from '../verdict-checks';
import { makePres } from '../present/tr';
import { buildReport } from '../report/build';
import { adempimentiBlocks } from '../report/collaudo';
import type { ReportDoc } from '../report/model';

const DAY = new Date('2026-10-16T08:00:00Z');
const project = { name: 'Impianto r48', address: null, city: 'Monza', province: 'MB', plantNumber: null, client: null };
const calc = { id: 'cmtestr48', label: null, createdAt: DAY, sha256: 'f'.repeat(64), engineVersion: '1.8.0', profileId: 'IT-2026.1', author: null };
const text = (doc: ReportDoc): string => JSON.stringify(doc.blocks);
const P = makePres(calcIt, 'it-IT'), X = textsFor(P);

// the reviewers' case: preset C with a heavier car, three 10 mm ropes on a 440 mm sheave, a 105° undercut, tested to
// UNI 10411-1 with documented loads whose ratio differs from the design's (P 700 → 900, the counterweight documented)
const N1: FormValues = { ...PRESETS.C, P: 900, n_n: 3, n_d: 10, n_D: 440, n_beta: 105, n_Fmin: 120, n_qf: 0.35, n_shaftMax: 4000, n_brakeNm: 70 };
const N1_C: Collaudo = collaudoOf(N1, { norma: '10411-1', parti: ['machine'], documentato: { Q: 630, P: 700, Mcw: 700 + 0.5 * 630 } });
const report = (V: FormValues, C: Collaudo, tipo: Parameters<typeof buildReport>[0]['tipo'] = null): ReportDoc =>
  buildReport({ calc, project, company: 'Ditta di prova', values: V, reviews: [], marks: { ...NO_MARKS, collaudo: C }, tipo });

test('T5: D.2 accanto alla D.1 — il caso dei revisori non è più «superato»', () => {
  const d1 = d1Check(N1_C, N1), d2 = d2Check(N1_C, N1);
  assert.equal(d1?.status, 'ok', 'D.1 met');
  assert.equal(d2?.id, 'tr_d2');
  assert.equal(d2?.status, 'fail', 'D.2 not met: 11,21 > 8,25 N/mm²');
  // the same pressure and limit as compute()'s g_press, bit for bit; g_press stays a value to state (info/warn)
  const { I, N } = readInputs(N1), g = compute(I, N).checks.find((c) => c.id === 'g_press');
  assert.equal(d2?.value, g?.value);
  assert.equal(d2?.limit, g?.limit);
  assert.equal(g?.status, 'warn');
  assert.equal(ambitoOf(N1_C, 'tr_d2'), 'applies');
  assert.deepEqual(rapportoChecks(N1_C, N1).map((c) => c.id), ['tr_d1', 'tr_d2']);
  // the relazione: the table of D.2, its sentence among the change of the loads, UNI 10411-1's result not passed
  const doc = report(N1, N1_C), all = text(doc);
  assert.ok(all.includes('Pressione specifica delle funi nelle gole con il rapporto tra i carichi cambiato (UNI 10411-1:2024, 6.1 e D.2)'));
  assert.ok(all.includes('Pressione specifica nelle gole (D.2): 11,21 N/mm² con il limite di 8,25 N/mm², ⚠ non verificata.'));
  const esiti = doc.blocks.find((b) => b.t === 'grid' && b.head[0] === 'Normativa');
  assert.ok(esiti && esiti.t === 'grid');
  assert.equal(esiti.status?.[0], 'fail', 'la UNI 10411-1 non superata');
  assert.ok(VOCI_VANO.some((v) => v.id === 'rapporto.d2' && v.verifiche?.includes('tr_d2') && v.riferimento === 'UNI 10411-1:2024, 6.1 e D.2'));
  assert.ok(appIt.shaft.c_tr_d2.includes('D.2'));
});

/** The relazione's line of the machine verified: the verdict block after «Argano verificato». */
const arganoLine = (doc: ReportDoc): Extract<ReportDoc['blocks'][number], { t: 'verdict' }> => {
  const at = doc.blocks.findIndex((b) => b.t === 'h2' && b.text.endsWith('Argano verificato'));
  const v = doc.blocks.slice(at).find((b) => b.t === 'verdict');
  assert.ok(at >= 0 && v && v.t === 'verdict', 'the line of «Argano verificato»');
  return v;
};
const named = (xs: readonly ShaftCheck[]) => xs.map((c) => ({ ...c, label: c.id === 'tr_d1' ? appIt.shaft.c_tr_d1 : appIt.shaft.c_tr_d2 }));

test('T5: l’esito del calcolo conta la D.1 e la D.2 — il caso dei revisori non superato ovunque', () => {
  const { I, N } = readInputs(N1), res = compute(I, N), warns = res.checks.filter((c) => c.status === 'warn').length;
  assert.equal(res.fails.length, 0, 'the engine\'s checks alone pass');
  const v = calcVerdictOf(res, N1_C, N1);
  assert.equal(v.status, 'fail');
  assert.equal(v.fails, 1, 'D.2');
  assert.equal(v.warns, warns, 'D.1 met: no warning added');
  assert.deepEqual(v.extra.map((c) => [c.id, c.status]), [['tr_d1', 'ok'], ['tr_d2', 'fail']]);
  // the screen's head (Verdict.tsx) and the relazione's line: the machine's, not «Verifiche superate»
  assert.equal(X.countsText(v.fails, v.warns), calcIt.verdict_ko1);
  const line = arganoLine(report(N1, N1_C));
  assert.equal(line.status, 'fail');
  assert.equal(line.text, `Verifiche dell’argano: ${calcIt.verdict_ko1} — ${calcIt.indicative}`);
  assert.ok(!line.text.includes('Verifiche superate'));
  // the copied summary: counted and named, D.2 among the checks with its value and limit
  const sum = summaryText(P, X, analyse(N1), { badVisible: 0, extra: named(v.extra) });
  assert.ok(sum.includes(`${calcIt.g_new}: ${calcIt.verdict_ko1}: ${appIt.shaft.c_tr_d2}`), sum);
  assert.ok(sum.includes(`- ${appIt.shaft.c_tr_d2}: ${calcIt.st_fail} (11,21 MPa / ≤ 8,25 MPa)`), sum);
});

test('T5: l’esito del calcolo senza il rapporto cambiato, o con la D.1 e la D.2 superate, resta quello del motore (con il foglio funi, round 52)', () => {
  const V: FormValues = { ...PRESETS.C, context: 'repl', compare: false }, o = carichiOf(V) as Carichi;
  const { I, N } = readInputs(V), res = compute(I, N);
  const count = (xs: readonly { status: string }[], s: string): number => xs.filter((c) => c.status === s).length;
  for (const C of [collaudoOf(V, { norma: '10411-1', parti: ['machine'] }), collaudoOf(V), collaudoOf(V, { norma: '10411-1', parti: ['machine'], documentato: { Q: o.Q, P: o.P - 100, Mcw: o.Mcw } })]) {
    // the engine's checks (S_f out where z of the rope sheet stands in for it) and the sheet's: D.1 and D.2 of a changed
    // ratio met, none other added
    const v = calcVerdictOf(res, C, V), engine = senzaSostituite(res.checks, v.extra);
    assert.ok(v.extra.filter((c) => c.id.startsWith('tr_')).every((c) => c.status === 'ok'));
    assert.ok(v.extra.every((c) => c.id.startsWith('tr_') || c.id.startsWith('fm_')));
    assert.equal(v.fails, count(engine, 'fail') + count(v.extra, 'fail'));
    assert.equal(v.warns, count(engine, 'warn') + count(v.extra, 'warn'));
    assert.equal(arganoLine(report(V, C)).text, `Verifiche dell’argano: ${X.countsText(v.fails, v.warns)} — ${calcIt.indicative}`);
  }
  // a lift tested as new (UNI EN 81-20/50): the engine's alone
  const nuovo = calcVerdictOf(res, collaudoOf({ ...V, context: 'new' }), V);
  assert.deepEqual([nuovo.status, nuovo.extra], [verdictStatus(res), []]);
  // only what the test takes: the -11 asks none
  assert.deepEqual(calcExtra(collaudoOf(V, { norma: '10411-11', parti: ['machine'], documentato: { Q: o.Q, P: o.P - 100, Mcw: o.Mcw } }), V), []);
});

test('T5: il pannello della pillola dice quello che conta un calcolo 1.8.0; uno di prima resta com’era', () => {
  const { I, N } = readInputs(N1), v = calcVerdictOf(compute(I, N), N1_C, N1);
  const list = calcList(snapshotOf(N1).results, calcExtra(N1_C, N1));
  assert.ok(agrees(list, { failCount: v.fails, warnCount: v.warns }), JSON.stringify(list));
  assert.deepEqual(list.fails.map((c) => c.id), ['tr_d2']);
  assert.ok(countsExtra(calc.engineVersion));
  for (const ver of ['1.8.0', '1.8.1', '1.10.0', '2.0.0']) assert.ok(countsExtra(ver), ver);
  for (const ver of ['1.7.9', '1.7.3', '0.9.0', 'x', '']) assert.ok(!countsExtra(ver), ver);
});

test('T5: un caso che passa, e nessuna D.2 senza il rapporto cambiato, con la -11 o con un impianto nuovo', () => {
  const V: FormValues = { ...PRESETS.C, context: 'repl', compare: false }, o = carichiOf(V) as Carichi;
  const C = collaudoOf(V, { norma: '10411-1', parti: ['machine'], documentato: { Q: o.Q, P: o.P - 100, Mcw: o.Mcw } });
  const d2 = d2Check(C, V), d = d2Di(C, V);
  assert.equal(d2?.status, 'ok');
  assert.ok(d && d.p <= d.limit);
  assert.ok(text(report(V, C)).includes(', verificata.'));
  // the ratio kept (every load in the same proportion), no documented loads, -11: none
  assert.equal(d2Check(collaudoOf(V, { norma: '10411-1', parti: ['machine'], documentato: { Q: o.Q / 1.04, P: o.P / 1.04, Mcw: o.Mcw / 1.04 } }), V), null);
  assert.equal(d2Check(collaudoOf(V, { norma: '10411-1', parti: ['machine'] }), V), null);
  const C11 = collaudoOf(V, { norma: '10411-11', parti: ['machine'], documentato: { Q: o.Q, P: o.P - 100, Mcw: o.Mcw } });
  assert.equal(d2Check(C11, V), null);
  assert.equal(ambitoOf(C11, 'tr_d2'), 'existing');
  assert.equal(ambitoOf({ norma: 'en81', parti: C.parti }, 'tr_d2'), 'existing');
});

test('T5: la D.2 tra le verifiche del progetto dell’ascensore', () => {
  const base: LiftInputs = { ...defaultLift(), calc: { ...defaultLift().calc, context: 'repl', keepRopes: false } };
  const now = carichiOf(deriveLift({ ...base, collaudo: { norma: '10411-1', parti: ['machine'] } }).values) as Carichi;
  const d = deriveLift({ ...base, collaudo: { norma: '10411-1', parti: ['machine'], documentato: { Q: now.Q, P: now.P - 100, Mcw: now.Mcw } } });
  const ids = d.supportChecks.map((c) => c.id);
  assert.ok(ids.includes('tr_d1') && ids.includes('tr_d2'));
  assert.equal(ids.indexOf('tr_d2'), ids.indexOf('tr_d1') + 1, 'next to D.1');
  assert.ok(!deriveLift({ ...base, collaudo: { norma: '10411-1', parti: ['machine'] } }).supportChecks.some((c) => c.id === 'tr_d2'));
});

test('T6: velocità nominale oltre 0,15 m/s su ogni via d’ingresso', () => {
  assert.equal(K.vRatedMin, 0.15);
  for (const v of ['0.15', '0,15', '0.1', '0.05']) assert.ok(readInputs({ ...PRESETS.A, v }).bad.includes('v'), `v ${v}`);
  for (const v of ['0.16', '1']) assert.ok(!readInputs({ ...PRESETS.A, v }).bad.includes('v'), `v ${v}`);
  // the Progetto: the speed is the shaft's (vertical.v), the one form's calculation flags it, so the save is refused
  const L = defaultLift(), S = L.shaft;
  assert.ok(deriveLift({ ...L, shaft: { ...S, vertical: { ...S.vertical, v: 0.1 } } }).analysis.ctx.bad.includes('v'));
  // the shaft as the form saves it: refused at 0,15 m/s on vertical.v; stored records read without the rule
  const at = (v: number) => shaftInputsSchema.safeParse({ ...S, vertical: { ...S.vertical, v } });
  const low = at(0.15);
  assert.equal(low.success, false);
  assert.ok(!low.success && low.error.issues.some((i) => i.path.join('.') === 'vertical.v'));
  assert.equal(at(0.16).success, true);
  // the form shows why, in Italian; the registry has the constant with its clauses
  const field = PLANT.find((f) => f.id === 'v');
  assert.ok(field && field.kind === 'num' && field.err === 'err_v');
  assert.ok(calcIt.err_v.includes('0,15 m/s') && calcIt.err_v.includes('UNI EN 81-20') && calcIt.err_v.includes('DPR 162/1999'));
  const voce = VOCI.find((v) => v.id === 'modello.velocita.minima');
  assert.ok(voce && voce.costanti?.includes('vRatedMin') && voce.riferimento.includes('1.3 a) 2)') && voce.riferimento.includes('art. 1 par. 2 lett. a)'));
});

test('T7: i punti CE della procedura del nuovo solo per un impianto nuovo o una trasformazione completa', () => {
  const ce = /All\. V 3\.3|All\. VIII 3 e\)|2023\/1230, art\. 51/;
  // a modification with UNI EN 81-20/50 added: none of them (Solo argano, Ammodernamento)
  assert.doesNotMatch(text({ meta: {} as ReportDoc['meta'], blocks: adempimentiBlocks({ norma: '10411-1', parti: ['machine'], aggiuntive: ['en81'] }, true) }), ce);
  assert.doesNotMatch(text({ meta: {} as ReportDoc['meta'], blocks: adempimentiBlocks({ norma: '10411-11', parti: ['machine', 'car'], aggiuntive: ['en81'] }, true) }), ce);
  // the rest of UNI EN 81-20/50's points stay
  assert.match(text({ meta: {} as ReportDoc['meta'], blocks: adempimentiBlocks({ norma: '10411-1', parti: ['machine'], aggiuntive: ['en81'] }, true) }), /UNI EN 81-20:2020, 6\.3\.1/);
  // a lift tested as new: all three
  const nuovo = text({ meta: {} as ReportDoc['meta'], blocks: adempimentiBlocks({ norma: 'en81', parti: [] }, false) });
  for (const p of ['All. V 3.3', 'All. VIII 3 e), g), h)', '2023/1230, art. 51 par. 2']) assert.ok(nuovo.includes(p), p);
  // the relazione by the type: a «Solo argano» with EN 81-20/50 added prints none, a transformation prints them
  const V: FormValues = { ...PRESETS.C, context: 'repl', compare: false };
  assert.doesNotMatch(text(report(V, collaudoOf(V, { norma: '10411-1', parti: ['machine'], aggiuntive: ['en81'] }), 'SOLO_ARGANO')), ce);
  const T: FormValues = { ...PRESETS.C, context: 'new', compare: false };
  assert.match(text(report(T, collaudoOf(T, { norma: 'en81', parti: [] }), 'TRASFORMAZIONE_COMPLETA')), ce);
});

test('T8: la riga «Freno» del riepilogo dice «Attenzione» quando nessuna coppia tiene l’aderenza reale', () => {
  const a = analyse({ ...PRESETS.C }), w = brakeWindow(a.res);
  assert.equal(w.hi, null, 'the preset has an empty window');
  const row = quickRows(P, X, a.ctx.N, a.res, a.sens).find((q) => q.key === 'c_brake');
  assert.equal(row?.status, 'warn');
  assert.ok(row?.text.includes(calcIt.q_brake_nohi));
  // the brake's own checks unchanged
  assert.ok(a.res.checks.filter((c) => c.id.startsWith('b_') && c.id !== 'b_amax').every((c) => c.status === 'ok'));
  const doc = report({ ...PRESETS.C, context: 'repl', compare: false }, collaudoOf({ context: 'repl' }));
  const freno = doc.blocks.flatMap((b) => (b.t === 'grid' && b.statusCol === 1 ? b.rows : [])).find((r) => r[0] === calcIt.c_brake);
  assert.equal(freno?.[1], calcIt.st_warn);
});

test('T8: la prova di aderenza della UNI EN 81-20, 6.3.3 — il sotto-caso mostrato', () => {
  const a = analyse({ ...PRESETS.C }), real = a.res.checks.find((c) => c.id === 'tr_real');
  assert.ok(real?.cs);
  // the governing case of the presets: the empty car going up at the top, the test's a)
  assert.ok(X.checkText(real).includes(calcIt.cs_test_a), X.checkText(real));
  assert.ok(!X.checkText(real).includes(calcIt.cs_test));
  // the same case at the standard's minimum deceleration is no test
  const up = a.res.checks.find((c) => c.id === 'tr_up');
  assert.ok(up && !X.checkText(up).includes('6.3.3'));
  // 1,25·Q down is the test's b)
  const q125 = a.res.brkReal.find((c) => c.load === 'q125');
  assert.ok(q125 && X.caseText(q125).includes(calcIt.cs_test));
  const all = text(report({ ...PRESETS.C, context: 'repl', compare: false }, collaudoOf({ context: 'repl' })));
  assert.ok(all.includes('con le prove di aderenza della UNI EN 81-20:2020, 6.3.3 a) e b)'));
  assert.ok(VOCI.find((v) => v.id === 'trazione.decelerazione.reale')?.riferimento.includes('6.3.3 a) e b)'));
});

test('registro: «confermato» e il titolo del profilo; la pagina pubblica non attribuisce freno e motore alla UNI EN 81-50', () => {
  assert.ok(!PROFILO.titolo.includes('sostituzione dell’argano su impianto esistente'));
  for (const s of ['solo argano', 'ammodernamento', 'trasformazione completa', 'impianto nuovo']) assert.ok(PROFILO.titolo.includes(s), s);
  const feat = appIt.landing.feat1P;
  assert.ok(!feat.includes('freno e motore secondo la UNI EN 81-50'));
  assert.ok(feat.includes('freno secondo la UNI EN 81-20') && feat.includes('modello di calcolo del software'));
});
