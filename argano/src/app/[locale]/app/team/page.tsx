import { getFormatter, getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { assignableRoles, outranks } from '@/lib/rbac';
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
  const [t, tr, format, users, lang] = await Promise.all([getTranslations('team'), getTranslations('roles'), getFormatter(), listUsers(me), getLocale()]);
  const roles = assignableRoles(me.role);
  return (
    <main className="page">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">{me.companyName}</p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('lead')}</p>
      </div>
      <div className="panel overflow-x-auto p-0">
        <table className="data-table">
          <thead><tr><th>{t('name')}</th><th>{t('role')}</th><th>{t('status')}</th><th>{t('lastLogin')}</th><th>{t('actions')}</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const manage = u.id !== me.id && outranks(me.role, u.role);
              return (
                <tr key={u.id}>
                  <td><b>{u.name}</b><div className="note">{u.email}</div></td>
                  <td>
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
                  <td>
                    <span className={`status-pill ${u.active ? 'ok' : 'fail'}`}>{u.active ? t('active') : t('inactive')}</span>
                    {u.mustChangePassword && u.active ? <div className="note">{t('pendingPassword')}</div> : null}
                  </td>
                  <td>{u.lastLoginAt ? format.dateTime(u.lastLoginAt, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                  <td>
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
