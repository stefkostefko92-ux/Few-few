// The component sections of the relazione tecnica di modifica and why each is in (RT plan §4.3; registry entry
// relazione.sezioni, norme-voci.ts). A section is in when one of its parts is among the parts the modification replaces
// or changes, when one of its cases is among the cases the documents give the record (obblighi.ts casiVariazione), on
// the room path for the machine room, or when the engineer adds it with a reason; what the rule brings cannot be taken
// out. Each part and case carries the clause tokens it rests on, per part of UNI 10411: rt-sezioni.test.ts proves each
// token is in the same part's or case's text of our registries (OBBLIGHI_PARTI, OBBLIGHI_VARIAZIONI, OBBLIGHI_RT, the
// machine's adaptations), never in a norm's text. The changes that only bring points (the travel over 8 m or
// shortened, the speed within its limits, the changes the documents deny) add no section: their points are printed in
// «Adeguamenti e adempimenti». The third-party template's decision rules are not used. Pure.
import appIt from '../../../messages/it.json';
import { NORMA_SIGLA, PARTI, type Collaudo, type NormaCollaudo, type Parte } from '../lift/collaudo';
import type { TipoIntervento } from '../lift/intervento';
import type { Norma10411 } from '../lift/modifica';
import { KL } from '../lift/norme';
import { casiVariazione } from '../lift/obblighi';
import type { CasoVariazione } from '../lift/obblighi-variazioni';
import type { FormValues } from '@/calc/types';
import type { Motivo, RtPath, SezioneKey, SezioneRt } from './types';

type PerNorma<K extends string> = Readonly<Record<Norma10411, Partial<Readonly<Record<K, readonly string[]>>>>>;

export interface RegolaSezione {
  /** both paths; the room path (and a lift design with a machine room over the shaft); the shaft path only */
  percorso: 'entrambi' | 'locale' | 'vano';
  /** the parts that bring the section, with their clause tokens */
  parti: PerNorma<Parte>;
  /** the cases that bring it, with their clause tokens */
  casi: PerNorma<CasoVariazione>;
}

/** The sections in the order of the document, with their titles. */
export const SEZIONI: readonly { key: SezioneKey; titolo: string }[] = [
  { key: 'quadro', titolo: 'Quadro di manovra' }, { key: 'cabina', titolo: 'Cabina e carichi' }, { key: 'funi', titolo: 'Funi di trazione' },
  { key: 'argano', titolo: 'Argano' }, { key: 'locale', titolo: 'Locale del macchinario' }, { key: 'guideCabina', titolo: 'Guide della cabina' },
  { key: 'guideContrappeso', titolo: 'Guide del contrappeso' }, { key: 'ammortizzatori', titolo: 'Ammortizzatori' },
  { key: 'limitatore', titolo: 'Limitatore di velocità e paracadute' }, { key: 'porte', titolo: 'Porte di piano e di cabina' },
  { key: 'contrappeso', titolo: 'Contrappeso' }, { key: 'vano', titolo: 'Vano, fossa e testata' },
];
export const titoloSezione = (k: SezioneKey): string => SEZIONI.find((s) => s.key === k)?.titolo ?? k;

