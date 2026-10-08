// Relazione tecnica (Italian) of a machine replacement: the object and what the law asks of it, the installation as it
// is, the existing machine beside the new one, where the new machine stands in the machine room (the survey, its
// support, the diverting pulley, the drops, the openings in the slab, the plan and section B-B), the checks of the room,
// of the support and of the drops, the loads on the slab, the summary of the relazione di calcolo, the result under each
// standard, the adaptations, the obligations and the points to check on site, the documents attached, the note on the
// software and the signature. Our own words, clause numbers and values only. Pure.
import calcIt from '../../../messages/calc/it.json';
import appIt from '../../../messages/it.json';
import type { FormValues } from '@/calc/types';
import type { SheetImage } from '@/drawing';
import { isUpperLimit, shownValue } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import type { ShaftCheck } from '@/shaft/types';
import { NORMA_SIGLA, ambitoOf, type Collaudo } from '../lift/collaudo';
import { carichiOf } from '../lift/modifica';
import type { Plant } from '../plant';
import { textsFor, verdictStatus } from '../present/texts';
import { makePres } from '../present/tr';
import type { RoomDerived } from '../room/derive';
import type { Survey } from '../room/survey';
import { machineText } from '../tavole/views';
import { surveyLoad, surveySheetData, surveyedLabel } from '../tavole/survey-data';
import { ESITI_TECNICA, EXISTING_NOTE, adaptSection, adempimentiBlocks, collaudoRows, collaudoText, esitiBlocks, esitoOf } from './collaudo';
import { shapeRows } from './machine-shape';
import type { BlockStatus, ReportBlock, ReportDoc } from './model';
import { TECNICA_DRAWING, roomRows, surveyBlocks } from './tecnica-room';
import { existingNewBlocks, hookBlocks, openingsBlocks, p4Block, siteChecks } from './tecnica-site';
import { shapeOf } from '../catalog/shapes';

export interface TecnicaInput {
  room: { id: string; label: string | null; createdAt: Date; sha256: string; engineVersion: string; author: string | null };
  calc: { id: string; label: string | null; createdAt: Date; sha256: string; engineVersion: string; profileId: string };
  project: { name: string; address: string | null; city: string | null; province: string | null; plantNumber: string | null; client: string | null };
  company: string;
  companyCity?: string | null;
  logo?: SheetImage | null;
  values: FormValues;
  survey: Survey;
  derived: RoomDerived;
  collaudo: Collaudo;
  plant: Plant;
  /** the drawing sets issued from this room: their number and revision */
  sets: readonly { number: string; revision: number }[];
  generatedAt: Date;
}

const LAYOUT: Readonly<Record<string, string>> = { topDefl: 'argano in alto con puleggia di rinvio nel locale', top: 'argano in alto a tiro diretto' };

