// The component data the workspace asks (RT plan §3.3, src/lib/rt/input-componenti.ts): only what the base does not hold,
// block by block in the order of the document's sections, each field with its unit and the ranges of the schema, and
// on which path it is asked (the room path's survey does not know the rails, buffers, governor or doors; the shaft path's
// design does). A block of data typed by hand carries its source. The labels are messages/rt/ui.json `campi.<gruppo>.<k>`.
// Pure (client and server).
import { RAIL_TYPES } from '@/shaft/rails';
import { GOVERNORS } from '@/shaft/governor';
import { AMMORTIZZATORI_TIPI, CLASSI_FUOCO, CONTRAPPESO_INTERVENTI, CORRENTI, PORTE_TIPI } from '@/lib/rt/input-componenti';
import type { RtPath, SezioneKey } from '@/lib/rt/types';

export type Spec = (
  | { t: 'num'; unit: string; min: number; max: number; step?: number }
  | { t: 'enum'; opts: readonly string[]; raw?: true }
  | { t: 'text'; max: number }
  | { t: 'bool' }
  | { t: 'fonte' }
  /** a value read on its own document: { valore, fonte } */
  | { t: 'valFonte'; unit: string; min: number; max: number; step?: number }
) & {
  /** the path under the block («certificato.vMax») */
  k: string;
  /** asked only on this path */
  p?: RtPath;
  /** asked only while a field of the block has this value */
  when?: { k: string; eq: string };
  /** asked only on this part of UNI 10411 */
  norma?: '10411-1' | '10411-11';
};

export interface Blocco {
  /** the path under `componenti` («ammortizzatori.cabina») */
  path: string;
  sezione: SezioneKey;
  /** the labels' group in ui.json campi.* and the block's title in ui.json blocchi.* */
  gruppo: string;
  titolo: string;
  campi: readonly Spec[];
}

const V = { unit: 'V', min: 12, max: 400 } as const;
const CORRENTE = { t: 'enum', opts: CORRENTI } as const;
const PROFILI = [...RAIL_TYPES, 'custom'] as const;
const custom = (k: string, unit: string, max: number): Spec => ({ t: 'num', k: `custom.${k}`, unit, min: 0, max, step: 0.01, when: { k: 'profilo', eq: 'custom' } });
const CUSTOM: readonly Spec[] = [
  { t: 'text', k: 'custom.sigla', max: 40, when: { k: 'profilo', eq: 'custom' } }, custom('A', 'mm²', 50000), custom('Ix', 'mm⁴', 1e9), custom('Iy', 'mm⁴', 1e9),
  custom('Wx', 'mm³', 1e7), custom('Wy', 'mm³', 1e7), custom('iMin', 'mm', 500), custom('c', 'mm', 100), custom('q', 'kg/m', 200),
];
const MATERIALE: readonly Spec[] = [
  { t: 'enum', k: 'profilo', opts: PROFILI, raw: true }, ...CUSTOM, { t: 'num', k: 'Rm', unit: 'N/mm²', min: 370, max: 520 },
  { t: 'enum', k: 'allungamento', opts: ['oltre12', 'da8a12'] },
];
const ammortizzatore = (path: string, titolo: string): Blocco => ({ path, sezione: 'ammortizzatori', gruppo: 'ammortizzatore', titolo, campi: [
  { t: 'enum', k: 'tipo', opts: AMMORTIZZATORI_TIPI, p: 'locale' }, { t: 'num', k: 'numero', unit: '', min: 1, max: 4, step: 1, p: 'locale' },
  { t: 'num', k: 'corsa', unit: 'mm', min: 10, max: 1500, p: 'locale' }, { t: 'num', k: 'altezza', unit: 'mm', min: 20, max: 2500, p: 'locale' },
  { t: 'num', k: 'forzaCorsaCompleta', unit: 'N', min: 1, max: 500000 },
  { t: 'text', k: 'certificato.numero', max: 80 }, { t: 'num', k: 'certificato.vMax', unit: 'm/s', min: 0.1, max: 10, step: 0.01 },
  { t: 'num', k: 'certificato.massaMin', unit: 'kg', min: 1, max: 20000 }, { t: 'num', k: 'certificato.massaMax', unit: 'kg', min: 1, max: 20000 },
  { t: 'fonte', k: 'fonte' },
] });
const porta = (path: string, titolo: string, piano: boolean): Blocco => ({ path, sezione: 'porte', gruppo: 'porta', titolo, campi: [
  { t: 'enum', k: 'tipo', opts: PORTE_TIPI, p: 'locale' },
  ...(piano ? [{ t: 'enum', k: 'fuocoEsistente', opts: CLASSI_FUOCO, raw: true } as const, { t: 'enum', k: 'fuocoNuova', opts: CLASSI_FUOCO, raw: true } as const] : []),
  { t: 'num', k: 'altezzaEsistente', unit: 'mm', min: 1500, max: 2500 }, { t: 'num', k: 'altezzaNuova', unit: 'mm', min: 1500, max: 2500, p: 'locale' },
  { t: 'num', k: 'tensioneOperatore', ...V }, { ...CORRENTE, k: 'corrente' }, { t: 'bool', k: 'serratureNuove' }, { t: 'fonte', k: 'fonte' },
] });

