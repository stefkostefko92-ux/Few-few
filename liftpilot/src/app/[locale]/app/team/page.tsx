import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { MEMBER_ROLES, assignableRoles, can, outranks } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { listInvites, listUsers } from '@/server/queries';
import { companySubscription } from '@/server/billing';
import { deleteUserAction, inviteAgainAction, revokeInviteAction, updateUserAction } from '@/server/user-actions';
import CreateUserForm from '@/components/CreateUserForm';
import ResetPasswordButton from '@/components/ResetPasswordButton';
import AccountHead from '@/components/AccountHead';
import Icon from '@/components/Icon';

export async function generateMetadata() {
  const t = await getTranslations('team');
  return { title: t('title') };
}

// The owner's colleagues: each has one of the three roles and, while active, takes a slot of the subscription; so does
// an invitation while it waits (the colleague chooses the password from the link of the e-mail).
export default async function TeamPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'users:manage');
  const [q, t, tr, users, invites, lang, sub] = await Promise.all([searchParams, getTranslations('team'), getTranslations('roles'), listUsers(me),
    listInvites(me), getLocale(), companySubscription(me.companyId)]);
  const fd = dateFormat(locale);
  const roles = assignableRoles(me.role);
  const free = sub?.free ?? false, limit = sub && Number.isFinite(sub.limit) ? String(sub.limit) : '∞';
  return (
    <main className="page">
      <AccountHead area="company" title={t('title')} lead={t('lead')} />
      {q.e === 'noSeats' ? <p className="alert alert-bad" role="alert">{t('noSeats')}</p> : null}
      <section className="panel">
        <p className="seats-line"><Icon name="user-check" size={20} />{t('seats', { used: sub?.used ?? 0, limit })}{' '}
          {can(me, 'billing:manage') && sub?.access !== 'free' ? <Link href="/app/billing">{t('buySeats')}</Link> : null}</p>
        <dl className="flex flex-col gap-1">
          {MEMBER_ROLES.map((r) => <div key={r}><dt className="inline font-semibold">{tr(r)}: </dt><dd className="inline">{t(`roleNote.${r}`)}</dd></div>)}
        </dl>
      </section>
      <div className="table-panel">
        <table className="data-table stack">
          <thead><tr><th>{t('name')}</th><th>{t('role')}</th><th>{t('status')}</th><th>{t('lastLogin')}</th><th>{t('actions')}</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const manage = u.id !== me.id && outranks(me.role, u.role);
              return (
                <tr key={u.id}>
                  <td className="row-title"><b>{u.name}</b><div className="note">{u.email}</div></td>
                  <td data-label={t('role')}>
                    {manage ? (
                      <form action={updateUserAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="locale" value={lang} />
                        <input type="hidden" name="id" value={u.id} />
                        <select className="input w-auto" name="role" defaultValue={u.role} aria-label={t('role')}>
                          {roles.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
                        </select>
                        <button type="submit" className="btn btn-sm">{t('saveRole')}</button>
                      </form>
                    ) : tr(u.role)}
                  </td>
                  <td data-label={t('status')}>
                    <div className="cell-stack">
                      <span className={`status-pill ${u.active ? 'ok' : 'fail'}`}>{u.active ? t('active') : t('inactive')}</span>
                      {u.active && !u.emailVerifiedAt ? <span className="note">{t('pendingEmail')}</span> : null}
                      {u.mustChangePassword && u.active ? <span className="note">{t('pendingPassword')}</span> : null}
                    </div>
                  </td>
                  <td data-label={t('lastLogin')}>{u.lastLoginAt ? fd.dateTime(u.lastLoginAt) : '—'}</td>
                  <td data-label={t('actions')}>
                    {manage ? (
                      <div className="flex flex-col gap-2">
                        <form action={updateUserAction}>
                          <input type="hidden" name="locale" value={lang} />
                          <input type="hidden" name="id" value={u.id} />
                          <input type="hidden" name="active" value={u.active ? '0' : '1'} />
                          <button type="submit" className={`btn btn-sm${u.active ? ' btn-danger' : ''}`}>{u.active ? t('deactivate') : t('activate')}</button>
                        </form>
                        {u.active ? <ResetPasswordButton id={u.id} /> : (
                          <details className="confirm-delete">
                            <summary className="btn btn-sm">{t('delete')}</summary>
                            <form action={deleteUserAction} className="flex flex-col gap-2 pt-2">
                              <input type="hidden" name="locale" value={lang} />
                              <input type="hidden" name="id" value={u.id} />
                              <span className="note">{t('deleteNote')}</span>
                              <div><button type="submit" className="btn btn-sm btn-danger">{t('deleteConfirm')}</button></div>
                            </form>
                          </details>
                        )}
                      </div>
                    ) : <span className="note">{u.id === me.id ? t('you') : '—'}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {invites.length ? (
        <section className="table-panel" aria-labelledby="invites-title">
          <h2 id="invites-title" className="px-4 pt-3">{t('invitesTitle')}</h2>
          <table className="data-table stack">
            <thead><tr><th>{t('name')}</th><th>{t('role')}</th><th>{t('status')}</th><th>{t('actions')}</th></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <td className="row-title"><b>{i.name}</b><div className="note">{i.email}</div></td>
                  <td data-label={t('role')}>{tr(i.role)}</td>
                  <td data-label={t('status')}><span className="status-pill warn">{t('invited')}</span> <span className="note">{t('inviteExpires', { date: fd.date(i.expiresAt) })}</span></td>
                  <td data-label={t('actions')}>
                    <div className="flex flex-wrap gap-2">
                      <form action={inviteAgainAction}>
                        <input type="hidden" name="locale" value={lang} />
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" className="btn btn-sm">{t('inviteAgain')}</button>
                      </form>
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="locale" value={lang} />
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" className="btn btn-sm btn-danger">{t('inviteRevoke')}</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <CreateUserForm roles={roles} full={!free} />
    </main>
  );
}
