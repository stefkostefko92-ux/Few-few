// Relazione di calcolo (Italian) of a saved calculation: identification, object and references, data, verified
// machine, checks with their clauses, every traction case, detailed tables, sensitivity, comparison, proposal,
// adaptations, values to check, status of the normative entries used, notice and signature. The values the software
// filled in from the one form (estimated car mass, geometry from the shaft design, machine proposed) are marked. Pure.
import calcIt from '../../../messages/calc/it.json';
import appIt from '../../../messages/it.json';
import { deg } from '@/calc/math';
import { PROFILO, VOCI, type Stato } from '@/calc/norme';
import { COND, PALETTE, concreteTile } from '@/drawing';
import { vociOfDesign } from '@/shaft';
import type { BrakeCase, CheckId, CheckStatus, FormValues, TractionCase } from '@/calc/types';
import type { BottomScheme } from '../lift/bottom';
import { NO_MARKS, P_ESTIMATE_RULE, type ValueMarks } from '../lift/marks';
import { ambitoOf, collaudoOf } from '../lift/collaudo';
import { VOCI_IMPIANTO } from '../lift/norme';
import { analyse } from '../present/analysis';
import { quickRows } from '../present/quick';
import { techTables, type Cell } from '../present/tables';
import { textsFor, verdictStatus } from '../present/texts';
import { makePres, type CalcKey } from '../present/tr';
import type { BlockStatus, ReportBlock, ReportDoc } from './model';
import { shaftBlocks, type ReportDesign } from './shaft';
import { EXISTING_NOTE, adaptSection, collaudoRows, collaudoText, esitoOf } from './collaudo';
import { machineSpec } from '../lift/machine';
import { supportChecks, supportLoad } from '../lift/support';

/** The rope schemes of a machine below, in the relazione's words (src/lib/lift/bottom.ts). */
const BOTTOM_IT: Readonly<Record<BottomScheme, string>> = {
  head: 'in basso, rinvii in testata, macchina accanto al vano',
  room: 'in basso, locale pulegge sopra il vano, macchina accanto al vano',
  under: 'macchina sotto il vano, rinvii in testata',
};

export interface ReportInput {
  calc: { id: string; label: string | null; createdAt: Date; sha256: string; engineVersion: string; profileId: string; author: string | null };
  project: { name: string; address: string | null; city: string | null; province: string | null; plantNumber: string | null; client: string | null };
  company: string;
  reviews: readonly { name: string | null; role: keyof typeof appIt.roles | null; note: string | null; createdAt: Date }[];
  values: FormValues;
  /** the shaft design the calculation comes from, when there is one */
  design?: ReportDesign | null;
  /** what the software filled in, when the calculation comes from the one form of a lift design */
  marks?: ValueMarks;
  generatedAt: Date;
}

const STATO: Record<Stato, string> = { confermato: 'confermato', da_verificare: 'da verificare', stima: 'stima', derivazione: 'derivazione', scelta: 'scelta del software', prassi: 'prassi di cantiere' };
const LEGAL: readonly CalcKey[] = ['lg_1', 'lg_2', 'lg_3', 'lg_4', 'lg_5', 'lg_6'];
const CASE_W = [0.3, 0.07, 0.08, 0.08, 0.08, 0.1, 0.1, 0.09, 0.1];

const cellText = (c: Cell | undefined): string => (c === undefined ? '' : typeof c === 'string' ? c : `${c.text}${c.flag ? ' ⚠' : ''}${c.sub ? `\n${c.sub}` : ''}`);
const rowStatus = (row: readonly Cell[]): BlockStatus => { const s = row.find((c) => typeof c === 'object' && c.status); return typeof s === 'object' && s.status ? s.status : ''; };
const utilStatus = (u: number, warnOnly = false): BlockStatus => (u > 1 && !warnOnly ? 'fail' : u > 0.97 ? 'warn' : 'ok');

