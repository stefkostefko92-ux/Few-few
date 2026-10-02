// The draft order of the machine (Italian), as report blocks: report/relazione.py draws it as a PDF and docx.ts writes
// it as a Word document. On the buyer's letterhead (logo, name, city) to the maker's sales office (its site from the
// catalogue's sources): the machine with what it must be built to (sheave and grooves, ratio, motor, brake, load on the
// shaft, the bedplate with the diverting pulley), the installation it is for, the machine room in plan and in section
// with this machine, and the outcome of the software's check with it; the fields the buyer completes (hand, delivery,
// the maker's address) left blank, the price too unless the downloader sees prices (then the company's list's). Every
// value comes from the calculation and the catalogue, whose source the note names. Pure.
import calcIt from '../../../messages/calc/it.json';
import type { SheetImage } from '@/drawing';
import { CATALOG_READ_ON, MAKER_SITE } from '@/lib/catalog/machines';
import type { DataSource, MachineCandidate } from '@/lib/lift/advice';
import { NORMA_SIGLA, type Collaudo } from '@/lib/lift/collaudo';
import { dvText, machineName } from '@/lib/present/advice';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import type { ReportBlock, ReportDoc } from '@/lib/report/model';
import { ORDER_DRAWING } from './drawings';
import type { OrderMachine } from './machine';

export interface OrderInput {
  company: string;
  companyCity: string | null;
  /** the company's logo on the letterhead; null: the name alone */
  logo: SheetImage | null;
  author: string | null;
  project: { name: string; address: string | null; city: string | null; province: string | null; plantNumber: string | null; client: string | null };
  /** the saved record the order comes from */
  record: { kind: 'design' | 'calc'; id: string; sha256: string; createdAt: Date; label: string | null };
  order: OrderMachine;
  /** the machine room in plan and section B-B with the ordered machine (drawings.ts); empty without a machine room */
  room: ReportBlock[];
  collaudo: Collaudo;
  /** the car's mass is the software's estimate (not entered): the maker is told */
  pEstimate?: boolean;
  /** the company's prices of the machine and of the maker's bedplate [cents, VAT excluded], for a downloader who sees
   *  prices; missing: the price is left blank (null: not in the company's list) */
  prices?: { machine: number | null; bedplate: number | null };
  generatedAt: Date;
}

const BLANK = '______________________';

/** Where the catalogue's values of the machine come from, as the order says it. */
const SOURCE: Readonly<Record<DataSource, string>> = {
  D: 'da documenti del costruttore', E: 'da estratti delle pagine del costruttore', R: 'da un rivenditore', P: 'da una ricerca precedente',
};

