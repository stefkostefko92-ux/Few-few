import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { SessionUser } from '@/lib/auth';
import { can, holds } from '@/lib/rbac';
import type { Suggerimento } from '@/lib/collega/suggerimenti';
import { indirizzoImpianto } from '@/lib/collega/testo';
import { collegaRilievoAction, scollegaRilievoAction, type Flash } from '@/server/collega/actions';
import { cercaImpianti, impiantoDi, suggerimentiPer } from '@/server/collega/queries';
import Icon from '@/components/Icon';

const FLASH: readonly Flash[] = ['linked', 'unlinked', 'forbidden', 'readOnly', 'tooMany', 'notFound', 'projectNotFound'];
const isFlash = (x: unknown): x is Flash => typeof x === 'string' && (FLASH as readonly string[]).includes(x);

interface Scheda {
  id: string;
  projectId: string | null;
  matricola: string | null;
  numeroImpianto: string | null;
  indirizzo: string | null;
  deletedAt: Date | null;
}

/** One installation offered for the link: its name, module, address and number, why it is suggested, «Collega». */
function Offerta({ s, schedaId, locale, link, t }: { s: Suggerimento; schedaId: string; locale: string; link: boolean; t: Awaited<ReturnType<typeof getTranslations<'collega'>>> }) {
  return (
    <li className="lk-offer">
      <div className="lk-offer-main">
        <Link href={`/app/projects/${s.id}`} className="lk-offer-name">{s.name}</Link>
        <span className="note">{[t(`kind.${s.kind}`), s.indirizzo, s.plantNumber ? t('matricola', { n: s.plantNumber }) : null].filter(Boolean).join(' — ')}</span>
        {s.motivi.length ? <span className="lk-reasons">{s.motivi.map((m) => <span key={m} className="pill">{t(`motivo.${m}`)}</span>)}</span> : null}
      </div>
      {link ? (
        <form action={collegaRilievoAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="scheda" value={schedaId} />
          <input type="hidden" name="impianto" value={s.id} />
          <input type="hidden" name="da" value="rilievo" />
          <button type="submit" className="btn btn-sm"><Icon name="link" size={16} />{t('collega')}</button>
        </form>
      ) : null}
    </li>
  );
}

// The survey's link to its installation (round 44), on the survey's page and apart from the sheet: never in the sheet's
// content, print or PDF. Linked: the installation (named for whoever sees the installations), its comparison and
// «Scollega». Not linked: «Crea impianto» (the new installation's form, which asks the module and starts from the
// survey), the installations suggested — the same matricola, number or address, with why — and a search of another one.
// Who may not link sees the state only; a read-only company is told why nothing changes.
export default async function LinkPanel({ user, scheda, cerca, flash }: { user: SessionUser; scheda: Scheda; cerca: string; flash: unknown }) {
  const [t, locale] = await Promise.all([getTranslations('collega'), getLocale()]);
  const sees = can(user, 'projects:view'), link = can(user, 'rilievi:link') && !scheda.deletedAt, create = link && can(user, 'impianti:create');
  const imp = sees ? await impiantoDi(user, scheda.projectId) : null;
  const [offerte, trovati] = link && !scheda.projectId
    ? await Promise.all([suggerimentiPer(user, scheda), cercaImpianti(user, cerca)]) : [[], []];
  const found: Suggerimento[] = trovati.map((p) => ({ id: p.id, name: p.name, kind: p.kind, indirizzo: indirizzoImpianto(p), plantNumber: p.plantNumber, motivi: [] }));
  const msg = isFlash(flash) ? flash : null;
  return (
    <section className="panel lk-panel" id="collegamento" aria-labelledby="lk-title">
      <div className="lk-panel-head">
        <span className="icon-tile sm"><Icon name="link-2" size={18} /></span>
        <h2 id="lk-title">{t('panel.title')}</h2>
      </div>
      {msg ? <p className={`alert ${msg === 'linked' || msg === 'unlinked' ? 'alert-ok' : 'alert-warn'}`} role="status">{t(`flash.${msg}`)}</p> : null}
      {scheda.projectId ? (
        <div className="lk-state">
          {imp ? (
            <p>
              {t('panel.linked')} <Link href={`/app/projects/${imp.id}`} className="lk-impianto-link">{imp.name}</Link>
              <span className="note"> — {[t(`kind.${imp.kind}`), indirizzoImpianto(imp), imp.archivedAt ? t('panel.archived') : null].filter(Boolean).join(' — ')}</span>
            </p>
          ) : <p>{t('panel.linkedHidden')}</p>}
          <div className="lk-actions">
            {imp ? <Link className="btn btn-sm" href={`/app/projects/${imp.id}#confronto`}><Icon name="scale" size={16} />{t('panel.confronto')}</Link> : null}
            {link ? (
              <form action={scollegaRilievoAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="scheda" value={scheda.id} />
                <input type="hidden" name="da" value="rilievo" />
                <button type="submit" className="btn btn-sm btn-ghost"><Icon name="x" size={16} />{t('panel.unlink')}</button>
              </form>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="lk-state">
          <p>{t('panel.none')}</p>
          {link ? <p className="note">{t('panel.noneLead')}</p> : null}
          {create ? (
            <div className="lk-actions">
              <Link className="btn btn-primary btn-sm" href={`/app/projects/new?rilievo=${scheda.id}`}><Icon name="plus" size={16} />{t('panel.create')}</Link>
              <span className="note">{t('panel.createLead')}</span>
            </div>
          ) : null}
        </div>
      )}
      {link && !scheda.projectId ? (
        <div className="lk-offers">
          <h3>{t('panel.suggested')}</h3>
          {offerte.length ? (
            <ul className="lk-offer-list">{offerte.map((s) => <Offerta key={s.id} s={s} schedaId={scheda.id} locale={locale} link={link} t={t} />)}</ul>
          ) : <p className="note">{t('panel.suggestedNone')}</p>}
          <form className="lk-search" method="get" action={`/${locale}/app/rilievi/${scheda.id}#collegamento`} role="search" aria-label={t('panel.searchLabel')}>
            <label className="field">
              <span>{t('panel.searchLabel')}</span>
              <input className="input" type="search" name="impianto" defaultValue={cerca} maxLength={80} placeholder={t('panel.searchPlaceholder')} autoComplete="off" />
            </label>
            <button type="submit" className="btn btn-sm"><Icon name="search" size={16} />{t('panel.search')}</button>
          </form>
          {cerca ? (found.length
            ? <ul className="lk-offer-list" aria-label={t('panel.searchResults', { q: cerca })}>{found.map((s) => <Offerta key={s.id} s={s} schedaId={scheda.id} locale={locale} link={link} t={t} />)}</ul>
            : <p className="note" role="status">{t('panel.searchNone', { q: cerca })}</p>) : null}
        </div>
      ) : null}
      {!link && !scheda.deletedAt && holds(user, 'rilievi:link') ? <p className="note">{t('panel.readOnly')}</p> : null}
    </section>
  );
}
