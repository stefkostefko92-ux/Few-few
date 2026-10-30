// The component data of the relazione tecnica di modifica (RT plan §3.3): only what the base does not hold — the room
// path's survey knows the machine room, the shaft path's design the rails, buffers, governor and doors —, each block
// strict, the numbers in the units and ranges below. A block of data typed by hand carries its source (fonte.ts, owner's
// decision 7): required at issue when any of the block's sourced fields is entered (CAMPI_CON_FONTE); a value with its
// own document (the governor's rope, forces, plate speed, the limit of the original rule) has its own source. Building the
// schemas twice — `bozza` for the draft, which keeps what is being typed (no minimum length, sources still open) — keeps
// one shape. No catalogue of a third party: rails from RAIL_TYPES, governors from GOVERNORS, the rest by hand. Pure.
import { z } from 'zod';
import { RAIL_TYPES } from '@/shaft/rails';
import { GOVERNORS } from '@/shaft/governor';
import { fonteSchemaDi, testo } from './fonte';
import type { SezioneKey } from './types';

/** The fields of a block that are a component's data: with any of them entered, the block's source is required at
 *  issue. */
export const CAMPI_CON_FONTE = {
  quadro: ['tensioneComando', 'tensioneContattiSerrature', 'costruttore', 'modello'],
  cabina: ['superficie'],
  guide: ['custom', 'Rm'],
  ammortizzatore: ['forzaCorsaCompleta', 'certificato'],
  porta: ['fuocoEsistente', 'fuocoNuova', 'altezzaEsistente', 'tensioneOperatore'],
} as const;

export const CORRENTI = ['ca', 'cc'] as const;
export const PORTE_TIPI = ['scorrevoli_automatiche', 'scorrevoli_manuali', 'battente', 'altro'] as const;
/** Fire classifications of a landing door, from none up (UNI 10411-1:2024, 19.2; the order is the software's reading). */
export const CLASSI_FUOCO = ['nessuna', 'E30', 'E60', 'E120', 'EI30', 'EI60', 'EI120'] as const;
export const AMMORTIZZATORI_TIPI = ['spring', 'pu', 'oil'] as const;
export const CONTRAPPESO_INTERVENTI = ['nessuno', 'zavorre', 'sostituito'] as const;

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const pos = (max: number) => z.number().finite().positive().max(max);
const intero = (min: number, max: number) => z.number().int().min(min).max(max);
const centesimi = (x: number): boolean => Math.abs(x * 100 - Math.round(x * 100)) < 1e-6;
const volt = num(12, 400);

/** A value read on a document, with its source. */
const conFonte = (valore: z.ZodNumber, bozza: boolean) => (bozza
  ? z.object({ valore: valore.optional(), fonte: fonteSchemaDi(true).optional() }).strict()
  : z.object({ valore, fonte: fonteSchemaDi(false) }).strict());

const profiloSchema = z.union([z.enum(RAIL_TYPES), z.literal('custom')]);
/** A rail's section typed by hand [mm², mm⁴, mm³, mm, kg/m]: the form converts cm⁴/cm³ once, before saving. */
const customSchema = (bozza: boolean) => z.object({
  sigla: testo(1, 40, bozza), A: pos(50000), Ix: pos(1e9), Iy: pos(1e9), Wx: pos(1e7), Wy: pos(1e7), iMin: pos(500), c: pos(100), q: pos(200),
}).partial().strict();
const materiale = (bozza: boolean) => ({
  profilo: profiloSchema, custom: customSchema(bozza), Rm: num(370, 520), allungamento: z.enum(['oltre12', 'da8a12']),
});

