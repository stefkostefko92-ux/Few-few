// The draft order of the machine (Italian), as report blocks: report/relazione.py draws it as a PDF and docx.ts writes
// it as a Word document. For the maker: the machine with what it must be built to (sheave and grooves, ratio, motor,
// brake, load on the shaft, the bedplate with the diverting pulley), the installation it is for and the outcome of the
// software's check with it; the fields the buyer completes (hand, price, delivery) left blank; the alternatives of the
// advice and why this one. Every value comes from the calculation and the catalogue, with its source. Pure.
import calcIt from '../../../messages/calc/it.json';
import appIt from '../../../messages/it.json';
import type { MachineCandidate } from '@/lib/lift/advice';
import { NORMA_SIGLA, type Collaudo } from '@/lib/lift/collaudo';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import type { ReportBlock, ReportDoc } from '@/lib/report/model';
import type { OrderMachine } from './machine';

export interface OrderInput {
  company: string;
  author: string | null;
  project: { name: string; address: string | null; city: string | null; province: string | null; plantNumber: string | null; client: string | null };
  /** the saved record the order comes from */
  record: { kind: 'design' | 'calc'; id: string; sha256: string; createdAt: Date; label: string | null };
  order: OrderMachine;
  collaudo: Collaudo;
  generatedAt: Date;
}

const BLANK = '______________________';
const name = (c: MachineCandidate): string => `${c.brand} ${c.model}`;

/** A text of the advice (messages/it.json, advice.why_*) with its values. */
const fill = (s: string, v: Readonly<Record<string, string | number>>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => String(v[k] ?? m));