export const SEZIONI_PER_CASO: Readonly<Record<SezioneKey, RegolaSezione>> = {
  quadro: {
    percorso: 'entrambi', parti: { '10411-1': { controller: ['11.1'] }, '10411-11': { controller: ['11.1'] } },
    casi: {
      '10411-1': { loadP1: ['6.11'], speedUp: ['15.9', '15.14', '15.15'], travelUp: ['16 f)'] },
      '10411-11': { loadP1: ['6.11'], loadP2: ['6.1–6.13'], speedUp: ['15 g)', '15 h)'], travelUp: ['16 e)'] },
    },
  },
  cabina: {
    percorso: 'entrambi',
    parti: { '10411-1': { car: ['22'], sling: ['6.2', '22 b)'], slidingDoors: ['13.1.1'] }, '10411-11': { car: ['22'], sling: ['6.9'], slidingDoors: ['13.1.1'] } },
    casi: {
      '10411-1': { loadP1: ['6.9'], loadP2: ['6.1'], loadCalo: ['6.1'], loadRapporto: ['6.1'], loadDocumentati: ['6.1'], loadCabinaNuova: ['22'], loadCabinaArcata: ['6.1'] },
      '10411-11': { loadP1: ['6.9'], loadCalo: ['6.1'], loadDocumentati: ['6.1'], loadCabinaNuova: ['22'], loadCabinaArcata: ['6.1'] },
    },
  },
  funi: {
    percorso: 'entrambi', parti: { '10411-1': { ropes: ['17'], machine: ['14.1'] }, '10411-11': { ropes: ['17'], machine: ['14'] } },
    casi: {
      '10411-1': { loadP1: ['6.8'], loadP2: ['6.8'], loadRapporto: ['App. D'], speedUp: ['15.8'], travelUp: ['16 h)'] },
      '10411-11': { loadP1: ['6.3'], loadP2: ['6.1–6.13'], speedUp: ['15 d)'], travelUp: ['16 g)'] },
    },
  },
  argano: {
    percorso: 'entrambi', parti: { '10411-1': { machine: ['14'], ucm: ['6.12', '14.4 c)–d)'] }, '10411-11': { machine: ['14'], ucm: ['6.10', '14.3 a)'] } },
    casi: { '10411-1': { loadP1: ['6.10', '6.12'] }, '10411-11': { loadP1: ['6.10', '6.12'], loadP2: ['6.1–6.13'], speedUcm: ['15 i)'] } },
  },
  locale: {
    percorso: 'locale', parti: { '10411-1': { machine: ['9.1–9.2'], room: ['8'] }, '10411-11': { machine: ['9.2'], room: ['8'] } },
    casi: { '10411-1': {}, '10411-11': {} },
  },
  guideCabina: {
    percorso: 'entrambi', parti: { '10411-1': { rails: ['4'], safetyGear: ['15.6'] }, '10411-11': { rails: ['4.3'] } },
    casi: {
      '10411-1': { loadP1: ['6.5'], loadP2: ['6.5'], speedUp: ['15.5', '15.6'], travelUp: ['16 g)'] },
      '10411-11': { loadP1: ['6.5'], loadP2: ['6.1–6.13'], speedUp: ['15 j)'], travelUp: ['16 f)'] },
    },
  },
  guideContrappeso: {
    percorso: 'entrambi', parti: { '10411-1': { rails: ['4'], cw: ['6.13'] }, '10411-11': { rails: ['4.3'], cw: ['6.1'] } },
    casi: { '10411-1': { loadP2: ['6.13'], speedUp: ['15.7'], travelUp: ['16 a)'] }, '10411-11': { loadP2: ['6.1–6.13'], speedUp: ['15 k)'], travelUp: ['16 f)'] } },
  },
  ammortizzatori: {
    percorso: 'entrambi', parti: { '10411-1': { buffers: ['4'] }, '10411-11': { buffers: ['4.3'] } },
    casi: {
      '10411-1': { loadP1: ['6.4'], loadP2: ['6.4'], loadCalo: ['6.1'], loadRapporto: ['6.1'], speedUp: ['15.2'], speedDown: ['15.2'] },
      '10411-11': { loadP1: ['6.4'], loadP2: ['6.1–6.13'], loadCalo: ['6.1'], speedUp: ['15 a)'] },
    },
  },
  limitatore: {
    percorso: 'entrambi',
    parti: { '10411-1': { governor: ['18'], safetyGear: ['6.6', '6.7'] }, '10411-11': { governor: ['18'], safetyGear: ['6.6', '6.7'] } },
    casi: {
      '10411-1': { loadP1: ['6.6'], loadCalo: ['6.1'], speedUp: ['15.3', '15.13'], speedDown: ['15.17'], travelUp: ['16 i)'] },
      '10411-11': { loadP1: ['6.6'], loadP2: ['6.1–6.13'], loadCalo: ['6.1'], speedUp: ['15 b)', '15 f)'], travelUp: ['16 h)'] },
    },
  },
  porte: {
    percorso: 'entrambi',
    parti: {
      '10411-1': { landingDoors: ['19', '12.2'], carDoors: ['12.1', '12.3'], slidingDoors: ['13.1.2'] },
      '10411-11': { landingDoors: ['19'], carDoors: ['12.1–12.3'], slidingDoors: ['13.1.2'] },
    },
    casi: { '10411-1': { speedUp: ['15.10'], travelUp: ['16 k)'] }, '10411-11': {} },
  },
  contrappeso: {
    percorso: 'entrambi', parti: { '10411-1': { cw: ['6.1'] }, '10411-11': { cw: ['6.1'] } },
    casi: { '10411-1': { loadP2: ['6.13'], loadCalo: ['6.1'], loadRapporto: ['6.1'], speedUp: ['15.7'], travelUp: ['16 a)'] }, '10411-11': { loadP2: ['6.1–6.13'], loadCalo: ['6.1'] } },
  },
  vano: {
    percorso: 'vano', parti: { '10411-1': {}, '10411-11': {} },
    casi: { '10411-1': { speedUp: ['15.11', '15.12'], travelUp: ['16 j)'] }, '10411-11': { speedUp: ['15 e)'], travelUp: ['16 i)'] } },
  },
};

