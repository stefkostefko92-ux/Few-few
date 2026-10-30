'use client';

// Step 2 of the RT after the owner's model, «Dati tecnici»: the first page's table — after the modification (the
// calculation's values, read only) and before (what the documents say: the calculation's test and the registry) — and
// the few answers nothing else holds: the roping and the machine room before, the drive, persons, stops and area after.
import { fmt } from '@/lib/rt2/campi';
import type { ContestoRt2, DatiTecnici, ValoreRt2 } from '@/lib/rt2/types';
import type { CampoRt2 as Spec } from '@/lib/rt2/types';
import CampoRt2 from './CampoRt2';

const SOSP: Readonly<Record<number, string>> = { 1: 'Diretto', 2: 'Indiretto 1:2', 4: 'Indiretto 1:4' };
const AZ = { '1v': '1 velocità', '2v': '2 velocità', vvvf: 'VVVF' } as const;
const AZ_OPZ = [{ v: '1v', t: '1 velocità' }, { v: '2v', t: '2 velocità' }, { v: 'vvvf', t: 'VVVF' }];

type Riga = [string, (d: DatiTecnici) => string | null];
const RIGHE: readonly Riga[] = [
  ['Sospensione', (d) => (d.r ? SOSP[d.r] ?? null : null)], ['Locale macchinario', (d) => (d.locale ? (d.locale === 'alto' ? 'Alto' : 'Basso') : null)],
  ['Portata', (d) => (d.Q === null ? null : `${fmt(d.Q, 0)} kg`)], ['Capienza', (d) => (d.capienza === null ? null : `${fmt(d.capienza, 0)} persone`)],
  ['Fermate', (d) => (d.fermate === null ? null : fmt(d.fermate, 0))], ['Velocità nominale', (d) => (d.v === null ? null : `${fmt(d.v, 2)} m/s`)],
  ['Corsa', (d) => (d.H === null ? null : `${fmt(d.H, 2)} m`)], ['Superficie della cabina', (d) => (d.superficie === null ? null : `${fmt(d.superficie, 2)} m²`)],
  ['Massa totale cabina', (d) => (d.P === null ? null : `${fmt(d.P, 0)} kg`)], ['Massa totale contrappeso', (d) => (d.Mcw === null ? null : `${fmt(d.Mcw, 0)} kg`)],
  ['Azionamento', (d) => (d.azionamento ? AZ[d.azionamento] : null)],
];

export interface TecniciValori {
  prima: { r?: 1 | 2 | 4; locale?: 'alto' | 'basso'; azionamento?: '1v' | '2v' | 'vvvf' };
  dopo: { azionamento?: '1v' | '2v' | 'vvvf'; capienza?: number; fermate?: number; superficie?: number };
}

export default function CardTecnici({ n, ctx, x, set, readOnly, chiediAzPrima, calcHref, mancanti, dalRilievo = null }: {
  n: number; ctx: ContestoRt2; x: TecniciValori; set: (path: string, v: ValoreRt2 | undefined) => void; readOnly: boolean; chiediAzPrima: boolean; calcHref: string;
  /** the technical data still to give («tecnici.<path>»): marked, and shown in «Semplice» too */
  mancanti: ReadonlySet<string>;
  /** the day of the survey that filled empty «prima» values (round 57); null: none */
  dalRilievo?: string | null;
}) {
  const campi: [string, Exclude<Spec, { t: 'gruppo' }>, ValoreRt2 | undefined, ValoreRt2 | undefined][] = [
    ['prima.r', { id: 'r', t: 'scelta', label: '9. Sospensione prima della modifica:', opzioni: [{ v: '1', t: 'Diretto' }, { v: '2', t: 'Indiretto 1:2' }, { v: '4', t: 'Indiretto 1:4' }] },
      x.prima.r !== undefined ? String(x.prima.r) : undefined, ctx.dopo.r ? String(ctx.dopo.r) : undefined],
    ['prima.locale', { id: 'locale', t: 'scelta', label: '11. Locale macchinario prima della modifica:', opzioni: [{ v: 'alto', t: 'Alto' }, { v: 'basso', t: 'Basso' }] },
      x.prima.locale, ctx.dopo.locale ?? undefined],
    ...(chiediAzPrima ? [['prima.azionamento', { id: 'azp', t: 'scelta', label: 'Azionamento prima della modifica:', opzioni: AZ_OPZ }, x.prima.azionamento, undefined] as
      [string, Exclude<Spec, { t: 'gruppo' }>, ValoreRt2 | undefined, ValoreRt2 | undefined]] : []),
    ['dopo.azionamento', { id: 'azd', t: 'scelta', label: 'Azionamento:', opzioni: AZ_OPZ }, x.dopo.azionamento, ctx.dopo.azionamento ?? undefined],
    ['dopo.capienza', { id: 'cap', t: 'num', label: '14. Capienza:', unit: 'pass.', min: 1, max: 100, step: 1, int: true, esperto: true }, x.dopo.capienza, ctx.prima.capienza ?? undefined],
    ['dopo.fermate', { id: 'ferm', t: 'num', label: '16. Fermate:', min: 2, max: 60, step: 1, int: true, esperto: true }, x.dopo.fermate, ctx.prima.fermate ?? undefined],
    ['dopo.superficie', { id: 'sup', t: 'num', label: '22. Superficie della cabina:', unit: 'm2', min: 0.1, max: 20, step: 0.01, esperto: true }, x.dopo.superficie,
      ctx.prima.superficie ?? undefined],
  ];
  const toVal = (path: string, v: ValoreRt2 | undefined): ValoreRt2 | undefined => (path === 'prima.r' && typeof v === 'string' ? Number(v) : v);
  return (
    <section className="panel rt-card" id="rt2-tecnici" aria-labelledby="rt2-tecnici-h">
      <h2 id="rt2-tecnici-h" className="rt-card-title"><span className="rt-step" aria-hidden="true">{n}</span>Dati tecnici</h2>
      <p className="note">«Dopo» viene dal Calcolo argano, «prima» dai documenti dell’impianto inseriti nel calcolo (libretto, verbale): <a href={calcHref}>cambiali lì</a>. Un valore «prima» vuoto vale come «dopo».{dalRilievo ? ` I valori «prima» che mancavano vengono dal rilievo del ${dalRilievo}: controllali.` : ''}</p>
      <div className="table-scroll">
        <table className="table rt2-tecnici">
          <caption className="sr-only">Dati tecnici dopo e prima della modifica</caption>
          <thead><tr><th scope="col">Dato</th><th scope="col">Dopo la modifica</th><th scope="col">Prima della modifica</th></tr></thead>
          <tbody>
            {RIGHE.map(([l, f]) => <tr key={l}><th scope="row">{l}</th><td className="num">{f(ctx.dopo) ?? '—'}</td><td className="num">{f(ctx.prima) ?? 'come dopo'}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="rt2-campi">
        {campi.map(([path, spec, value, prop]) => (
          <CampoRt2 key={path} spec={spec} chiave={`tecnici.${path}`} value={value} proposta={prop} set={(v) => set(`tecnici.${path}`, toVal(path, v))}
            need={mancanti.has(`tecnici.${path}`)} bad={false} readOnly={readOnly} />
        ))}
      </div>
    </section>
  );
}