export function buildOrder(o: OrderInput): ReportDoc {
  const P = makePres(calcIt, 'it-IT'), X = textsFor(P), { t, fmt } = P;
  const { machine: c, recorded } = o.order, { I, N } = c;
  const when = (d: Date): string => new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'Europe/Rome' }).format(d);
  const what = o.record.kind === 'design' ? 'progetto' : 'calcolo', pr = o.project;
  const dText = (d: number): string => fmt(d, Number.isInteger(d) ? 0 : 1);
  // the software's checks only: no statement of conformity of the machine or of the installation
  const status = (m: MachineCandidate): string => (m.fails ? `non passa ${m.fails === 1 ? '1 verifica' : `${m.fails} verifiche`} del software`
    : `passa le verifiche del software${m.warns ? `, con ${m.warns === 1 ? '1 avviso' : `${m.warns} avvisi`}` : ''}`);
  const B: ReportBlock[] = [];
  let n = 0;
  const section = (title: string): number => { n += 1; B.push({ t: 'h2', text: `${n}. ${title}` }); return n; };

  B.push({
    t: 'letterhead', logo: o.logo ? 'logo' : null, from: [o.company, ...(o.companyCity ? [o.companyCity] : [])],
    to: ['Spett.le', `${c.brand} — ufficio commerciale`, MAKER_SITE[c.brand], `Indirizzo: ${BLANK}`],
  });
  B.push({ t: 'h1', text: `Bozza d’ordine — argano ${machineName(c)}` });
  B.push({ t: 'sub', text: `${o.companyCity ? `${o.companyCity}, ` : ''}${when(o.generatedAt)} · bozza da completare e verificare prima dell’invio` });
  if (!recorded) {
    B.push({ t: 'box', text: `Il ${what} salvato verifica un argano diverso da questo. ${machineName(c)} è il primo del confronto fra SICOR e Montanari per lo stesso impianto, `
      + `verificato dal software con i suoi dati: per avere relazione e disegni coerenti con l’ordine, sceglierlo nel ${o.record.kind === 'design' ? 'progetto' : 'calcolatore'} `
      + '(«Usa questo argano») e salvare di nuovo.' });
  }

  section('Riferimenti');
  B.push({ t: 'kv', rows: [
    ['Committente', [o.company, o.companyCity].filter(Boolean).join(', ')],
    ['Impianto', `${pr.name}${pr.plantNumber ? ` · matricola ${pr.plantNumber}` : ''}`],
    ['Indirizzo dell’impianto', [pr.address, pr.city, pr.province].filter(Boolean).join(', ') || BLANK],
    ...(pr.client ? [['Proprietario o amministratore', pr.client] as [string, string]] : []),
    ['Riferimento', `${o.record.kind === 'design' ? 'Progetto' : 'Calcolo'} LiftPilot ${o.record.id}${o.record.label ? ` («${o.record.label}»)` : ''} del ${when(o.record.createdAt)}`],
    ['Impronta SHA-256', o.record.sha256],
  ] });

  section('Argano richiesto');
  const vMains = I.v * (1 + c.dv), hand = o.room.length ? ' — come nella pianta del locale (punto 4)' : '';
  B.push({ t: 'kv', rows: [
    ['Costruttore e modello', `${machineName(c)} · quantità 1`],
    ['Rapporto di riduzione', `${c.ratio} (i = ${fmt(c.i, 3)})`],
    ['Puleggia di trazione', `Ø ${fmt(N.D, 0)} mm primitivo; ${N.n} gole per funi Ø ${dText(N.d)} mm; ${X.grooveText(N.groove)}`],
    ['Motore', `${fmt(N.Pn, 1)} kW · ${N.poles} ${t('poles_short')} · ${fmt(N.nm, 0)} giri/min · ${fmt(N.fn, 0)} Hz${c.kWmax !== null ? ` (a catalogo fino a ${fmt(c.kWmax, 1)} kW)` : ''}`],
    ['Comando', `a frequenza variabile (inverter): con il rapporto ${c.ratio} la cabina va a ${fmt(vMains, 2)} m/s a ${fmt(N.fn, 0)} Hz (${dvText(c.dv, fmt)} %), l’inverter la porta a ${fmt(I.v, 2)} m/s`],
    ['Freno', `${N.brakeSets} × ${fmt(N.brakeNm, 0)} N·m sull’albero del motore (taratura; minimo richiesto dal calcolo ${fmt(c.brakeMin, 1)} N·m per gruppo, `
      + 'UNI EN 81-20:2020, 5.9.2.2)'],
    ['Carico sull’albero nella prova con 1,25·Q', `${fmt(c.testKg, 0)} kg${I.layout === 'bottom' ? ' verso l’alto (macchina in basso)' : ''}; ammessi a catalogo ${fmt(c.staticKg, 0)} kg`
      + (c.uplift !== null && c.uplift > 0 ? `; sollevamento netto sugli ancoraggi ${fmt(c.uplift, 0)} kg (peso della macchina dedotto)` : '')],
    ['Coppia in uscita dal riduttore', `${fmt(c.mpMax, 0)} N·m al massimo sull’albero lento, richiesta dal calcolo: da confermare con il catalogo del riduttore`
      + (N.MpCat > 0 ? ` (ammessa ${fmt(N.MpCat, 0)} N·m, dato inserito)` : '')],
    ['Massa (catalogo)', c.mass === null ? 'non indicata dal costruttore' : `${fmt(c.mass, 0)} kg`],
    ['Fonte dei dati di catalogo', c.src],
    ['Esecuzione (vista dal lato puleggia)', `☐ destra   ☐ sinistra${hand}`],
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
    ['Massa della cabina · contrappeso', `${fmt(I.P, 0)} kg${o.pEstimate ? ' (stima del software, da confermare)' : ''} · ${fmt(c.Mcw, 0)} kg (bilanciamento ${fmt(c.k, I.qeq > 0 ? 3 : 2)})`],
    ['Disposizione', t(`lay_${I.layout}`)],
    ['Funi (non comprese)', `${N.n} × Ø ${dText(N.d)} mm, carico di rottura minimo ${fmt(N.Fmin, 1)} kN`],
    ['Norma del collaudo', NORMA_SIGLA[o.collaudo.norma]],
  ] });

  if (o.room.length) {
    section('Locale macchina con l’argano');
    B.push({ t: 'p', style: 'note', text: `Disegni LiftPilot del ${what}: l’argano ${machineName(c)} sul suo basamento${I.layout === 'topDefl' ? ' con la puleggia di rinvio' : ''}, `
      + 'le funi verso la cabina e il contrappeso, le aperture nel solaio; quote in mm.' });
    B.push(...o.room);
  }

  const verdictAt = section('Esito della verifica del software');
  B.push({ t: 'verdict', text: `${machineName(c)}: ${status(c)}`, status: c.fails ? 'fail' : c.warns ? 'warn' : 'ok' });
  B.push({ t: 'p', style: 'note', text: recorded
    ? `L’esito è quello del ${what} salvato (relazione di calcolo LiftPilot, stessi dati e stessa impronta).`
    : `Verifica del software con questo argano e gli stessi dati dell’impianto; la relazione del ${what} salvato riguarda l’altro argano.` });
  if (c.fails) B.push({ t: 'box', text: `Con questo argano almeno una verifica non passa: non ordinarlo prima di aver risolto (punto ${verdictAt}).` });

  section('Condizioni (da completare)');
  const eur = (cents: number | null): string => (cents === null ? `€ ${BLANK} (non nel listino dell’azienda)` : `€ ${fmt(cents / 100, 2)}`);
  const withBed = I.layout === 'topDefl' && c.bedplate !== null, cost = o.prices;
  const priced: [string, string][] = !cost ? [['Prezzo unitario', `€ ${BLANK}`]] : [
    ['Prezzo unitario dell’argano', eur(cost.machine)],
    ...(withBed ? [['Prezzo del basamento con rinvio', eur(cost.bedplate)] as [string, string]] : []),
    ['Totale (IVA esclusa)', cost.machine !== null && (!withBed || cost.bedplate !== null)
      ? `€ ${fmt((cost.machine + (withBed ? cost.bedplate ?? 0 : 0)) / 100, 2)}` : `€ ${BLANK}`],
  ];
  B.push({ t: 'kv', rows: [...priced, ['Consegna richiesta', BLANK], ['Resa e imballo', BLANK], ['Pagamento', BLANK], ['Validità dell’offerta', BLANK]] });
  if (cost) B.push({ t: 'p', style: 'note', text: 'Prezzi dal listino dell’azienda in LiftPilot, IVA esclusa: da confermare con l’offerta del costruttore.' });
  const main = c.sources[0];
  B.push({ t: 'p', style: 'note', text: `Dati di catalogo letti il ${CATALOG_READ_ON}${main ? ` ${SOURCE[main]}` : ''} (la fonte al punto 2): confermarli con la scheda tecnica `
    + 'e l’offerta del costruttore prima dell’ordine. Questa è una bozza generata da LiftPilot: diventa un ordine con timbro e firma del committente, '
    + 'che ne verifica il contenuto. Carbon Stealth VCC, che fornisce il software, non è parte dell’ordine né della fornitura. '
    + `${c.brand} è un marchio del suo titolare, citato solo per identificare il prodotto.` });
  B.push({ t: 'sign', labels: [`Timbro e firma del committente (${o.company})`, 'Data', 'Accettazione del fornitore'] });

  return {
    meta: {
      title: `Bozza d’ordine argano ${machineName(c)}`, subject: `Ordine dell’argano per ${pr.name}`, author: o.author ?? o.company,
      header: `${o.company} · Bozza d’ordine · ${pr.name}`, footer: `LiftPilot · bozza del ${when(o.generatedAt)}`,
      code: `${o.record.kind === 'design' ? 'Progetto' : 'Calcolo'} ${o.record.id} · SHA-256 ${o.record.sha256.slice(0, 16)}…`,
    },
    blocks: B,
    ...(o.room.length || o.logo ? { drawing: { ...ORDER_DRAWING, images: o.logo ? { logo: o.logo } : {} } } : {}),
  };
}
