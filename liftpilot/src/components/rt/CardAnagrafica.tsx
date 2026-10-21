import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { Collaudo } from '@/lib/lift/collaudo';
import { makeFmt } from '@/lib/present/tr';
import type { Plant } from '@/lib/plant';
import type { Anagrafica } from '@/lib/rt/anagrafica';
import AnagraficaForm from './AnagraficaForm';

// Card 1 of the workspace, «Dati dell'impianto» (RT plan §2.3, §7): the registry the RT asks (AnagraficaForm), and what
// the RT prints from where it lives — the installation's data (the lift's use, the safety gear, the bracket pitches, the
// control) and the calculation's test (the CE marking, the documented loads, the logbook's speed and travel) — read only,
// with the way to change them where they are. One value, one place. A server component.
export default async function CardAnagrafica({ projectId, anagrafica, client, plant, collaudo, calcId, readOnly, hints }: {
  projectId: string; anagrafica: Anagrafica; client: string | null; plant: Plant; collaudo: Collaudo | null; calcId: string | null; readOnly: boolean;
  hints: { persone: number | null; fermate: number | null; matricola: string | null } | null;
}) {
  const t = await getTranslations('rt'), fmt = makeFmt('it'), C = collaudo;
  const norma = C && C.norma !== 'en81' ? C.norma : null, d = C?.documentato, l = C?.libretto;
  const n = (v: number | undefined, dec: number, u: string): string => (v === undefined ? '—' : `${fmt(v, dec)} ${u}`);
  const vals = (k: 'liftUse' | 'safetyGear'): string => (plant[k] ? t(`impianto.${k}.${plant[k]}`) : '—');
  return (
    <section className="panel rt-card" id="rt-anagrafica" aria-labelledby="rt-anagrafica-h">
      <h2 id="rt-anagrafica-h" className="rt-card-title"><span className="rt-step" aria-hidden="true">1</span>{t('card.anagrafica')}</h2>
      <p className="note">{t('anagrafica.lead')}</p>
      <AnagraficaForm projectId={projectId} initial={anagrafica} client={client} norma={norma} readOnly={readOnly} hints={hints} />
      <h3>{t('anagrafica.altrove')}</h3>
      <dl className="cartiglio rt-dati">
        <div><dt>{t('impianto.uso')}</dt><dd>{vals('liftUse')}</dd></div>
        <div><dt>{t('impianto.paracadute')}</dt><dd>{vals('safetyGear')}</dd></div>
        <div><dt>{t('impianto.passo')}</dt><dd className="num">{n(plant.carBracketPitch, 0, 'mm')} · {n(plant.cwBracketPitch, 0, 'mm')}</dd></div>
        <div><dt>{t('impianto.manovra')}</dt><dd>{plant.control ?? '—'}</dd></div>
        <div><dt>{t('impianto.marcatura')}</dt><dd>{C?.marcatura ? t(`impianto.ce.${C.marcatura}`) : '—'}</dd></div>
        <div><dt>{t('impianto.documentati')}</dt><dd className="num">{d ? `Q ${n(d.Q, 0, 'kg')} · P ${n(d.P, 0, 'kg')} · Mcw ${n(d.Mcw, 0, 'kg')}` : '—'}</dd></div>
        <div><dt>{t('impianto.libretto')}</dt><dd className="num">{l ? `v ${n(l.v, 2, 'm/s')} · H ${n(l.H, 2, 'm')}` : '—'}</dd></div>
      </dl>
      <div className="doc-links">
        <Link className="btn btn-sm" href={`/app/projects/${projectId}/impianto`}>{t('anagrafica.modificaImpianto')}</Link>
        {calcId ? <Link className="btn btn-sm" href={`/app/calculations/${calcId}`}>{t('anagrafica.modificaCalcolo')}</Link> : null}
      </div>
    </section>
  );
}
