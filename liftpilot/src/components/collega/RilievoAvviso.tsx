import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { confronto, type Param, type Valore } from '@/lib/collega/confronto';
import { testoValore } from '@/lib/collega/formato';
import { layoutDi } from '@/lib/collega/prefill';
import type { RilievoDati } from '@/lib/collega/rilievo';
import { fmt } from '@/lib/rilievi/fmt';
import type { UsaFatto } from '@/server/collega/forms';

/** The survey's own value of a parameter (the comparison's «rilievo» column). */
function valoreDi(r: RilievoDati, p: Param): Valore {
  const row = confronto({ rilievo: r, storico: [], impianto: { kind: 'FULL', indirizzo: null, plantNumber: null }, calcolo: null, progetto: null }).find((w) => w.param === p);
  return row?.rilievo ?? null;
}

// Over an installation's form (round 44): when the form starts from the survey (`parte`: some value came from it), the
// survey — its title, its day and the way to its sheet (only whoever sees the surveys gets here,
// src/server/collega/forms.ts) — and that the values marked «dal rilievo» are measured ones; after «usa il valore del
// rilievo» what was put in (and what the field held, when it was something else), not saved until the user saves. A
// saved calculation or design continued says nothing of the survey. The machine's place is written as the form now
// holds it (in alto, con rinvio / tiro diretto / in basso), and the warning that the survey says only «in alto» only when
// its argano sheet does not say whether there is a diverting pulley.
export default async function RilievoAvviso({ rilievo, usa, parte }: { rilievo: RilievoDati; usa: UsaFatto | null; parte: boolean }) {
  if (!parte && !usa) return null;
  const t = await getTranslations('collega');
  const title = rilievo.numeroImpianto ? t('titoloNumero', { n: rilievo.numeroImpianto }) : rilievo.matricola ? t('titoloMatricola', { n: rilievo.matricola })
    : rilievo.indirizzo ?? t('titolo');
  const parola = (code: string): string => (t.has(`valore.${code}`) ? t(`valore.${code}` as 'valore.ALTO') : code);
  const label = usa ? t(`confronto.param.${usa.param}`) : '';
  const valore = (u: UsaFatto): string => (u.param === 'posizione' && u.messo ? parola(u.messo) : testoValore(u.param, valoreDi(rilievo, u.param), parola));
  const soloAlto = usa?.param === 'posizione' && rilievo.posizione === 'ALTO' && layoutDi(rilievo) === null;
  const sheet = <Link href={`/app/rilievi/${rilievo.id}`}>{t('origine.openSheet')}</Link>;
  return (
    <div className="lk-avviso" role="status">
      {parte ? <p>{t('origine.notice', { title, date: fmt.day(rilievo.data) })} {sheet}</p> : null}
      {usa ? (
        <p className={usa.set.length ? 'alert alert-info' : 'alert alert-warn'}>
          {usa.set.length
            ? t(usa.prima ? 'origine.usaDonePrima' : 'origine.usaDone', { param: label, valore: valore(usa), prima: usa.prima ? parola(usa.prima).replace('.', ',') : '' })
            : t('origine.usaNone', { param: label })}
          {soloAlto ? ` ${t('origine.usaAlto')}` : ''}
          {parte ? null : <> {sheet}</>}
        </p>
      ) : null}
    </div>
  );
}
