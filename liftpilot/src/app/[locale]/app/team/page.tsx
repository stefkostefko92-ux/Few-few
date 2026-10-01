import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { assignableRoles, outranks } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { listUsers } from '@/server/queries';
import { updateUserAction } from '@/server/user-actions';
import CreateUserForm from '@/components/CreateUserForm';
import ResetPasswordButton from '@/components/ResetPasswordButton';

export async function generateMetadata() {
  const t = await getTranslations('team');
  return { title: t('title') };
}

export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'users:manage');
  const [t, tr, users, lang] = await Promise.all([getTranslations('team'), getTranslations('roles'), listUsers(me), getLocale()]);
  const fd = dateFormat(locale);
  const roles = assignableRoles(me.role);
  return (
    <main className="page">
      <div className="page-head">
        <div className="titles">
          <h1>{t('title')}</h1>
          <p className="lead">{t('lead')}</p>
        </div>
      </div>
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
                        {u.active ? <ResetPasswordButton id={u.id} /> : null}
                      </div>
                    ) : <span className="note">{u.id === me.id ? t('you') : '—'}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CreateUserForm roles={roles} />
    </main>
  );
}
