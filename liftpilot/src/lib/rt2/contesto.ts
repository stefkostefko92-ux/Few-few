// The context every component of the RT reads (types.ts ContestoRt2): the first page's data before and after the
// modification, each from where LiftPilot holds it — after: the base calculation (Q, P, the counterweight, v, H, the
// roping, the machine room from the machine's position) and the RT's own answers (drive, persons, stops, area, when the
// modification changes them); before: the acceptance test (the documented loads, the logbook's speed and travel, the
// existing controller's regulation), the registry's documented data (persons, stops, area) and the RT's answers for what
// nothing else holds (the roping and the machine room before). A «before» left empty is the same as after (the model's
// rule, corrected: E-DG-1). Pure.
import type { FormValues, Results } from '@/calc/types';
import type { Collaudo } from '../lift/collaudo';
import { carichiOf, corsaOf, variazioneCarico, variazioneVelocita, velocitaOf, type Regolazione } from '../lift/modifica';
import type { Anagrafica } from '../rt/anagrafica';
import { regimeOf } from '../rt/regimi';
import type { AscensorePer, Azionamento, ContestoRt2, DatiTecnici, Locale, Taglia } from './types';

/** What the RT's first page asks that nothing else holds (input.ts `tecnici`). */
export interface TecniciRt2 {
  prima?: { r?: Taglia; locale?: Locale; azionamento?: Azionamento };
  dopo?: { azionamento?: Azionamento; capienza?: number; fermate?: number; superficie?: number };
}

/** The base of an RT: the calculation's values, its acceptance test (collaudoOf), its results when they derive, the
 *  installation's registry and the plant's «Ascensore per». */
export interface BaseRt2 {
  V: FormValues;
  C: Collaudo;
  res: Results | null;
  anagrafica: Anagrafica;
  liftUse?: 'passengers' | 'goods' | 'goodsHeavy';
}

const AZ_DI: Readonly<Record<Regolazione, Azionamento>> = { vvvf: 'vvvf', '2v': '2v', '1v': '1v' };
const PER_DI = { passengers: 'persone', goods: 'merci', goodsHeavy: 'merci_carrelli' } as const;

/** The calculation's roping: 1:1 or 2:1 (the calculation has no 4:1). */
export const tagliaDi = (V: FormValues): Taglia => (String(V.r ?? '').trim() === '2' ? 2 : 1);
/** The machine room after: below with the machine at the bottom of the shaft, above otherwise. */
export const localeDi = (V: FormValues): Locale => (V.layout === 'bottom' ? 'basso' : 'alto');

export function contestoRt2(b: BaseRt2, t: TecniciRt2 = {}): ContestoRt2 {
  const car = carichiOf(b.V), doc = b.C.documentato, lib = b.C.libretto, pr = b.anagrafica.prima;
  const norma = b.C.norma === '10411-11' ? '10411-11' : '10411-1';
  const prima: DatiTecnici = {
    Q: doc?.Q ?? null, P: doc?.P ?? null, Mcw: doc?.Mcw ?? null, v: lib?.v ?? null, H: lib?.H ?? null,
    r: t.prima?.r ?? null, locale: t.prima?.locale ?? null,
    azionamento: b.C.regolazione ? AZ_DI[b.C.regolazione] : t.prima?.azionamento ?? null,
    capienza: pr?.persone ?? null, fermate: pr?.fermate ?? null, superficie: pr?.superficie ?? null,
  };
  // the drive after: as answered; else a new controller regulates the speed (11.2.1: the refusal 'inverter' keeps a new
  // machine off a controller without regulation), an existing one keeps its own
  const azDopo = t.dopo?.azionamento ?? (b.C.parti.includes('controller') ? 'vvvf' : prima.azionamento);
  const dopo: DatiTecnici = {
    Q: car?.Q ?? null, P: car?.P ?? null, Mcw: car?.Mcw ?? null, v: velocitaOf(b.V), H: corsaOf(b.V),
    r: tagliaDi(b.V), locale: localeDi(b.V), azionamento: azDopo,
    capienza: t.dopo?.capienza ?? prima.capienza, fermate: t.dopo?.fermate ?? prima.fermate, superficie: t.dopo?.superficie ?? prima.superficie,
  };
  const ascensorePer: AscensorePer = b.liftUse ? PER_DI[b.liftUse] : 'persone';
  const carico = doc && car ? variazioneCarico(norma, doc, car) : null, velocita = dopo.v !== null ? variazioneVelocita(norma, lib, dopo.v) : null;
  return {
    norma, dopo, prima, regime: regimeOf(b.anagrafica, norma).legge, ascensorePer, parti: b.C.parti, libretto: lib ?? null, carico, velocita,
    funiSostituite: b.C.parti.includes('ropes'), calc: { V: b.V, res: b.res },
  };
}

/** A «before» value: the documented one, else the value after (not documented: unchanged). */
export const primaO = <K extends keyof DatiTecnici>(ctx: ContestoRt2, k: K): DatiTecnici[K] => ctx.prima[k] ?? ctx.dopo[k];
