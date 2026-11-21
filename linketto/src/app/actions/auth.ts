'use server';

import { redirect } from 'next/navigation';
import { clientIp, isRateLimited, rateLimit } from '@/lib/rate-limit';
import { ipBucket } from '@/lib/limiter';
import { z } from 'zod';
import {
  clearLoginChallenge,
  createLoginChallenge,
  createSession,
  destroySession,
  readLoginChallenge,
  registerUser,
  verifyLogin,
} from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin-list';
import { notifyAdmins } from '@/lib/admin-alert';
import { openTotpSecret } from '@/lib/totp-secret';
import { verifyTotp } from '@/lib/totp';
import { BACKUP_CODES_LOW, matchBackupCode } from '@/lib/backup-codes';
import { alertAtThreshold, countRecent, recordSecurityEvent, subjectHash } from '@/lib/security-events';
import { notifyUserSecurity, requestCountryCode, sendVerificationEmail } from '@/lib/account-flows';
import { isLocale } from '@/i18n/locales';
import { requestIp } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { RETENTION_DAYS, daysAgo } from '@/lib/retention-days';
import { generateReferralCode } from '@/lib/referral';
import { isValidSlug, normalizeSlug } from '@/lib/slug';

// Сигурност на входа (декларирано в политиката): IP при успешен вход,
// пази се 90 дни. Чисти се при всяко ново записване — без отделен cron.
async function logLoginIp(userId: string): Promise<void> {
  const ip = await requestIp();
  if (!ip) return;
  await prisma.loginEvent
    .create({ data: { userId, ip: ip.slice(0, 64) } })
    .catch(() => undefined);
  await prisma.loginEvent
    .deleteMany({
      where: { createdAt: { lt: daysAgo(RETENTION_DAYS.loginEvent) } },
    })
    .catch(() => undefined);
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
});

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('locale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

export async function registerAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  // При грешка пазим реферала и запазеното име — иначе се губят с формата.
  const keep = new URLSearchParams();
  for (const key of ['ref', 'handle'] as const) {
    const value = String(formData.get(key) ?? '').trim().slice(0, 64);
    if (value) keep.set(key, value);
  }
  const kept = keep.toString();
  const back = (error: string) =>
    `/${locale}/register?error=${error}${kept ? `&${kept}` : ''}`;
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    redirect(back('generic'));
  }
  // Червен/син екип: регистрацията беше без лимит (bcrypt ~350 ms CPU на
  // опит + оракул „имейлът е зает“). 5 на час от адрес (/64) и общ дневен таван.
  const ipKey = ipBucket(await clientIp());
  if (!rateLimit(`register-ip:${ipKey}`, 5, 60 * 60_000) || !rateLimit('register:global', 300, 24 * 60 * 60_000)) {
    redirect(back('generic'));
  }
  const name = String(formData.get('name') ?? '').trim().slice(0, 100) || null;
  const user = await registerUser(
    parsed.data.email,
    parsed.data.password,
    name,
    locale,
  );
  if (!user) {
    redirect(back('exists'));
  }

  // Реферал: ако идва през нечий линк (?ref=CODE), запомняме поканилия.
  const refCode = String(formData.get('ref') ?? '').trim().slice(0, 32);
  const referrer = refCode
    ? await prisma.user.findUnique({
        where: { referralCode: refCode },
        select: { id: true },
      })
    : null;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      referralCode: generateReferralCode(),
      // никой не може да покани сам себе си
      referredById:
        referrer && referrer.id !== user.id ? referrer.id : undefined,
    },
  });

  // „Запази си името“: профилът с избрания адрес се създава веднага, за да
  // не го вземе някой друг между регистрацията и първото влизане в таблото.
  // Зает/невалиден адрес → без профил (таблото предлага създаване).
  const handle = normalizeSlug(String(formData.get('handle') ?? '').slice(0, 64));
  if (handle && isValidSlug(handle)) {
    await prisma.profile
      .create({
        data: {
          userId: user.id,
          slug: handle,
          defaultLocale: locale,
          translations: {
            create: { locale, displayName: name ?? handle },
          },
        },
      })
      .catch(() => undefined); // уникалността на slug е в базата (P2002)
  }

  await logLoginIp(user.id);
  // Имейлът се потвърждава по писмо (без потвърден имейл няма админ достъп).
  // Най-добро усилие: провал на пощата не чупи вече създадения акаунт (писмото се праща пак от „Сигурност“).
  await sendVerificationEmail(user).catch(() => false);
  if (isAdminEmail(user.email)) {
    // Разбивача F1: регистрация с админ адрес — собственикът трябва да знае веднага.
    await recordSecurityEvent('admin.register', { userId: user.id, country: await requestCountryCode() });
    await notifyAdmins('Регистрация с админ адрес', [
      `Адрес: ${user.email}`,
      'Ако не си бил ти — НЕ отваряй писмото за потвърждение и изтрий акаунта от админ панела.',
    ]).catch(() => false);
  }
  await createSession(user.id, { admin: isAdminEmail(user.email) });
  redirect(`/${locale}/dashboard`);
}

