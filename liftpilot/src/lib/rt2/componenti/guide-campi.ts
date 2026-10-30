// The fields the car's and the counterweight's rail components share (round 52): the rail typed by hand (the model's
// panel «Inserire i seguenti dati della guida:», one field per value in mm — the model's cm rows are the same value), the
// headroom and the pit of «Dati Generali» (DG!K74, K75: the rail column; not yet in the context), the steel's elongation
// A5 (UNI EN 81-20:2020, 5.7.4.5 prospetto 15: the model has none) and the brackets' push Fp over 40 m of travel (5.7.2.3.5:
// the model's constant 0). Pure.
import { str } from '../campi';
import type { CampoRt2, DatiRt2 } from '../types';
import { conFp } from './guide-cabina-calc';

const altraScelta = (n: number) => (x: DatiRt2): boolean => str(x, 'profilo') === String(n);

/** The rail typed by hand, shown when the profile chosen is the component's «altra» (index `n`). */
export function campiAltra(n: number): CampoRt2[] {
  const show = altraScelta(n);
  return [
    { id: 'g_altra', t: 'gruppo', label: 'Inserire i seguenti dati della guida:', show },
    { id: 'dimensioni', t: 'testo', label: 'Dimensioni:', max: 40, req: true, show },
    { id: 'lavorazione', t: 'testo', label: 'Lavorazione:', max: 40, show },
    { id: 'lsc', t: 'num', label: 'Sup.Scorrimento :', unit: 'mm', min: 0, max: 200, step: 0.1, show },
    { id: 'Jx', t: 'num', label: 'Jx:', unit: 'mm4', min: 1000, max: 1e8, step: 1, req: true, show },
    { id: 'Jy', t: 'num', label: 'Jy:', unit: 'mm4', min: 1000, max: 1e8, step: 1, req: true, show },
    { id: 'Wx', t: 'num', label: 'Wx:', unit: 'mm3', min: 100, max: 1e6, step: 1, req: true, show },
    { id: 'Wy', t: 'num', label: 'Wy:', unit: 'mm3', min: 100, max: 1e6, step: 1, req: true, show },
    { id: 'A', t: 'num', label: 'Area', unit: 'mm2', min: 50, max: 20000, step: 1, req: true, show },
    { id: 'Rm', t: 'num', label: 'σr:', unit: 'N/mm2', min: 200, max: 1000, step: 1, req: true, show },
    { id: 'c', t: 'num', label: 'C:', unit: 'mm', min: 1, max: 50, step: 0.1, req: true, show },
  ];
}

/** «TESTATA» and «FOSSA» of «Dati Generali» (the rail column's length). */
export const CAMPI_VANO: readonly CampoRt2[] = [
  { id: 'g_vano', t: 'gruppo', label: 'Dati Generali' },
  { id: 'testata', t: 'num', label: 'TESTATA', unit: 'mm', min: 500, max: 15000, step: 1, req: true },
  { id: 'fossa', t: 'num', label: 'FOSSA', unit: 'mm', min: 100, max: 10000, step: 1, req: true },
];

/** The steel's elongation (proposed over 12 %) and the brackets' push (asked over 40 m of travel). */
export const CAMPI_NORMA: readonly CampoRt2[] = [
  { id: 'g_norma', t: 'gruppo', label: 'Dati per la verifica secondo la norma' },
  {
    id: 'allungamento', t: 'scelta', label: 'Allungamento A5 dell’acciaio delle guide:', esperto: true,
    opzioni: [{ v: 'oltre12', t: 'oltre 12 %' }, { v: 'da8a12', t: 'da 8 a 12 %' }, { v: 'sotto8', t: 'sotto 8 %' }],
  },
  {
    id: 'fp', t: 'num', label: 'Fp (spinta delle staffe sulla guida):', unit: 'N', min: 0, max: 100000, step: 1,
    show: (_x, ctx) => conFp(ctx), req: (_x, ctx) => conFp(ctx),
  },
];

export const NUMERO_GUIDE = { min: 2, max: 4, step: 1, int: true } as const;