const pct = (x: number): string => String(Math.round(x * 1000) / 10).replace('.', ',');
/** The cases in words, by the part of UNI 10411 (the motive's text). */
export const CASI_TESTO: Readonly<Record<Norma10411, Partial<Readonly<Record<CasoVariazione, string>>>>> = {
  '10411-1': {
    speedUp: `velocità aumentata di oltre il ${pct(KL.speedInc1)} % sul riferimento`, speedDown: `velocità ridotta di oltre il ${pct(KL.speedDec1)} %`,
    loadP1: 'portata o T* oltre il prospetto 1', loadP2: 'contrappeso oltre il prospetto 2', loadCalo: 'T* o contrappeso diminuiti',
    loadRapporto: 'rapporto tra i carichi appesi lato cabina e lato contrappeso cambiato',
    loadDocumentati: 'carichi indicati come variati, entro i prospetti secondo i carichi documentati',
    loadCabinaNuova: 'cabina nuova sull’arcata esistente, con i carichi documentati', loadCabinaArcata: 'cabina e arcata nuove, con i carichi documentati',
    travelUp: 'corsa allungata',
  },
  '10411-11': {
    speedUp: 'velocità cambiata', speedUcm: 'velocità cambiata: protezione UCM', loadP1: 'T* aumentato', loadP2: 'contrappeso aumentato',
    loadCalo: 'T* o contrappeso diminuiti', loadDocumentati: 'carichi indicati come variati, invariati secondo i carichi documentati',
    loadCabinaNuova: 'cabina nuova sull’arcata esistente, con i carichi documentati', loadCabinaArcata: 'cabina e arcata nuove, con i carichi documentati',
    travelUp: 'corsa allungata',
  },
};

/** A part's name inside a sentence (the form's words: messages/it.json, lift.parte_*). */
export const nomeParte = (p: Parte): string => { const x = appIt.lift[`parte_${p}`]; return x.charAt(0).toLowerCase() + x.slice(1); };
/** «a», «a e b», «a, b e c». */
export const elenco = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const clausola = (n: Norma10411, tokens: readonly string[]): string => `${NORMA_SIGLA[n]}, ${elenco(tokens)}`;

/** The cases in the order the motives list them. */
export const ORDINE_CASI = ['loadP1', 'loadP2', 'loadCalo', 'loadRapporto', 'loadDocumentati', 'loadCabinaNuova', 'loadCabinaArcata',
  'speedUp', 'speedDown', 'speedUcm', 'speedWithin', 'speedWithin50', 'speedDocumentati', 'travelUp', 'travelOver8', 'travelDown', 'travelDocumentati'] as const satisfies readonly CasoVariazione[];
/** Every case of obblighi-variazioni.ts is in the order: a new one does not compile until it is placed (and its
 *  sections decided in SEZIONI_PER_CASO). */
export const CASI_COMPLETI: [Exclude<CasoVariazione, (typeof ORDINE_CASI)[number]>] extends [never] ? true : false = true;

/** What decides the sections: the part of UNI 10411, the path, the parts, the cases, and on the shaft path whether
 *  the lift design draws a machine room over the shaft. */
export interface ContestoSezioni {
  norma: Norma10411;
  path: RtPath;
  parti: readonly Parte[];
  casi: readonly CasoVariazione[];
  localeSulVano: boolean;
}