export async function loginAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    redirect(`/${locale}/login?error=invalid`);
  }
  // Лимит на опитите (bcrypt е скъп и няма друг праг срещу налучкване):
  // 10 за 10 мин по IP (всеки опит) и 20 за 10 мин по имейл — броят се САМО
  // неуспешните, за да не може чужд човек да заключи акаунта с 5 грешни пароли
  // (ревю 2026-11-14). Разпределено налучкване по много IP-та спира таванът
  // по имейл; заключване на жертвата иска 20 неуспеха на всеки 10 минути.
  const ip = await clientIp();
  const email = parsed.data.email.toLowerCase();
  const emailKey = `login-email:${email}`;
  if (
    !rateLimit(`login-ip:${ipBucket(ip)}`, 10, 10 * 60_000) ||
    isRateLimited(emailKey, 20, 10 * 60_000)
  ) {
    redirect(`/${locale}/login?error=invalid`);
  }
  const user = await verifyLogin(parsed.data.email, parsed.data.password);
  if (!user) {
    rateLimit(emailKey, 20, 10 * 60_000);
    // Дневник (HMAC на имейла, без IP) + аларма при вълна срещу един акаунт (D1).
    const subject = subjectHash(email);
    await recordSecurityEvent('auth.login.failed', { subject, country: await requestCountryCode() });
    // Стражата: вълна срещу един акаунт, бавно налучкване (24 ч) и „пръскане“ по много акаунти.
    if (subject) {
      await alertAtThreshold({ name: 'login-wave', key: subject, threshold: 20 }, await countRecent('auth.login.failed', 10, { subject }), 'Вълна от неуспешни входове', [
        '20+ неуспешни опита за вход в един акаунт за 10 минути (възможно налучкване на парола).',
      ]);
      await alertAtThreshold(
        { name: 'login-slow', key: subject, threshold: 50, windowMs: 24 * 60 * 60_000 },
        await countRecent('auth.login.failed', 24 * 60, { subject }),
        'Бавно налучкване на парола',
        ['50+ неуспешни опита за вход в един акаунт за 24 часа.'],
      );
    }
    await alertAtThreshold({ name: 'login-spray', threshold: 200 }, await countRecent('auth.login.failed', 10), 'Масови неуспешни входове', [
      '200+ неуспешни опита за вход за 10 минути в целия сайт (възможно „пръскане“ на пароли по много акаунти).',
    ]);
    redirect(`/${locale}/login?error=invalid`);
  }
  // 2FA: паролата сама не дава сесия — първо код (вход на 2 стъпки).
  if (user.totpEnabledAt) {
    await createLoginChallenge(user.id);
    redirect(`/${locale}/login/2fa`);
  }
  await completeLogin(user, false);
  redirect(isAdminEmail(user.email) ? `/${locale}/dashboard/security?need=admin2fa` : `/${locale}/dashboard`);
}