/** The blocks in the order of the document's sections. */
export const BLOCCHI: readonly Blocco[] = [
  { path: 'quadro', sezione: 'quadro', gruppo: 'quadro', titolo: 'quadro', campi: [
    // the locks' contacts and the electrical part kept: UNI 10411-1, 11.1.2 (under -11 that clause is the exemptions)
    { t: 'num', k: 'tensioneComando', ...V }, { ...CORRENTE, k: 'correnteComando' }, { t: 'num', k: 'tensioneContattiSerrature', ...V, norma: '10411-1' },
    { ...CORRENTE, k: 'correnteContatti', norma: '10411-1' }, { t: 'enum', k: 'impiantoElettrico', opts: ['rifatto', 'compatibile_contrassegnato'], norma: '10411-1' },
    { t: 'text', k: 'costruttore', max: 80 }, { t: 'text', k: 'modello', max: 80 }, { t: 'fonte', k: 'fonte' },
  ] },
  { path: 'cabina', sezione: 'cabina', gruppo: 'cabina', titolo: 'cabina', campi: [
    { t: 'num', k: 'superficie', unit: 'm²', min: 0.1, max: 20, step: 0.01, p: 'locale' }, { t: 'fonte', k: 'fonte', p: 'locale' },
  ] },
  { path: 'guideCabina', sezione: 'guideCabina', gruppo: 'guide', titolo: 'guideCabina', campi: [
    ...MATERIALE, { t: 'enum', k: 'arcata', opts: ['centrale', 'zaino'], p: 'locale' },
    { t: 'num', k: 'A', unit: 'mm', min: 400, max: 3000, p: 'locale' }, { t: 'num', k: 'B', unit: 'mm', min: 400, max: 3000, p: 'locale' },
    { t: 'num', k: 'xC', unit: 'mm', min: -2000, max: 2000, p: 'locale' }, { t: 'num', k: 'yC', unit: 'mm', min: -2000, max: 2000, p: 'locale' },
    { t: 'num', k: 'xS', unit: 'mm', min: -2000, max: 2000 }, { t: 'num', k: 'yS', unit: 'mm', min: -2000, max: 2000 },
    { t: 'num', k: 'h', unit: 'mm', min: 800, max: 6000, p: 'locale' }, { t: 'enum', k: 'pattini', opts: ['rulli', 'strisciamento'], p: 'locale' },
    { t: 'enum', k: 'accessi', opts: ['A', 'AB', 'A90'], p: 'locale' }, { t: 'num', k: 'colonna', unit: 'm', min: 2, max: 300, step: 0.1, p: 'locale' },
    { t: 'fonte', k: 'fonte' },
  ] },
  { path: 'guideContrappeso', sezione: 'guideContrappeso', gruppo: 'guide', titolo: 'guideContrappeso', campi: [
    ...MATERIALE, { t: 'num', k: 'larghezza', unit: 'mm', min: 100, max: 2000, p: 'locale' }, { t: 'num', k: 'profondita', unit: 'mm', min: 50, max: 400, p: 'locale' },
    { t: 'num', k: 'h', unit: 'mm', min: 500, max: 4000, p: 'locale' }, { t: 'bool', k: 'sottoFossaAccessibile', p: 'locale' },
    { t: 'num', k: 'colonna', unit: 'm', min: 2, max: 300, step: 0.1, p: 'locale' }, { t: 'fonte', k: 'fonte' },
  ] },
  ammortizzatore('ammortizzatori.cabina', 'ammortizzatoriCabina'), ammortizzatore('ammortizzatori.contrappeso', 'ammortizzatoriContrappeso'),
  { path: 'limitatore', sezione: 'limitatore', gruppo: 'limitatore', titolo: 'limitatore', campi: [
    { t: 'enum', k: 'modello', opts: [...GOVERNORS.map((g) => g.model), 'manuale'], raw: true, p: 'locale' },
    { t: 'num', k: 'manuale.D', unit: 'mm', min: 100, max: 600, p: 'locale', when: { k: 'modello', eq: 'manuale' } },
    { t: 'num', k: 'manuale.d', unit: 'mm', min: 4, max: 16, step: 0.1, p: 'locale', when: { k: 'modello', eq: 'manuale' } },
    { t: 'fonte', k: 'manuale.fonte', p: 'locale', when: { k: 'modello', eq: 'manuale' } },
    { t: 'valFonte', k: 'vScatto', unit: 'm/s', min: 0.2, max: 12, step: 0.01 },
    { t: 'num', k: 'fune.d', unit: 'mm', min: 4, max: 16, step: 0.1 }, { t: 'num', k: 'fune.caricoRottura', unit: 'N', min: 5000, max: 100000 },
    { t: 'text', k: 'fune.formazione', max: 40 }, { t: 'fonte', k: 'fune.fonte' },
    { t: 'valFonte', k: 'forzaTiro', unit: 'N', min: 100, max: 20000 }, { t: 'valFonte', k: 'forzaParacadute', unit: 'N', min: 50, max: 10000 },
    { t: 'valFonte', k: 'limiteOrigine', unit: 'm/s', min: 0.2, max: 12, step: 0.01, norma: '10411-1' },
  ] },
  porta('porte.piano', 'portePiano', true), porta('porte.cabina', 'porteCabina', false),
  { path: 'contrappeso', sezione: 'contrappeso', gruppo: 'contrappeso', titolo: 'contrappeso', campi: [{ t: 'enum', k: 'intervento', opts: CONTRAPPESO_INTERVENTI }] },
];

/** The fields of a block asked on this path and part, with the block's values (the conditional ones while they apply). */
export const campiDi = (b: Blocco, path: RtPath, norma: string, valore: (k: string) => unknown): Spec[] =>
  b.campi.filter((c) => (!c.p || c.p === path) && (!c.norma || c.norma === norma) && (!c.when || valore(c.when.k) === c.when.eq));
