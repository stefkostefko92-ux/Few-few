import { getTranslations } from 'next-intl/server';
import { dateFormat } from '@/lib/dates';
import { BETA_INVITE_DAYS, listBetaInvites } from '@/lib/beta-invites';
import { registrationMode } from '@/lib/env';
import { revokeBetaInviteAction } from '@/server/beta-invite-actions';
import BetaInviteForm, { BetaInviteResend } from './BetaInviteForm';

const PILL = { waiting: 'warn', used: 'ok', expired: 'fail' } as const;

// «Inviti alla beta» on the platform administrator's page (/app/admin, behind its platform:admin gate): the form, then
// every invitation with its state — waiting, used by a company, past its end — and, while not used, «Invia di nuovo» and
// «Revoca». The note is the administrator's own and never reaches the tester.
export default async function BetaInvites({ locale }: { locale: string }) {
  const [t, rows] = await Promise.all([getTranslations('admin'), listBetaInvites()]);
  const fd = dateFormat(locale);
  return (
    <section className="panel beta-invites" aria-labelledby="beta-title">
      <h2 id="beta-title">{t('betaTitle')}</h2>
      <p className="note long">{registrationMode() === 'invite' ? t('betaModeInvite', { days: BETA_INVITE_DAYS }) : t('betaModeOpen')}</p>
      <BetaInviteForm />
      {rows.length ? (
        <div className="table-panel">
          <table className="data-table stack">
            <thead><tr><th>{t('betaEmail')}</th><th>{t('betaState')}</th><th>{t('betaDates')}</th><th>{t('betaActions')}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="row-title"><b>{r.email}</b>{r.note ? <div className="note">{r.note}</div> : null}</td>
                  <td data-label={t('betaState')}>
                    <span className={`status-pill ${PILL[r.state]}`}>
                      {r.state === 'used' ? (r.company ? t('betaUsedBy', { company: r.company }) : t('betaUsed')) : r.state === 'expired' ? t('betaExpired') : t('betaWaiting')}
                    </span>
                  </td>
                  <td data-label={t('betaDates')}>
                    <div className="cell-stack">
                      <span className="note">{t('betaSent', { date: fd.date(r.createdAt) })}</span>
                      <span className="note">{r.usedAt ? t('betaUsedOn', { date: fd.date(r.usedAt) }) : t('betaUntil', { date: fd.date(r.expiresAt) })}</span>
                    </div>
                  </td>
                  <td data-label={t('betaActions')}>
                    {r.state === 'used' ? <span className="note">—</span> : (
                      <div className="flex flex-wrap items-start gap-2">
                        <BetaInviteResend id={r.id} email={r.email} />
                        <form action={revokeBetaInviteAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="btn btn-sm btn-danger" aria-label={`${t('betaRevoke')} · ${r.email}`}>{t('betaRevoke')}</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="note">{t('betaNone')}</p>}
    </section>
  );
}
