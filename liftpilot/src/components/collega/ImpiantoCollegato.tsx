import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { SessionUser } from '@/lib/auth';
import { RIGHT_OF_STEP, can } from '@/lib/rbac';
import { fmt } from '@/lib/rilievi/fmt';
import type { Collegamento, ImpiantoInfo } from '@/server/collega/impianto';
import { flashOk, isFlash } from '@/lib/collega/flash';
import { scollegaRilievoAction } from '@/server/collega/actions';
import Icon from '@/components/Icon';
import Confronto from './Confronto';

// An installation's surveys (round 44): the surveys linked to it newest first (the first the reference: the forms start
// from it and the comparison reads it) with the way to each sheet, its PDF and its supplier modules, and the comparison —
// only for whoever sees the surveys. «usa il valore» opens the calculation for what it holds and the Progetto for the
// stops, for whoever holds that step's right (round 45, rbac.ts RIGHT_OF_STEP). Where the installation stands is its bar
// (round 53, components/impianto/ImpiantoNav.tsx). The records are read once by the page (collegamentoImpianto).
export default async function ImpiantoCollegato({ user, p, c, archived, flash }: { user: SessionUser; p: ImpiantoInfo; c: Collegamento; archived: boolean; flash: unknown }) {
  const [t, locale] = await Promise.all([getTranslations('collega'), getLocale()]);
  const sees = can(user, 'rilievi:view'), unlink = can(user, 'rilievi:link') && !archived;
  const ref = c.rilievi[0] ?? null, calcola = can(user, RIGHT_OF_STEP.calcolo) && !archived, disegna = can(user, RIGHT_OF_STEP.progetto) && !archived;
  const calcHref = `/app/projects/${p.id}/calc`, progettoHref = `/app/projects/${p.id}/progetto`;
  const msg = isFlash(flash) ? flash : null;
  return (
    <>
      {sees ? (
        <section className="panel lk-rilievi" id="rilievi" aria-labelledby="lk-rilievi-title">
          <div className="panel-head">
            <div className="dash-panel-titles">
              <h2 id="lk-rilievi-title">{t('rilievi.title')}</h2>
              <p className="note">{c.rilievi.length ? t('rilievi.lead') : t('rilievi.noneLead')}</p>
            </div>
            <Link className="btn btn-sm" href="/app/rilievi">{t('rilievi.toList')}</Link>
          </div>
          {msg ? <p className={`alert ${flashOk(msg) ? 'alert-ok' : 'alert-warn'}`} role="status">{t(`flash.${msg}`)}</p> : null}
          {c.rilievi.length ? (
            <ul className="lk-rilievi-list">
              {c.rilievi.map((r, i) => (
                <li key={r.dati.id} className={i === 0 ? 'lk-ref' : undefined}>
                  <span className="mono num lk-day">{fmt.day(r.dati.data)}</span>
                  <span className="lk-rilievo-main">
                    <Link href={`/app/rilievi/${r.dati.id}`}>{r.dati.numeroImpianto ? t('titoloNumero', { n: r.dati.numeroImpianto })
                      : r.dati.matricola ? t('titoloMatricola', { n: r.dati.matricola }) : r.dati.indirizzo ?? t('titolo')}</Link>
                    {i === 0 ? <span className="badge rilievo">{t('rilievi.reference')}</span> : null}
                    <span className="note">{[r.dati.indirizzo, r.autore ? t('rilievi.autore', { name: r.autore }) : null].filter(Boolean).join(' — ')}</span>
                  </span>
                  <span className="lk-docs">
                    <a className="btn btn-sm btn-ghost" href={`/api/rilievi/${r.dati.id}/pdf`}><Icon name="download" size={14} />{t('rilievi.pdf')}</a>
                    {r.moduli.map((m) => <a key={m.path} className="btn btn-sm btn-ghost" href={`/api/rilievi/${r.dati.id}/${m.path}`}><Icon name="file-text" size={14} />{m.nome}</a>)}
                    {unlink ? (
                      <form action={scollegaRilievoAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="scheda" value={r.dati.id} />
                        <input type="hidden" name="impianto" value={p.id} />
                        <input type="hidden" name="da" value="impianto" />
                        <button type="submit" className="btn btn-sm btn-ghost"><Icon name="x" size={14} />{t('panel.unlink')}</button>
                      </form>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="note">{t('rilievi.none')}</p>}
        </section>
      ) : null}
      {sees && ref ? (
        <Confronto righe={c.righe} date={ref.dati.data} salvati={!!(c.calcolo || c.progetto?.kind === 'lift')} collaudo={calcola ? `${calcHref}#collaudo` : null}
          usa={{ calc: calcola ? calcHref : null, progetto: disegna ? progettoHref : null,
            impianto: can(user, 'projects:edit') && !archived ? `/app/projects/${p.id}/edit` : null }} />
      ) : null}
    </>
  );
}