export function buildTecnica(r: TecnicaInput): ReportDoc {
  const P = makePres(calcIt, 'it-IT'), X = textsFor(P), { t, fmt } = P, d = r.derived, C = r.collaudo;
  const { ctx, res, old } = d.analysis, { I, N } = ctx, pr = r.project, s = r.survey;
  const when = (x: Date): string => new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(x);
  const place = [pr.address, pr.city, pr.province].filter(Boolean).join(', '), named = machineText(r.plant, d.made);
  const B: ReportBlock[] = [];
  let n = 0;
  const section = (title: string): void => { n += 1; B.push({ t: 'h2', text: `${n}. ${title}` }); };
  const st = (x: 'ok' | 'warn' | 'fail' | 'info'): string => X.st(x);

  B.push({ t: 'letterhead', logo: r.logo ? 'logo' : null, from: [r.company, ...(r.companyCity ? [r.companyCity] : [])], to: [] });
  B.push({ t: 'h1', text: 'Relazione tecnica — sostituzione dell’argano' });
  B.push({ t: 'sub', text: place ? `${pr.name} · ${place}` : pr.name });
  B.push({ t: 'box', text: 'BOZZA DA VERIFICARE E FIRMARE. Documento generato dal software LiftPilot con i dati del rilievo e del calcolo inseriti '
    + 'dall’azienda: diventa relazione tecnica quando il tecnico incaricato lo verifica e lo firma, e la responsabilità è sua.' });
  B.push({ t: 'kv', rows: [
    ['Azienda', r.company], ['Impianto', pr.name], ['Indirizzo', place || '—'], ['Numero di matricola', pr.plantNumber ?? '—'], ['Proprietario o committente', pr.client ?? '—'],
    ['Rilievo del locale', `${r.room.id}${r.room.label ? ` · ${r.room.label}` : ''} · ${when(r.room.createdAt)}${r.room.author ? ` · ${r.room.author}` : ''}`],
    ['Calcolo dell’argano', `${r.calc.id}${r.calc.label ? ` · ${r.calc.label}` : ''} · ${when(r.calc.createdAt)}`],
    ['Impronte SHA-256', `rilievo ${r.room.sha256}\ncalcolo ${r.calc.sha256}`],
    ['Motori', `rilievo ${r.room.engineVersion} · calcolo ${r.calc.engineVersion} · profilo normativo ${r.calc.profileId}`], ['Documento generato il', when(r.generatedAt)],
  ] });

  section('Oggetto');
  B.push({ t: 'p', text: `Sostituzione dell’argano dell’impianto con un argano geared ${named ? `(${named}) ` : ''}— ${LAYOUT[I.layout] ?? I.layout}, taglia ${I.r}:1. `
    + 'La relazione descrive l’impianto com’è, l’argano esistente e quello nuovo, la sistemazione del nuovo nel locale macchina (basamento, '
    + 'puleggia di rinvio, calate, aperture nella soletta), i carichi sulla soletta e le verifiche del locale; le verifiche della macchina sono nella '
    + `relazione di calcolo allegata, riassunte nella sezione «Verifiche della nuova macchina».${collaudoText(C, true, ESITI_TECNICA)}` });

  section('Riferimenti normativi');
  B.push({ t: 'grid', head: ['Documento', 'Per che cosa'], widths: [0.38, 0.62], align: ['l', 'l'], rows: [
    ['DPR 162/1999 e s.m.i., art. 2 c.1 lett. cc), artt. 12 e 14', 'la sostituzione del macchinario è una modifica costruttiva: comunicazioni e verifica straordinaria'],
    [NORMA_SIGLA[C.norma], 'norma tecnica del collaudo della modifica'],
    ['UNI EN 81-20:2020, punti 5.2.3 e 5.2.6.3.2.1', 'porta, altezza libera e superficie libera davanti al quadro nel locale macchina'],
    ['UNI EN 81-50:2020', 'verifiche della relazione di calcolo (aderenza, funi)'],
    ['NTC 2018, §3.1.4, §4.2.4.1.1 e §8.4.1', 'carichi del macchinario, verifica delle putrelle, intervento locale su un edificio esistente'],
  ] });

  section('L’impianto com’è');
  B.push({ t: 'kv', rows: [
    ...collaudoRows(C, true, carichiOf(r.values)), ['Disposizione', `${LAYOUT[I.layout] ?? I.layout}, taglia ${I.r}:1`], [t('Q'), `${fmt(I.Q, 0)} kg`], [t('P'), `${fmt(I.P, 0)} kg`],
    [`${t('k')} · M_cw`, `${fmt(res.k, 3)} · ${fmt(res.Mcw, 0)} kg`], [t('v'), `${fmt(I.v, 2)} m/s`], [`${t('H')} · ${t('L0')}`, `${fmt(I.H, 2)} m · ${fmt(I.L0, 2)} m`],
    ...(I.layout === 'topDefl' ? [[`${t('dx')} · ${t('h')} · ${t('Dp')}`, `${fmt(I.dx, 3)} m · ${fmt(I.h, 3)} m · ${fmt(I.Dp, 0)} mm`] as [string, string]] : []),
  ] });

  section('Argano esistente e argano nuovo');
  const rowsN = X.machineRows(N, res), rowsO = old ? X.machineRows(ctx.O, old, true) : null;
  B.push({ t: 'grid', head: ['Grandezza', 'Esistente', 'Nuovo'], widths: [0.3, 0.35, 0.35], align: ['l', 'l', 'l'],
    rows: [['Costruttore e modello', '—', named || 'non di catalogo: dati inseriti nel calcolo'], ['Massa', ctx.compare && ctx.O.mass > 0 ? `${fmt(ctx.O.mass, 0)} kg` : '—', N.mass > 0 ? `${fmt(N.mass, 0)} kg` : 'non inserita'],
      // the ropes' row is named for the new machine: here for both
      ...rowsN.map(([k, v], i) => [k === t('g_ropes') ? 'Funi' : k, rowsO?.[i]?.[1] ?? '—', v])] });
  if (!ctx.compare) B.push({ t: 'p', style: 'note', text: 'L’argano esistente non è stato inserito nel calcolo: i suoi dati vanno rilevati sulla targa e sul libretto.' });
  const S = d.made ? shapeOf(d.made.brand, d.made.model) : null;
  if (S) B.push({ t: 'kv', rows: shapeRows(S, N.D, fmt, d.M.rinvio ?? null) });
  B.push({ t: 'p', style: 'note', text: 'Confermare i dati del nuovo argano con la scheda tecnica e l’offerta del costruttore, da allegare.' });
  B.push({ t: 'verdict', text: `Verifiche dell’argano nuovo: ${X.verdictText(res)}`, status: verdictStatus(res) });

  section('Sistemazione nel locale macchina');
  B.push({ t: 'kv', rows: roomRows(s, d, fmt) });
  // the openings with their place, the hook and the masses lifted (round 36)
  B.push(...openingsBlocks(d, s, fmt), ...hookBlocks(d, fmt));
  B.push(...surveyBlocks(d, { ...d.M, label: named }));

  section('Verifiche del locale, del basamento e delle calate');
  const sheet = surveySheetData({ ...r, set: { number: '', issuedAt: r.generatedAt, author: '', revisions: [] }, company: { name: r.company, logo: null } }, d, 1);
  const labels: Readonly<Record<string, string>> = appIt.shaft;
  // the checks as sheet 1 prints them: the beams at the sheet's load (the data of the installation may change it)
  const checks: readonly ShaftCheck[] = surveyLoad(d, r.plant).checks;
  const out = (c: ShaftCheck): { text: string; status: BlockStatus } => esitoOf(C, c.id, st(c.status), c.status);
  const withUnit = (v: string, c: ShaftCheck): string => `${v}${c.unit ? ` ${c.unit}` : ''}`;
  // the room's door in its sizes, as sheet 1 writes it
  const row = (c: ShaftCheck): string[] => (c.id === 'm_door'
    ? [(labels.c_m_door ?? c.id).replace(', margine', ''), `${s.room.doorW} × ${s.room.doorH} mm`, `≥ ${KV_VERT.doorMinW} × ${KV_VERT.doorMinH} mm`, out(c).text]
    : [surveyedLabel(c.id, labels[`c_${c.id}`] ?? c.id, s), c.value == null ? '—' : withUnit(shownValue(c, fmt), c), c.limit == null ? '—' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${withUnit(fmt(c.limit, c.dec), c)}`, out(c).text]);
  B.push({ t: 'grid', head: [t('col_item'), t('col_val'), t('col_lim'), t('col_res')], widths: [0.52, 0.16, 0.16, 0.16], align: ['l', 'r', 'r', 'l'], statusCol: 3,
    rows: checks.map(row),
    status: checks.map((c) => out(c).status) });
  if (checks.some((c) => ambitoOf(C, c.id) === 'existing')) B.push({ t: 'p', style: 'note', text: EXISTING_NOTE });

  section('Carichi sul basamento e sulla soletta');
  B.push({ t: 'kv', rows: [...sheet.loads.map(([k, v, u]): [string, string] => [k.charAt(0) + k.slice(1).toLowerCase(), `${v}${u ? ` ${u}` : ''}`]),
    ...sheet.P.map(([k, v]): [string, string] => [`Carico ${k.slice(0, 2)}: ${k.slice(3).toLowerCase()}`, v === '—' ? '—' : `${v} daN`])] });
  if (ctx.compare && ctx.O.mass > 0 && N.mass > 0) {
    B.push({ t: 'p', text: `Massa dell’argano: esistente ${fmt(ctx.O.mass, 0)} kg, nuovo ${fmt(N.mass, 0)} kg (${N.mass >= ctx.O.mass ? '+' : '−'}${fmt(Math.abs(N.mass - ctx.O.mass), 0)} kg sulla soletta).` });
  }
  B.push({ t: 'p', style: 'note', text: 'Carichi non contemporanei. La verifica della soletta e degli appoggi del basamento spetta al tecnico strutturale incaricato dal '
    + 'committente (NTC 2018, §8.4.1: intervento locale; §3.1.4: carichi del macchinario).' });
  // P4 without the governor's load; the existing machine's loads and bearings beside the new one's (round 36)
  B.push(...p4Block(r.plant), ...existingNewBlocks(d, s, r.plant, fmt));

  section('Verifiche della nuova macchina (dalla relazione di calcolo)');
  const esiti = res.checks.map((c) => esitoOf(C, c.id, st(c.status), c.status));
  B.push({ t: 'grid', head: [t('col_item'), t('col_val'), t('col_lim'), t('col_res')], widths: [0.5, 0.17, 0.17, 0.16], align: ['l', 'r', 'r', 'l'], statusCol: 3,
    rows: res.checks.map((c, i) => [X.checkText(c), X.checkValue(c, N), X.checkLimit(c, N), esiti[i]?.text ?? '']), status: esiti.map((e) => e.status) });

  section(ESITI_TECNICA);
  B.push(...esitiBlocks(C, [...res.checks, ...checks], (x) => st(x)));
  const adapt = adaptSection(C, true, t);
  section(adapt.title);
  B.push(...adapt.blocks);
  section('Adempimenti e punti da verificare in sito');
  B.push(...adempimentiBlocks(C, true));
  B.push({ t: 'h3', text: 'Rilievi in sito per la sostituzione' });
  B.push({ t: 'list', items: [
    'Posizione delle calate esistenti (funi lato cabina e lato contrappeso) rispetto ai muri del vano, come nelle tavole',
    'Aperture nella soletta: dimensioni e posizione rispetto alle nuove calate',
    'Dimensioni del locale, della porta e dello spazio davanti al quadro, come nel rilievo',
    ...(d.M.Dp > 0 ? ['Distanze dx e h tra puleggia di frizione e puleggia di rinvio, come nel calcolo'] : []),
    'Appoggi del basamento sulla soletta o nei muri e fissaggio secondo il costruttore',
    ...siteChecks(s),
  ] });

  section('Allegati');
  B.push({ t: 'list', items: [
    `Relazione di calcolo dell’argano, calcolo ${r.calc.id} (SHA-256 ${r.calc.sha256.slice(0, 16)}…)`,
    r.sets.length ? `Tavole di progetto n. ${r.sets.map((x) => `${x.number}${x.revision ? ` R${x.revision}` : ''}`).join(', ')}` : 'Tavole di progetto: da emettere dal rilievo del locale',
    'Scheda tecnica e dichiarazioni del costruttore del nuovo argano (da allegare)',
  ] });

  section(t('rep_legal_title'));
  B.push({ t: 'p', text: t('rep_legal') });
  B.push({ t: 'sign', labels: [t('rep_sign'), t('rep_signature'), t('rep_date')] });

  const short = pr.name.length > 70 ? `${pr.name.slice(0, 69)}…` : pr.name;
  return {
    meta: {
      title: `Relazione tecnica — ${pr.name}`, subject: 'Sostituzione dell’argano: relazione tecnica', author: r.company,
      header: `LiftPilot · Relazione tecnica · ${short}`, footer: `Rilievo ${r.room.id} · calcolo ${r.calc.id} · motore ${r.room.engineVersion}`,
      code: `SHA-256 ${r.room.sha256}`, notice: t('rep_footer'),
    },
    blocks: B,
    drawing: { ...TECNICA_DRAWING, images: r.logo ? { logo: r.logo } : {} },
  };
}