/** Whether a section can be in the RT of this path (the shaft only on the shaft path; the machine room on the room
 *  path, or with a room drawn over the shaft). */
export function disponibile(key: SezioneKey, x: Pick<ContestoSezioni, 'path' | 'localeSulVano'>): boolean {
  const p = SEZIONI_PER_CASO[key].percorso;
  return p === 'entrambi' || (p === 'vano' ? x.path === 'vano' : x.path === 'locale' || x.localeSulVano);
}

/** The motives the rule gives a section: its parts (in the order of PARTI), its cases, on the room path the survey of
 *  the machine room. None: the rule does not bring it. */
export function motiviAutomatici(key: SezioneKey, x: ContestoSezioni): Motivo[] {
  if (!disponibile(key, x)) return [];
  const r = SEZIONI_PER_CASO[key], n = x.norma;
  const parti = PARTI.filter((p) => x.parti.includes(p)).flatMap((p): Motivo[] => {
    const t = r.parti[n][p];
    return t ? [{ tipo: 'parte', chiave: p, clausola: clausola(n, t), testo: nomeParte(p) }] : [];
  });
  const casi = ORDINE_CASI.filter((c) => x.casi.includes(c)).flatMap((c): Motivo[] => {
    const t = r.casi[n][c];
    return t ? [{ tipo: 'caso', chiave: c, clausola: clausola(n, t), testo: CASI_TESTO[n][c] ?? c }] : [];
  });
  const percorso: Motivo[] = key === 'locale' && x.path === 'locale' && !parti.length
    ? [{ tipo: 'percorso', chiave: 'locale', clausola: clausola(n, ['9.2']), testo: 'locale del macchinario esistente, rilevato' }] : [];
  return [...percorso, ...parti, ...casi];
}

/** The sections of an RT in the document's order: those the rule brings, then — where the rule does not bring them —
 *  those the engineer adds with a reason (a key the rule brings, or one the path does not have, is ignored). */
export function sezioniDa(x: ContestoSezioni, manuali: readonly { key: SezioneKey; motivo: string }[] = []): SezioneRt[] {
  return SEZIONI.flatMap(({ key }): SezioneRt[] => {
    const motivi = motiviAutomatici(key, x);
    if (motivi.length) return [{ key, automatica: true, motivi }];
    const m = manuali.find((s) => s.key === key);
    return m && disponibile(key, x) ? [{ key, automatica: false, motivi: [{ tipo: 'manuale', chiave: 'manuale', clausola: '', testo: m.motivo }], manuale: true }] : [];
  });
}

/** What of the base the sections read (RtBase gives it). */
export interface BaseSezioni {
  path: RtPath;
  norma: Norma10411;
  collaudo: Pick<Collaudo, 'norma' | 'parti' | 'documentato' | 'libretto'>;
  values: FormValues;
  lift?: { layout: { inputs: { room: unknown } } };
}

/** The cases of the record, by the documents against the calculation's values (obblighi.ts). */
export function casiOf(base: Pick<BaseSezioni, 'norma' | 'collaudo' | 'values'>): CasoVariazione[] {
  const c = casiVariazione(base.collaudo, base.norma, base.values);
  return [...c.speed, ...c.load, ...c.travel];
}

export const contestoOf = (base: BaseSezioni): ContestoSezioni => ({
  norma: base.norma, path: base.path, parti: base.collaudo.parti, casi: casiOf(base), localeSulVano: !!base.lift && base.lift.layout.inputs.room != null,
});

/** The sections of the RT on a base, with the engineer's additions. */
export const sezioniOf = (base: BaseSezioni, inputs?: { sezioniManuali?: readonly { key: SezioneKey; motivo: string }[] }): SezioneRt[] =>
  sezioniDa(contestoOf(base), inputs?.sezioniManuali ?? []);

/** Why a calculation cannot have an RT: a «Trasformazione completa» (tested as a new lift: the new lift's documents) or
 *  a test to UNI EN 81-20/50; null when it can. */
export const idoneoRt = (tipo: TipoIntervento, norma: NormaCollaudo): 'trasformazione' | 'en81' | null =>
  (tipo === 'TRASFORMAZIONE_COMPLETA' ? 'trasformazione' : norma === 'en81' ? 'en81' : null);
