import QRCode from 'qrcode';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DashShell } from '@/components/DashShell';
import { CodesForm } from '@/components/security/CodesForm';
import { Badge } from '@/components/ui/Badge';
import { buttonStyles } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { PageHeader } from '@/components/ui/PageHeader';
import type { Locale } from '@/i18n/locales';
import { getSession } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin-list';
import { prisma } from '@/lib/db';
import { planFor } from '@/lib/plans';
import { open as openSealed } from '@/lib/secret-box';
import { otpauthUri } from '@/lib/totp';
import {
  cancelTotpEnrollAction,
  changePasswordAction,
  confirmTotpEnrollAction,
  disableTotpAction,
  logoutEverywhereAction,
  regenerateBackupCodesAction,
  resendVerificationAction,
  startTotpEnrollAction,
} from '@/app/actions/security';

export const dynamic = 'force-dynamic';

const field = 'mt-1 block w-full rounded-control border border-line-input bg-surface px-3 py-2 text-sm';
const card = 'dash-card rounded-card border border-line bg-surface p-5 shadow-e1 sm:p-6';

export default async function SecurityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ok?: string; error?: string; need?: string; step?: string }>;
}) {
  const { locale } = await params;
  const { ok, error, need } = await searchParams;
  const active = await getSession();
  if (!active) redirect(`/${locale}/login`);
  const { user } = active;
  const t = await getTranslations({ locale, namespace: 'security' });

  const [profiles, sessionCount, logins] = await Promise.all([
    prisma.profile.findMany({ where: { userId: user.id }, select: { id: true, slug: true }, orderBy: { createdAt: 'asc' } }),
    prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
    prisma.loginEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);

  // QR за записване — само докато има чакащ (непотвърден) секрет.
  const pendingSecret = user.totpPendingSealed ? openSealed(user.totpPendingSealed, `totp-pending:${user.id}`) : null;
  const qr = pendingSecret
    ? await QRCode.toDataURL(otpauthUri(pendingSecret, user.email), { margin: 1, width: 220, errorCorrectionLevel: 'M' })
    : null;

  const errors: Record<string, string> = {
    code: t('errorCode'),
    rate: t('errorRate'),
    expired: t('errorExpired'),
    off: t('errorCode'),
  };
  const okText: Record<string, string> = {
    password: t('okPassword'),
    'mfa-off': t('okMfaOff'),
    sent: t('okSent'),
    verified: t('okVerified'),
  };
  const errorText: Record<string, string> = {
    rate: t('errorRate'),
    password: t('errorPassword'),
    current: t('errorCurrent'),
    disable: t('errorDisable'),
    nokey: t('errorNokey'),
    email: t('errorEmail'),
  };
  const admin = isAdminEmail(user.email);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <DashShell
      locale={locale as Locale}
      page="security"
      profiles={profiles}
      activeId={profiles[0]?.id}
      planId={planFor(user.plan).id}
    >
      <PageHeader title={t('title')} description={t('intro')} />
      <div className="space-y-6">
        {ok && okText[ok] && <Callout tone="success">{okText[ok]}</Callout>}
        {error && errorText[error] && <Callout tone="danger">{errorText[error]}</Callout>}
        {need === 'admin2fa' && !user.totpEnabledAt && <Callout tone="warning">{t('adminRequired')}</Callout>}
        {need === 'verify' && !user.emailVerifiedAt && <Callout tone="warning">{t('adminVerifyRequired')}</Callout>}
        {user.totpEnabledAt && user.backupCodeHashes.length <= 3 && <Callout tone="warning">{t('backupLow')}</Callout>}

        {/* Имейл */}
        <section id="email" className={card}>
          <h2 className="flex items-center gap-2 text-subheading text-fg">
            {t('emailTitle')}
            <Badge tone={user.emailVerifiedAt ? 'success' : 'warning'}>
              {user.emailVerifiedAt ? t('emailVerified') : t('emailUnverified')}
            </Badge>
          </h2>
          <p className="mt-1 text-sm text-fg-2">{user.email}</p>
          {!user.emailVerifiedAt && (
            <form action={resendVerificationAction} className="mt-3">
              <input type="hidden" name="uiLocale" value={locale} />
              <p className="text-sm text-fg-muted">{t('emailUnverifiedHint')}</p>
              <button type="submit" className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'mt-3' })}>
                {t('emailResend')}
              </button>
            </form>
          )}
        </section>

        {/* 2FA */}
        <section id="mfa" className={card}>
          <h2 className="flex items-center gap-2 text-subheading text-fg">
            {t('mfaTitle')}
            <Badge tone={user.totpEnabledAt ? 'success' : admin ? 'danger' : 'neutral'}>
              {user.totpEnabledAt ? t('mfaOn') : t('mfaOff')}
            </Badge>
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{t('mfaIntro')}</p>

          {!user.totpEnabledAt && !pendingSecret && (
            <form action={startTotpEnrollAction} className="mt-4">
              <input type="hidden" name="uiLocale" value={locale} />
              <button type="submit" className={buttonStyles({})}>
                {t('mfaStart')}
              </button>
            </form>
          )}

          {!user.totpEnabledAt && pendingSecret && qr && (
            <div className="mt-4 grid gap-5 sm:grid-cols-[auto_1fr]">
              <div>
                <p className="text-sm font-semibold text-fg">{t('mfaScan')}</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, генериран на сървъра */}
                <img src={qr} alt="" width={220} height={220} className="mt-2 rounded-card border border-line bg-white p-2" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-fg-2">{t('mfaManual')}</p>
                <p className="mt-1 break-all rounded-control bg-surface-3 px-3 py-2 font-mono text-sm text-fg">
                  {pendingSecret.replace(/(.{4})/g, '$1 ').trim()}
                </p>
                <p className="mt-4 text-sm font-semibold text-fg">{t('mfaConfirm')}</p>
                <CodesForm
                  action={confirmTotpEnrollAction}
                  locale={locale}
                  labels={{ code: t('codeLabel'), codesTitle: t('codesTitle'), codesHint: t('codesHint'), done: t('codesDone') }}
                  errors={errors}
                  submitLabel={t('mfaConfirmButton')}
                />
                <form action={cancelTotpEnrollAction} className="mt-2">
                  <input type="hidden" name="uiLocale" value={locale} />
                  <button type="submit" className="text-sm text-fg-muted underline-offset-4 hover:underline">
                    {t('mfaCancel')}
                  </button>
                </form>
              </div>
            </div>
          )}

          {user.totpEnabledAt && (
            <div className="mt-4 space-y-5">
              <div>
                <p className="text-sm font-semibold text-fg">
                  {t('codesLeft', { count: user.backupCodeHashes.length })}
                </p>
                <p className="text-xs text-fg-muted">{t('codesRegenerateHint')}</p>
                <CodesForm
                  action={regenerateBackupCodesAction}
                  locale={locale}
                  labels={{ code: t('codeLabel'), codesTitle: t('codesTitle'), codesHint: t('codesHint'), done: t('codesDone') }}
                  errors={errors}
                  submitLabel={t('codesRegenerate')}
                  variant="secondary"
                />
              </div>
              <details className="rounded-card border border-line p-4">
                <summary className="cursor-pointer text-sm font-semibold text-danger-text">{t('disableTitle')}</summary>
                <p className="mt-2 text-xs text-fg-muted">{t('disableHint')}</p>
                <form action={disableTotpAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="uiLocale" value={locale} />
                  <label className="block text-sm font-medium">
                    {t('passwordLabel')}
                    <input type="password" name="password" required autoComplete="current-password" className={field} />
                  </label>
                  <label className="block text-sm font-medium">
                    {t('codeLabel')}
                    <input name="code" required autoComplete="one-time-code" maxLength={20} className={field} />
                  </label>
                  <button type="submit" className={buttonStyles({ variant: 'danger', size: 'sm', className: 'sm:justify-self-start' })}>
                    {t('disableButton')}
                  </button>
                </form>
              </details>
            </div>
          )}
        </section>

        {/* Парола */}
        <section id="password" className={card}>
          <h2 className="text-subheading text-fg">{t('passwordTitle')}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t('passwordHint')}</p>
          <form action={changePasswordAction} className="mt-4 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="uiLocale" value={locale} />
            <label className="block text-sm font-medium">
              {t('passwordCurrent')}
              <input type="password" name="current" required autoComplete="current-password" className={field} />
            </label>
            <label className="block text-sm font-medium">
              {t('passwordNew')}
              <input type="password" name="next" required minLength={10} maxLength={200} autoComplete="new-password" className={field} />
            </label>
            <label className="block text-sm font-medium">
              {t('passwordConfirm')}
              <input type="password" name="confirm" required minLength={10} maxLength={200} autoComplete="new-password" className={field} />
            </label>
            <button type="submit" className={buttonStyles({ size: 'sm', className: 'sm:justify-self-start' })}>
              {t('passwordButton')}
            </button>
          </form>
        </section>

        {/* Устройства */}
        <section id="sessions" className={card}>
          <h2 className="text-subheading text-fg">{t('sessionsTitle')}</h2>
          <p className="mt-1 text-sm text-fg-2">{t('sessionsActive', { count: sessionCount })}</p>
          {logins.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-fg-muted">{t('recentLogins')}</p>
              <ul className="mt-2 space-y-1 text-sm text-fg-2">
                {logins.map((login) => (
                  <li key={login.id} className="flex justify-between gap-3">
                    <span>{fmt.format(login.createdAt)}</span>
                    <span className="font-mono text-xs text-fg-muted">{login.ip}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <form action={logoutEverywhereAction} className="mt-4">
            <input type="hidden" name="uiLocale" value={locale} />
            <p className="text-xs text-fg-muted">{t('sessionsHint')}</p>
            <button type="submit" className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'mt-2' })}>
              {t('sessionsLogoutAll')}
            </button>
          </form>
        </section>
      </div>
    </DashShell>
  );
}