export function buildOrder(o: OrderInput): ReportDoc {
  const P = makePres(calcIt, 'it-IT'), X = textsFor(P), { t, fmt } = P;
  const { machine: c, recorded, advice } = o.order, { I, N } = c, A = appIt.advice;
  const when = (d: Date): string => new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'Europe/Rome' }).format(d);
  const what = o.record.kind === 'design' ? 'progetto' : 'calcolo', pr = o.project;
  const pct = (x: number): string => `${x >= 0 ? '+' : '−'}${fmt(Math.abs(x) * 100, 1)} %`;
  const dText = (d: number): string => fmt(d, Number.isInteger(d) ? 0 : 1);
  const status = (m: MachineCandidate): string => (m.fails ? `non conforme (${m.fails} verifiche non passano)` : m.warns ? `conforme con ${m.warns} avvisi` : 'conforme');
  const B: ReportBlock[] = [];
  let n = 0;
  const section = (title: string): void => { n += 1; B.push({ t: 'h2', text: `${n}. ${title}` }); };

  B.push({ t: 'h1', text: `Bozza d’ordine — argano ${name(c)}` });
  B.push({ t: 'sub', text: `${o.company} · ${when(o.generatedAt)} · bozza da completare e verificare prima dell’invio` });
  if (!recorded) {
    B.push({ t: 'box', text: `Il ${what} salvato verifica un argano diverso da questo. ${name(c)} è l’argano consigliato fra SICOR e Montanari per lo stesso impianto, `
      + `verificato dal software con i suoi dati: per avere relazione e disegni coerenti con l’ordine, sceglierlo nel ${o.record.kind === 'design' ? 'progetto' : 'calcolatore'} `
      + '(«Usa questo argano») e salvare di nuovo.' });
  }
  if (c.fails) B.push({ t: 'box', text: 'Con questo argano almeno una verifica non passa: non ordinarlo prima di aver risolto (vedi l’esito al punto 4).' });

  section('Destinatario e riferimenti');
  B.push({ t: 'kv', rows: [
    ['Spett.le', `${c.brand} — ufficio commerciale (indirizzo: ${BLANK})`],
    ['Committente', o.company],
    ['Impianto', `${pr.name}${pr.plantNumber ? ` · matricola ${pr.plantNumber}` : ''}`],
    ['Indirizzo dell’impianto', [pr.address, pr.city, pr.province].filter(Boolean).join(', ') || BLANK],
    ...(pr.client ? [['Proprietario o amministratore', pr.client] as [string, string]] : []),
    ['Riferimento', `${o.record.kind === 'design' ? 'Progetto' : 'Calcolo'} LiftPilot ${o.record.id}${o.record.label ? ` («${o.record.label}»)` : ''} del ${when(o.record.createdAt)}`],
    ['Impronta SHA-256', o.record.sha256],
  ] });

  section('Argano richiesto');
  const vMains = I.v * (1 + c.dv);
  B.push({ t: 'kv', rows: [
    ['Costruttore e modello', `${name(c)} · quantità 1`],
    ['Rapporto di riduzione', `${c.ratio} (i = ${fmt(c.i, 3)})`],
    ['Puleggia di trazione', `Ø ${fmt(N.D, 0)} mm primitivo; ${N.n} gole per funi Ø ${dText(N.d)} mm; ${X.grooveText(N.groove)}`],
    ['Motore', `${fmt(N.Pn, 1)} kW · ${N.poles} ${t('poles_short')} · ${fmt(N.nm, 0)} giri/min · ${fmt(N.fn, 0)} Hz${c.kWmax !== null ? ` (a catalogo fino a ${fmt(c.kWmax, 1)} kW)` : ''}`],
    ['Comando', `a frequenza variabile (inverter): con il rapporto ${c.ratio} la cabina va a ${fmt(vMains, 2)} m/s a ${fmt(N.fn, 0)} Hz (${pct(c.dv)}), l’inverter la porta a ${fmt(I.v, 2)} m/s`],
    ['Freno', `${N.brakeSets} × ${fmt(N.brakeNm, 0)} N·m sull’albero del motore, coppia minima per ganascia dal calcolo (UNI EN 81-20:2020, 5.9.2.2)`],
    ['Carico statico sull’albero', `${fmt(c.testKg, 0)} kg nella prova; ammessi a catalogo ${fmt(c.staticKg, 0)} kg`],
    ...(N.MpCat > 0 ? [['Coppia in uscita', `fino a ${fmt(N.MpCat, 0)} N·m sull’albero lento (dal calcolo)`] as [string, string]] : []),
    ['Massa (catalogo)', c.mass === null ? 'non indicata dal costruttore' : `${fmt(c.mass, 0)} kg`],
    ['Esecuzione (vista dal lato puleggia)', '☐ destra   ☐ sinistra'],
    ['Volano, encoder, sblocco manuale del freno', BLANK],
  ] });
  if (I.layout === 'topDefl') {
    const bp = c.bedplate;
    B.push({ t: 'h3', text: 'Basamento con puleggia di rinvio (nel locale macchina, mai nel vano)' });
    B.push({ t: 'kv', rows: [
      ['Basamento', bp
        ? `${bp.brand} ${bp.code} per ${bp.model}${bp.dt ? ` (rinvio Ø ${bp.dt.map((x) => fmt(x, 0)).join(' / ')})` : ''}: ${fmt(bp.mass, 0)} kg con puleggia e antivibranti`
        : `da chiedere al costruttore o da realizzare su misura: il calcolo pone il rinvio a h = ${fmt(I.h, 3)} m sotto l’asse della puleggia e a dx = ${fmt(I.dx, 3)} m`],
      ...(bp ? [['Quote sul pavimento del locale', `asse del rinvio ${fmt(bp.pulleyAxis, 0)} mm, asse della puleggia di trazione ${fmt(bp.sheaveAxis, 0)} mm, sommità ${fmt(bp.top, 0)} mm; `
        + `calata del contrappeso fino a ${fmt(bp.fall.max - N.D / 2, 0)} mm dall’asse della puleggia`] as [string, string]] : []),
      ['Puleggia di rinvio', `Ø ${fmt(I.Dp, 0)} mm; ${N.n} gole per funi Ø ${dText(N.d)} mm`],
      ...(bp ? [['Fonte', bp.src] as [string, string]] : []),
    ] });
  }

  section('Dati dell’impianto');
  B.push({ t: 'kv', rows: [
    ['Portata · velocità', `${fmt(I.Q, 0)} kg · ${fmt(I.v, 2)} m/s`],
    ['Taglia · corsa', `${I.r}:1 · ${fmt(I.H, 2)} m`],
    ['Massa della cabina · contrappeso', `${fmt(I.P, 0)} kg · ${fmt(c.Mcw, 0)} kg (bilanciamento ${fmt(I.k, 2)})`],
    ['Disposizione', t(`lay_${I.layout}`)],
    ['Funi (non comprese)', `${N.n} × Ø ${dText(N.d)} mm, carico di rottura minimo ${fmt(N.Fmin, 1)} kN`],
    ['Norma del collaudo', NORMA_SIGLA[o.collaudo.norma]],
  ] });

  section('Esito della verifica del software');
  B.push({ t: 'verdict', text: `${name(c)}: ${status(c)}`, status: c.fails ? 'fail' : c.warns ? 'warn' : 'ok' });
  B.push({ t: 'p', style: 'note', text: recorded
    ? `L’esito è quello del ${what} salvato (relazione di calcolo LiftPilot, stessi dati e stessa impronta).`
    : `Verifica del software con questo argano e gli stessi dati dell’impianto; la relazione del ${what} salvato riguarda l’altro argano.` });

  section('Alternative e scelta');
  B.push({ t: 'grid', head: ['Argano', 'Rapporto', 'Carico statico', 'Massa', 'Basamento con rinvio', 'Esito'], widths: [0.2, 0.13, 0.17, 0.1, 0.2, 0.2], align: ['l', 'l', 'r', 'r', 'l', 'l'],
    rows: advice.candidates.map((x) => [`${x.brand === c.brand && x.model === c.model ? '★ ' : ''}${name(x)}`, `${x.ratio} (${pct(x.dv)})`, `${fmt(x.staticKg, 0)} kg`,
      x.mass === null ? '—' : `${fmt(x.mass, 0)} kg`, x.I.layout !== 'topDefl' ? '—' : x.bedplate ? x.bedplate.code : 'su misura', status(x)]),
    status: advice.candidates.map((x) => (x.fails ? 'fail' : x.warns ? 'warn' : 'ok')), statusCol: 5 });
  const [a, b] = advice.candidates, why = advice.why;
  if (a && why) {
    const v = { a: name(a), b: b ? name(b) : '', na: a.warns, nb: b?.warns ?? 0, code: a.bedplate?.code ?? '', sa: fmt(a.staticKg, 0), sb: b ? fmt(b.staticKg, 0) : '',
      test: fmt(a.testKg, 0), dva: pct(a.dv).replace(' %', ''), dvb: b ? pct(b.dv).replace(' %', '') : '', ma: a.mass === null ? '—' : fmt(a.mass, 0), mb: b && b.mass !== null ? fmt(b.mass, 0) : '—' };
    const first = a.brand === c.brand && a.model === c.model;
    B.push({ t: 'p', text: `${fill(A[`why_${why}`], v)}${first ? '' : ` Questa bozza è per ${name(c)}, l’argano scelto nel ${what} salvato.`}` });
  }
  if (advice.none.length) B.push({ t: 'p', style: 'note', text: advice.none.map((x) => fill(A.none_brand, { brand: x })).join(' ') });

  section('Condizioni (da completare)');
  B.push({ t: 'kv', rows: [['Prezzo unitario', `€ ${BLANK}`], ['Consegna richiesta', BLANK], ['Resa e imballo', BLANK], ['Pagamento', BLANK], ['Validità dell’offerta', BLANK]] });
  B.push({ t: 'p', style: 'note', text: `Dati di catalogo: ${c.src}. Letti il 2 ottobre 2026 dai documenti del costruttore: confermarli con la sua scheda tecnica e la sua offerta `
    + 'prima dell’ordine. Questa è una bozza generata da LiftPilot: diventa un ordine con timbro e firma del committente.' });
  B.push({ t: 'sign', labels: [`Timbro e firma del committente (${o.company})`, 'Data', 'Accettazione del fornitore'] });

  return {
    meta: {
      title: `Bozza d’ordine argano ${name(c)}`, subject: `Ordine dell’argano per ${pr.name}`, author: o.author ?? o.company,
      header: `${o.company} · Bozza d’ordine · ${pr.name}`, footer: `LiftPilot · bozza del ${when(o.generatedAt)}`,
      code: `${o.record.kind === 'design' ? 'Progetto' : 'Calcolo'} ${o.record.id} · SHA-256 ${o.record.sha256.slice(0, 16)}…`,
    },
    blocks: B,
  };
}