/** The blocks' schemas. */
export function componentiShape(bozza: boolean) {
  const fonte = fonteSchemaDi(bozza);
  const quadro = z.object({
    tensioneComando: volt, correnteComando: z.enum(CORRENTI), tensioneContattiSerrature: volt, correnteContatti: z.enum(CORRENTI),
    impiantoElettrico: z.enum(['rifatto', 'compatibile_contrassegnato']), costruttore: testo(1, 80, bozza), modello: testo(1, 80, bozza), fonte,
  }).partial().strict();
  const cabina = z.object({ superficie: num(0.1, 20).refine(centesimi), fonte }).partial().strict();
  const guideCabina = z.object({
    ...materiale(bozza), arcata: z.enum(['centrale', 'zaino']), A: num(400, 3000), B: num(400, 3000),
    xC: num(-2000, 2000), yC: num(-2000, 2000), xS: num(-2000, 2000), yS: num(-2000, 2000), h: num(800, 6000),
    pattini: z.enum(['rulli', 'strisciamento']), accessi: z.enum(['A', 'AB', 'A90']), colonna: num(2, 300), fonte,
  }).partial().strict();
  const guideContrappeso = z.object({
    ...materiale(bozza), larghezza: num(100, 2000), profondita: num(50, 400), h: num(500, 4000), sottoFossaAccessibile: z.boolean(), colonna: num(2, 300),
    fonte,
  }).partial().strict();
  const certificato = z.object({ numero: testo(1, 80, bozza), vMax: num(0.1, 10), massaMin: num(1, 20000), massaMax: num(1, 20000) }).partial().strict()
    .refine((c) => c.massaMin === undefined || c.massaMax === undefined || c.massaMin <= c.massaMax, { path: ['massaMax'], message: 'massaMinMax' });
  const ammortizzatore = z.object({
    tipo: z.enum(AMMORTIZZATORI_TIPI), numero: intero(1, 4), corsa: num(10, 1500), altezza: num(20, 2500), forzaCorsaCompleta: pos(500000), certificato, fonte,
  }).partial().strict();
  const limitatore = z.object({
    modello: z.union([z.literal('manuale'), z.string().refine((g) => GOVERNORS.some((x) => x.model === g))]),
    manuale: z.object({ D: num(100, 600), d: num(4, 16), fonte: bozza ? fonte.optional() : fonte }).partial({ D: true, d: true }).strict(),
    vScatto: conFonte(num(0.2, 12), bozza),
    fune: z.object({ d: num(4, 16), caricoRottura: num(5000, 100000), formazione: testo(1, 40, bozza).optional(), fonte: bozza ? fonte.optional() : fonte })
      .partial({ d: true, caricoRottura: true }).strict(),
    forzaTiro: conFonte(num(100, 20000), bozza),
    forzaParacadute: conFonte(num(50, 10000), bozza),
    limiteOrigine: conFonte(num(0.2, 12), bozza),
  }).partial().strict();
  const porta = z.object({
    tipo: z.enum(PORTE_TIPI), fuocoEsistente: z.enum(CLASSI_FUOCO), fuocoNuova: z.enum(CLASSI_FUOCO), altezzaEsistente: num(1500, 2500),
    altezzaNuova: num(1500, 2500), tensioneOperatore: volt, corrente: z.enum(CORRENTI), serratureNuove: z.boolean(), fonte,
  }).partial().strict();
  return {
    quadro, cabina, guideCabina, guideContrappeso,
    ammortizzatori: z.object({ cabina: ammortizzatore, contrappeso: ammortizzatore }).partial().strict(),
    limitatore,
    porte: z.object({ piano: porta, cabina: porta }).partial().strict(),
    contrappeso: z.object({ intervento: z.enum(CONTRAPPESO_INTERVENTI) }).partial().strict(),
  };
}

export const componentiSchemaDi = (bozza: boolean) => z.object(componentiShape(bozza)).partial().strict();
export type RtComponenti = z.infer<ReturnType<typeof componentiSchemaDi>>;

type Blocco = Readonly<Record<string, unknown>> | undefined;
const senzaFonte = (b: Blocco, campi: readonly string[]): boolean => !!b && b.fonte === undefined && campi.some((c) => b[c] !== undefined);

/** The blocks whose data are entered without their source, with their section and path («componenti.quadro.fonte»):
 *  the issue refuses them. */
export function fontiMancanti(c: RtComponenti | undefined): { sezione: SezioneKey; campo: string }[] {
  if (!c) return [];
  const blocchi: [SezioneKey, string, Blocco, readonly string[]][] = [
    ['quadro', 'quadro', c.quadro, CAMPI_CON_FONTE.quadro], ['cabina', 'cabina', c.cabina, CAMPI_CON_FONTE.cabina],
    ['guideCabina', 'guideCabina', c.guideCabina, CAMPI_CON_FONTE.guide], ['guideContrappeso', 'guideContrappeso', c.guideContrappeso, CAMPI_CON_FONTE.guide],
    ['ammortizzatori', 'ammortizzatori.cabina', c.ammortizzatori?.cabina, CAMPI_CON_FONTE.ammortizzatore],
    ['ammortizzatori', 'ammortizzatori.contrappeso', c.ammortizzatori?.contrappeso, CAMPI_CON_FONTE.ammortizzatore],
    ['porte', 'porte.piano', c.porte?.piano, CAMPI_CON_FONTE.porta], ['porte', 'porte.cabina', c.porte?.cabina, CAMPI_CON_FONTE.porta],
  ];
  return blocchi.filter(([, , b, campi]) => senzaFonte(b, campi)).map(([sezione, k]) => ({ sezione, campo: `componenti.${k}.fonte` }));
}
