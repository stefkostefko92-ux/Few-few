import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { SessionUser } from '@/lib/auth';
import { can, formRightOf } from '@/lib/rbac';
import { fmt } from '@/lib/rilievi/fmt';
import { collegamentoImpianto, type ImpiantoInfo } from '@/server/collega/impianto';
import { flashOk, isFlash } from '@/lib/collega/flash';
import { scollegaRilievoAction } from '@/server/collega/actions';
import Icon from '@/components/Icon';
import Confronto from './Confronto';
import Passi, { type Passo } from './Passi';

// An installation's surveys and where it stands (round 44): the four steps from the survey to the documents, the
// surveys linked to it newest first (the first the reference: the forms start from it and the comparison reads it) with
// the way to each sheet, its PDF and its supplier modules, and the comparison. The surveys, the comparison and the first
// step's link only for whoever sees the surveys; the links to a form only for whoever fills it (the module's right, as
// the page's buttons): a replacement's «Progetto» is its machine room, made from the latest calculation by whoever draws;
// «Documenti e ordini» opens the issued set, else the record whose documents they are.
export default async function ImpiantoCollegato({ user, p, archived, flash }: { user: SessionUser; p: ImpiantoInfo; archived: boolean; flash: unknown }) {
  const [t, locale, c] = await Promise.all([getTranslations('collega'), getLocale(), collegamentoImpianto(user, p)]);
  const sees = can(user, 'rilievi:view'), unlink = can(user, 'rilievi:link') && !archived, replacement = p.kind === 'REPLACEMENT';
  const ref = c.rilievi[0] ?? null, form = can(user, formRightOf(p.kind)) && !archived;
  const formHref = replacement ? `/app/projects/${p.id}/calc` : `/app/projects/${p.id}/progetto`;
  const record = c.progetto?.kind === 'lift' ? `/app/lift-designs/${c.progetto.id}` : c.calcolo ? `/app/calculations/${c.calcolo.id}` : null;
  const room = replacement && c.calcolo && can(user, 'progetto:edit') && !archived ? `/app/calculations/${c.calcolo.id}/locale` : null;
  const passi: Passo[] = [
    { key: 'rilievo', href: sees ? (ref ? `/app/rilievi/${ref.dati.id}` : '#rilievi') : null },
    { key: 'calcolo', href: c.calcolo ? `/app/calculations/${c.calcolo.id}` : form ? formHref : null },
    { key: 'progetto', sub: replacement ? t('passi.room') : undefined,
      href: c.progetto ? `/app/${c.progetto.kind === 'lift' ? 'lift-designs' : 'room-designs'}/${c.progetto.id}` : replacement ? room : form ? formHref : null },
    { key: 'documenti', href: c.tavole ? `/app/drawing-sets/${c.tavole.id}` : record },
  ];
  const msg = isFlash(flash) ? flash : null;
  return (
    <>
      <Passi stati={c.passi} passi={passi} moduli={sees && ref ? ref.moduli : []} schedaId={ref?.dati.id ?? null} />
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
        <Confronto righe={c.righe} date={ref.dati.data} salvati={!!(c.calcolo || c.progetto?.kind === 'lift')} collaudo={form ? `${formHref}#collaudo` : null}
          usa={{ calc: form && replacement ? formHref : null, progetto: form && !replacement ? formHref : null,
            impianto: can(user, 'projects:edit') && !archived ? `/app/projects/${p.id}/edit` : null }} />
      ) : null}
    </>
  );
}