/** Сесия + дневник; вход в админ акаунт = аларма до всички админи (D2). */
async function completeLogin(user: { id: string; email: string }, mfa: boolean): Promise<void> {
  const admin = isAdminEmail(user.email);
  await logLoginIp(user.id);
  await createSession(user.id, { admin, mfa });
  const country = await requestCountryCode();
  await recordSecurityEvent(admin ? 'admin.login' : 'auth.login', { userId: user.id, country, meta: { mfa } });
  if (admin) {
    await notifyAdmins('Вход в админ акаунт', [
      `Акаунт: ${user.email}`,
      `Държава: ${country ?? 'неизвестна'}`,
      `С 2FA: ${mfa ? 'да' : 'НЕ'}`,
      'Ако не си бил ти — смени паролата и изведи всички устройства веднага.',
    ]).catch(() => false);
  }
}

const mfaSchema = z.string().trim().min(6).max(20);

/** Стъпка 2 на входа: код от приложението или резервен код. */
export async function verifyMfaAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const challenge = await readLoginChallenge();
  if (!challenge) redirect(`/${locale}/login?error=expired`);
  const user = challenge.user;
  const code = mfaSchema.safeParse(formData.get('code'));
  // 5 опита на предизвикателство и 5 за 15 мин. на акаунт (критичен ключ).
  if (!code.success || !rateLimit(`mfa:${user.id}`, 5, 15 * 60_000) || challenge.attempts >= 5) {
    await failMfa(challenge.id, user, locale, challenge.attempts);
  }
  const value = code.success ? code.data : '';
  const secret = await openTotpSecret(user);
  const step = secret ? verifyTotp(secret, value, { lastStep: user.totpLastStep }) : null;
  if (step !== null) {
    // Условно: същата стъпка не минава два пъти дори при паралелни заявки.
    const { count } = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    if (count === 1) {
      await clearLoginChallenge(challenge.id);
      await completeLogin(user, true);
      redirect(`/${locale}/dashboard`);
    }
  } else {
    const index = matchBackupCode(value, user.backupCodeHashes);
    if (index >= 0) {
      const left = user.backupCodeHashes.filter((_, i) => i !== index);
      const { count } = await prisma.user.updateMany({
        where: { id: user.id, backupCodeHashes: { equals: user.backupCodeHashes } },
        data: { backupCodeHashes: left },
      });
      if (count === 1) {
        await clearLoginChallenge(challenge.id);
        await completeLogin(user, true);
        await recordSecurityEvent('mfa.backup_used', { userId: user.id, meta: { left: left.length } });
        await notifyUserSecurity(user, 'backup-used', left.length);
        if (isAdminEmail(user.email)) {
          await notifyAdmins('Резервен 2FA код в админ акаунт', [`Акаунт: ${user.email}`, `Остават: ${left.length}`]).catch(() => false);
        }
        redirect(`/${locale}/dashboard${left.length <= BACKUP_CODES_LOW ? '/security?need=backup' : ''}`);
      }
    }
  }
  await failMfa(challenge.id, user, locale, challenge.attempts);
}

async function failMfa(
  challengeId: string,
  user: { id: string; email: string },
  locale: string,
  attempts: number,
): Promise<never> {
  await recordSecurityEvent('mfa.failed', { userId: user.id });
  // Вярна парола + грешен код в админ акаунт = паролата вероятно е изтекла (Стражата B2).
  if (isAdminEmail(user.email)) {
    await alertAtThreshold({ name: 'admin-mfa-failed', key: user.id, threshold: 1 }, 1, 'Грешен 2FA код в админ акаунт', [
      `Акаунт: ${user.email}`,
      'Паролата е била вярна, кодът — не. Ако не си бил ти, смени паролата веднага.',
    ]);
  }
  if (attempts + 1 >= 5) {
    await clearLoginChallenge(challengeId);
    redirect(`/${locale}/login?error=invalid`);
  }
  await prisma.loginChallenge.update({ where: { id: challengeId }, data: { attempts: { increment: 1 } } }).catch(() => undefined);
  redirect(`/${locale}/login/2fa?error=code`);
}

export async function logoutAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  await destroySession();
  redirect(`/${locale}`);
}