export function buildReport(r: ReportInput): ReportDoc {
  const P = makePres(calcIt, 'it-IT'), X = textsFor(P), { t, fmt } = P;
  const a = analyse(r.values), { ctx, res, old, sizing, sens } = a, { I, N } = ctx;
  const when = (d: Date): string => new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(d);
  const repl = I.context === 'repl', pr = r.project, m = r.marks ?? NO_MARKS, C = m.collaudo ?? collaudoOf(r.values);
  const layoutText = I.layout === 'bottom' && m.bottom ? BOTTOM_IT[m.bottom] : t(`lay_${I.layout}`);
  const fromShaft = (k: 'L0' | 'dx' | 'Hv', named = true): string => (m.geometry.includes(k) ? ` (${named ? `${k} ` : ''}dal progetto del vano)` : '');
  const place = [pr.address, pr.city, pr.province].filter(Boolean).join(', ');
  const B: ReportBlock[] = [];
  let n = 0;
  const section = (title: string): void => { n += 1; B.push({ t: 'h2', text: `${n}. ${title}` }); };
  const st = (s: CheckStatus): string => X.st(s);

  const vano = r.design ? vociOfDesign(r.design.layout.inputs.access) : [];
  const counts = [...VOCI, ...vano].reduce<Partial<Record<Stato, number>>>((acc, v) => ({ ...acc, [v.stato]: (acc[v.stato] ?? 0) + 1 }), {});
  const countText = (Object.keys(STATO) as Stato[]).filter((s) => counts[s]).map((s) => `${counts[s]} ${STATO[s]}`).join(' · ');

  B.push({ t: 'h1', text: `Relazione di calcolo — ${repl ? "sostituzione dell'argano" : "argano per impianto nuovo"}` });
  B.push({ t: 'sub', text: place ? `${pr.name} · ${place}` : pr.name });
  B.push({ t: 'box', text: `BOZZA DA VERIFICARE E FIRMARE. Documento generato dal software LiftPilot: diventa relazione di calcolo quando il tecnico incaricato lo verifica e lo firma, e la responsabilità è sua. I valori normativi marcati ⚠ provengono da fonti secondarie e attendono la verifica sul testo vigente (lista di verifica normativa del profilo ${PROFILO.id}; voci del registro: ${countText}).` });
  B.push({ t: 'kv', rows: [
    ['Azienda', r.company], ['Impianto', pr.name], ['Indirizzo', place || '—'], ['Numero di matricola', pr.plantNumber ?? '—'],
    ['Proprietario o committente', pr.client ?? '—'], ['Calcolo', `${r.calc.id}${r.calc.label ? ` · ${r.calc.label}` : ''}`],
    ['Data del calcolo', when(r.calc.createdAt)], ['Eseguito da', r.calc.author ?? '—'],
    ['Visti interni (non sono firme)', r.reviews.length ? r.reviews.map((v) => `${v.name ?? '—'}${v.role ? ` (${appIt.roles[v.role]})` : ''}, ${when(v.createdAt)}${v.note ? `: ${v.note}` : ''}`).join('\n') : 'nessuno'],
    ['Motore di calcolo', `LiftPilot ${r.calc.engineVersion} · profilo normativo ${r.calc.profileId}`], ['Impronta SHA-256 del calcolo', r.calc.sha256],
    ['Documento generato il', when(r.generatedAt)],
  ] });

  section('Oggetto');
  B.push({ t: 'p', text: `Verifica dell'argano geared ${repl ? "in sostituzione su impianto esistente" : "per un impianto nuovo"} (${layoutText}, ${I.r}:1): aderenza al caricamento, in frenatura di emergenza e a cabina bloccata (UNI EN 81-50:2020, 5.11); funi e coefficiente di sicurezza (UNI EN 81-20:2020, 5.5; UNI EN 81-50:2020, 5.12); freno (UNI EN 81-20:2020, 5.9.2.2); azionamento, manovra di emergenza e carico sull'albero secondo il modello di calcolo del software.${collaudoText(C, repl)}${r.design ? ' La pianta del vano e della cabina, con le sue verifiche, viene dal progetto del vano del software (sezione «Vano e cabina»).' : ''}` });
  section('Riferimenti normativi');
  B.push({ t: 'grid', head: ['Documento', 'Ambito'], rows: PROFILO.documenti.map((d) => [d.sigla, d.ambito]), widths: [0.38, 0.62], align: ['l', 'l'] });

  section("Dati dell'impianto");
  const plant: [string, string][] = [
    [t('context'), t(repl ? 'ctx_repl' : 'ctx_new')], ...collaudoRows(C, repl), [t('layout'), layoutText.charAt(0).toUpperCase() + layoutText.slice(1)], [t('Q'), `${fmt(I.Q, 0)} kg`],
    [t('P'), `${fmt(I.P, 0)} kg${m.pEstimate ? ' — stima del software, da sostituire con la massa reale' : ''}`],
    [`${t('k')} · M_cw`, `${fmt(res.k, 3)} · ${fmt(res.Mcw, 0)} kg${I.qeq > 0 ? ` (${t('qeq')}: ${fmt(I.qeq, 0)} kg)` : ''}`], [t('v'), `${fmt(I.v, 2)} m/s`],
    [t('r'), `${I.r}:1`], [`${t('H')} · ${t('L0')}`, `${fmt(I.H, 1)} m · ${fmt(I.L0, 1)} m${fromShaft('L0')}`], [t('alphaMode'), `α ${X.alphaText(res)}`],
    ...(I.layout === 'topDefl' ? [[`${t('dx')} · ${t('h')}`, `${fmt(I.dx, 2)} m · ${fmt(I.h, 2)} m${fromShaft('dx')}`] as [string, string]] : []),
    ...(I.layout === 'bottom' ? [[t('Hv'), `${fmt(I.Hv, 1)} m${fromShaft('Hv', false)}`] as [string, string]] : []),
    ...(res.ropes.DpD != null ? [[t('Dp'), `${fmt(I.Dp, 0)} mm`] as [string, string]] : []),
    [t('etaShaft'), fmt(I.etaShaft, 2)], [`${t('aDesign')} · ${t('aBrake')}`, `${fmt(I.aDesign, 2)} · ${fmt(I.aBrake, 2)} m/s²`],
    [t('buffers'), I.ae > 0.5 ? 'sì' : 'no'], [t('rh'), `${fmt(I.rh, 2)} m`],
  ];
  B.push({ t: 'kv', rows: plant });
  if (m.pEstimate) {
    B.push({ t: 'box', text: `MASSA DELLA CABINA STIMATA. La massa della cabina P = ${fmt(I.P, 0)} kg non è stata inserita: è la stima del software (${P_ESTIMATE_RULE}). `
      + 'Contrappeso, aderenza, funi, freno e carichi dipendono da P: prima di usare questa relazione sostituirla con la massa reale (libretto '
      + "dell'impianto, costruttore della cabina o prova di bilanciamento) e ripetere il calcolo." });
  }

  if (r.design) {
    section('Vano e cabina');
    const beams = supportChecks(r.design.layout, machineSpec(ctx, N.mass, '', r.design.layout.inputs.room), supportLoad(ctx, res.Mcw));
    B.push(...shaftBlocks(r.design, I.Q, { fmt, st, when, head: [t('col_item'), t('col_val'), t('col_lim'), t('col_res'), 'Riferimento'] }, beams, C));
  }

  section('Argano verificato');
  B.push({ t: 'kv', rows: X.machineRows(N, res) });
  if (m.machineProposed) {
    B.push({ t: 'p', style: 'note', text: 'Argano proposto dal dimensionamento del software: la prima opzione che passa ogni verifica, su una griglia di calcolo e '
      + 'non su un catalogo. Il modello reale va scelto con il costruttore con questi valori e la verifica ripetuta con i suoi dati di targa.' });
  }
  B.push({ t: 'verdict', text: `${X.verdictText(res)} — ${t('indicative')}`, status: verdictStatus(res) });
  if (old) {
    B.push({ t: 'h3', text: `${t('g_old')} (confronto)` });
    B.push({ t: 'kv', rows: X.machineRows(ctx.O, old) });
    B.push({ t: 'verdict', text: X.verdictText(old), status: verdictStatus(old) });
  }

  section(t('q_title'));
  const quick = quickRows(P, X, N, res, sens);
  B.push({ t: 'grid', head: [t('col_item'), t('col_res'), t('col_note')], rows: quick.map((q) => [t(q.key), st(q.status), q.text]), status: quick.map((q) => q.status), statusCol: 1, widths: [0.2, 0.1, 0.7], align: ['l', 'l', 'l'] });

  section('Verifiche');
  // clauses of the registry entries behind a check, each once; entries without a clause are the calculation model
  const refOf = (id: CheckId): string => [...new Set(VOCI.filter((v) => v.verifiche?.includes(id)).flatMap((v) => v.riferimento.split('; ')).map((x) => x.trim())
    .filter((x) => x && x !== '—'))].slice(0, 3).join('; ') || 'modello di calcolo del software';
  const esiti = res.checks.map((c) => esitoOf(C, c.id, st(c.status), c.status));
  B.push({ t: 'grid', head: [t('col_item'), t('col_val'), t('col_lim'), t('col_res'), 'Riferimento'],
    rows: res.checks.map((c, i) => [X.checkText(c), c.value == null ? '—' : fmt(c.value, c.dec), c.limit == null ? '' : fmt(c.limit, c.dec), esiti[i]?.text ?? '', refOf(c.id)]),
    status: esiti.map((e) => e.status), statusCol: 3, widths: [0.36, 0.1, 0.1, 0.12, 0.32], align: ['l', 'r', 'r', 'l', 'l'] });
  if (res.checks.some((c) => ambitoOf(C, c.id) === 'existing')) {
    B.push({ t: 'p', style: 'note', text: EXISTING_NOTE });
  }

  section("Aderenza: tutti i casi di calcolo");
  const caseHead = ['Caso', 'α [°]', 'μ', 'f', 'e^(f·α)', 'T1 [N]', 'T2 [N]', 'T1/T2', 'Utilizzo'];
  const caseRow = (c: TractionCase | BrakeCase, label: string): string[] => [label, fmt(deg(c.alpha), 1), fmt(c.mu, 4), fmt(c.f, 4), fmt(c.efa, 3), fmt(c.T1, 0), fmt(c.T2, 0), fmt(c.ratio, 3), fmt(c.util, 3)];
  const cases = (title: string, list: readonly (TractionCase | BrakeCase)[], label: (c: TractionCase | BrakeCase) => string, warnOnly = false): void => {
    B.push({ t: 'h3', text: title });
    B.push({ t: 'grid', head: caseHead, rows: list.map((c) => caseRow(c, label(c))), status: list.map((c) => utilStatus(c.util, warnOnly)), widths: CASE_W });
  };
  cases(`${t('tr_load')} (UNI EN 81-50:2020, 5.11)`, res.loadCases, (c) => X.caseText(c));
  cases(`Frenatura di emergenza alla decelerazione minima di ${fmt(I.ae, 1)} m/s² (UNI EN 81-50:2020, 5.11.2.2.2)`, res.brk, (c) => X.caseText(c));
  cases(`${t('tr_real')}: decelerazione data dal freno (${N.brakeSets} × ${fmt(N.brakeNm, 0)} N·m), solo avviso`, res.brkReal, (c) => X.caseText(c), true);
  B.push({ t: 'h3', text: `${t('tr_stall')} (UNI EN 81-50:2020, 5.11)` });
  const s = res.stall, stallStatus = res.checks.find((c) => c.id === 'tr_stall')?.status ?? '';
  B.push({ t: 'grid', head: [...caseHead.slice(0, 8), 'Condizione'], rows: [[`${t('cs_e')}, ${t('at_t')}`, fmt(deg(s.alpha), 1), fmt(s.mu, 4), fmt(s.f, 4), fmt(s.efa, 3),
    fmt(s.T1, 0), fmt(s.T2, 0), fmt(s.ratio, 2), `≥ e^(f·α): ${st(stallStatus || 'info')}`]], status: [stallStatus], widths: CASE_W });

  section('Dettaglio delle verifiche');
  const tables = techTables(P, X, a);
  for (const tb of tables.filter((x) => !['trac', 'sens', 'cmp'].includes(x.key))) {
    B.push({ t: 'h3', text: tb.ref ? `${tb.title} (${tb.ref})` : tb.title });
    if (tb.rows.length) {
      B.push({ t: 'grid', head: tb.head, rows: tb.rows.map((row) => row.map(cellText)), status: tb.rows.map(rowStatus),
        widths: tb.head.length === 4 ? [0.42, 0.24, 0.2, 0.14] : [0.5, 0.5], align: tb.head.length === 4 ? ['l', 'r', 'r', 'l'] : ['l', 'r'] });
    }
    if (tb.list?.length) B.push({ t: 'list', items: tb.list.map((x) => `${x.flag ? '⚠ ' : ''}${x.text}`) });
    for (const note of tb.notes) B.push({ t: 'p', text: `${note.flag ? '⚠ ' : ''}${note.text}`, style: 'note' });
  }

  const sensTable = tables.find((x) => x.key === 'sens');
  if (sensTable) {
    section(sensTable.title);
    B.push({ t: 'grid', head: sensTable.head, rows: sensTable.rows.map((row) => row.map(cellText)), status: sensTable.rows.map(rowStatus), widths: [0.16, 0.12, 0.12, 0.16, 0.14, 0.14, 0.16] });
    if (sensTable.list?.length) B.push({ t: 'list', items: sensTable.list.map((x) => `⚠ ${x.text}`) });
    for (const note of sensTable.notes) B.push({ t: 'p', text: note.text, style: 'note' });
  }
  if (old) {
    section(t('c_cmp'));
    B.push({ t: 'grid', head: [t('col_item'), t('col_old'), t('col_new')], rows: X.comparisonRows(res, old), widths: [0.4, 0.3, 0.3] });
  }

  section(`${t('c_prop')} (informativa)`);
  if (m.catalog) {
    B.push({ t: 'p', text: `Argano a catalogo: ${m.catalog.brand} ${m.catalog.model}, rapporto ${m.catalog.ratio}, carico statico ammesso ${fmt(m.catalog.staticKg, 0)} kg `
      + `(fonte: ${m.catalog.src}). Il calcolo usa questo rapporto, il carico statico e la massa del catalogo; i dati vengono da estratti delle pagine del `
      + 'costruttore e vanno verificati sulla scheda prima dell\'ordine.' });
  }
  if (sizing.pick) {
    B.push({ t: 'kv', rows: X.proposalRows(sizing.pick, N, sizing.fixedD, !!sizing.keep) });
    B.push({ t: 'h3', text: X.altText(sizing) });
    B.push({ t: 'grid', head: X.proposalHead(), rows: sizing.options.map((o) => X.proposalCells(o, sizing.pick)), widths: [0.16, 0.14, 0.16, 0.1, 0.12, 0.16, 0.16] });
  } else {
    B.push({ t: 'p', text: X.noneText(sizing) });
  }
  B.push({ t: 'p', text: X.critText(sizing), style: 'note' });

  const adapt = adaptSection(C, repl, t);
  section(adapt.title);
  B.push(...adapt.blocks);

  section(t('c_verify'));
  const estimated = [
    ...(m.pEstimate ? [`Massa della cabina: è la stima del software (${P_ESTIMATE_RULE}); sostituirla con quella reale e ripetere il calcolo`] : []),
    ...(I.layout === 'bottom' && m.bottom ? [`Schema delle funi con la macchina in basso (${BOTTOM_IT[m.bottom]}): rinvii, rami e passaggi ricostruiti dal software; rilevarli sull'impianto`] : []),
    ...(I.layout === 'bottom' && m.bottom === 'under' ? ['Spazio accessibile sotto il vano: paracadute del contrappeso o pilastro pieno fino al terreno (UNI EN 81-20:2020, 5.2.5.4) e fondo della fossa per le reazioni degli ammortizzatori'] : []),
  ];
  B.push({ t: 'list', items: [...estimated, ...X.verifyList(I, N, res)].map((x) => `⚠ ${x}`) });

  section('Voci normative usate e loro stato');
  const ids = new Set(res.checks.map((c) => c.id));
  const used = VOCI.filter((v) => v.verifiche?.some((c) => ids.has(c)));
  // and the registry entries of the values the software filled in, where the layout uses them
  const filled = new Set([...(repl ? ['impianto.collaudo'] : []), ...(m.pEstimate ? ['impianto.massa.cabina'] : []), ...(m.machineProposed ? ['impianto.macchina'] : []),
    ...(I.layout === 'bottom' && m.bottom ? ['impianto.basso.schema'] : []), ...(m.catalog ? ['impianto.catalogo'] : []),
    ...m.geometry.filter((k) => k === 'L0' || (k === 'dx' && I.layout === 'topDefl') || (k === 'Hv' && I.layout === 'bottom')).map((k) => `impianto.${k}`)]);
  const listed = [...used, ...vano, ...VOCI_IMPIANTO.filter((v) => filled.has(v.id))];
  B.push({ t: 'grid', head: ['Voce', 'Valore nel software', 'Dove si verifica', 'Stato'], rows: listed.map((v) => [v.titolo, v.valore, v.riferimento, STATO[v.stato]]),
    status: listed.map((v) => (v.stato === 'confermato' ? 'ok' : v.stato === 'da_verificare' ? 'warn' : 'info')), widths: [0.27, 0.33, 0.26, 0.14], align: ['l', 'l', 'l', 'l'] });

  section(t('lg_title'));
  B.push({ t: 'p', text: t('lg_short') });
  B.push({ t: 'list', items: LEGAL.map((k) => t(k)) });
  B.push({ t: 'p', text: t('disclaimer'), style: 'note' });
  B.push({ t: 'sign', labels: [t('rep_sign'), t('rep_signature'), t('rep_date')] });

  const short = pr.name.length > 70 ? `${pr.name.slice(0, 69)}…` : pr.name;
  return {
    meta: {
      title: `Relazione di calcolo — ${pr.name}`, subject: "Verifica dell'argano geared", author: r.company,
      header: `LiftPilot · Relazione di calcolo · ${short}`, footer: `Calcolo ${r.calc.id} · motore ${r.calc.engineVersion} · profilo ${r.calc.profileId}`,
      code: `SHA-256 ${r.calc.sha256}`,
    },
    blocks: B,
    // the plan of the shaft design is drawn by the drawing kernel: its colours, concrete speckle and lettering
    ...(r.design ? { drawing: { palette: PALETTE, patterns: { concrete: concreteTile() }, cond: COND, images: {} } } : {}),
  };
}
