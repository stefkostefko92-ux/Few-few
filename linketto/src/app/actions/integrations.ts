'use server';

// Админ: ключовете на Revolut (плащания) и Brevo (имейли) от панела
// (docs/security-2fa-settings-spec.md, В). Друг доставчик на плащания няма.
// Запис и изтриване — само с пресен 2FA код (step-up). Тайните се шифроват
// (AES-256-GCM, SETTINGS_KEY) и никога не се показват обратно. Алармата до
// всички админи тръгва ПРЕДИ записа — през досегашния Brevo, за да не може
// подменен ключ да я погълне.

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isLocale } from '@/i18n/locales';
import { requireAdmin, requireStepUp } from '@/lib/admin';
import { adminAlertEmail, notifyAdmins } from '@/lib/admin-alert';
import { canSeal, seal, sealContext } from '@/lib/secret-box';
import { invalidateSettings, openRevolutOrders, setting, settingSource } from '@/lib/settings';
import {
  envSetting,
  isSecretSetting,
  isSettingGroup,
  last4,
  planSettingUpdates,
  revolutSwitchCheck,
  SETTING_KEYS,
  type SettingKey,
} from '@/lib/settings-spec';
import { rateLimit } from '@/lib/rate-limit';
import { recordSecurityEvent } from '@/lib/security-events';
import { registerRevolutWebhook, revolutPing, revolutReady } from '@/lib/revolut';
import { brevoPing, emailReady, sendEmail } from '@/lib/email';
import { REVOLUT_WEBHOOK_URL, SITE_URL } from '@/lib/seo';

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('uiLocale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

const back = (locale: string, query: string) => `/${locale}/admin?${query}#integrations`;

// Само за алармата до админите (служебна, на български).
const LABEL: Record<SettingKey, string> = {
  'revolut.secretKey': 'Revolut — таен API ключ',
  'revolut.webhookSecret': 'Revolut — тайна на уебхука',
  'revolut.env': 'Revolut — среда',
  'brevo.apiKey': 'Brevo — API ключ',
  'brevo.sender': 'Brevo — подател',
};

async function alertChange(adminEmail: string, what: string, keys: SettingKey[]): Promise<void> {
  await notifyAdmins(`Ключове на доставчик: ${what}`, [
    `Админ: ${adminEmail}`,
    ...keys.map((key) => LABEL[key]),
    'Ако не си бил ти — влез, върни ключовете и смени паролата на админ акаунта.',
  ]).catch(() => false);
}

/** След запис — веднага проверка при доставчика (грешен ключ/среда личи на момента). */
async function pingQuery(group: 'revolut' | 'brevo'): Promise<string> {
  // Без ключ няма какво да се проверява (иначе „няма връзка“ би заблуждавало).
  if (!(await setting(group === 'revolut' ? 'revolut.secretKey' : 'brevo.apiKey'))) return '';
  if (group === 'brevo') {
    // Реално писмо до админите С НОВИТЕ настройки (Разбивача F2): иначе непотвърден
    // подател в Brevo тихо спира всички писма, вкл. алармите.
    const sent = await notifyAdmins('Brevo настройките са сменени', [
      'Това писмо идва с новите настройки на Brevo — пощата работи.',
    ]).catch(() => false);
    return `&test=mail-${sent ? 'ok' : 'fail'}`;
  }
  const result = await revolutPing();
  return `&test=${group}-${result.ok ? 'ok' : 'fail'}${result.status ? `&code=${result.status}` : ''}`;
}

/**
 * След смяна на Revolut среда старата тайна на уебхука не важи. От панела —
 * трие се (в същата транзакция); от .env — не може да се трие оттук, затова
 * админът получава изрично указание да я махне и от .env (Продавача B1).
 */
async function webhookAfterEnvChange(envChanged: boolean): Promise<{ drop: boolean; flag: string }> {
  if (!envChanged) return { drop: false, flag: '' };
  const source = await settingSource('revolut.webhookSecret');
  if (source === 'admin') return { drop: true, flag: '&webhook=reset' };
  if (source === 'env') return { drop: false, flag: '&webhook=env-stale' };
  return { drop: false, flag: '' };
}

function confirmedFrom(formData: FormData): string | null {
  const value = formData.get('confirmOpen');
  return typeof value === 'string' ? value : null;
}

function upsertSetting(key: SettingKey, value: string, adminId: string) {
  const data = isSecretSetting(key)
    ? { value: null, sealed: seal(value, sealContext.setting(key)), last4: last4(value), updatedBy: adminId }
    : { value, sealed: null, last4: null, updatedBy: adminId };
  return prisma.setting.upsert({ where: { key }, create: { key, ...data }, update: data });
}

/** Запис на една група (Revolut или Brevo). Празно поле = без промяна. */
export async function saveSettingsAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const admin = await requireStepUp(locale);
  const group = String(formData.get('group') ?? '');
  if (!isSettingGroup(group)) redirect(back(locale, 'error=input'));
  if (!rateLimit(`settings:${admin.id}`, 20, 60 * 60_000)) redirect(back(locale, 'error=rate'));
  const plan = planSettingUpdates(group, (key) => {
    const value = formData.get(key);
    return typeof value === 'string' ? value : null;
  });
  if (!plan.ok) redirect(back(locale, `error=setting&field=${encodeURIComponent(plan.invalid)}`));
  if (plan.updates.length === 0) redirect(back(locale, 'ok=nochange'));
  if (plan.updates.some((update) => isSecretSetting(update.key)) && !canSeal()) redirect(back(locale, 'error=nokey'));

  let envChanged = false;
  if (group === 'revolut') {
    const openOrders = await openRevolutOrders();
    const check = revolutSwitchCheck({
      updates: plan.updates,
      currentEnv: await setting('revolut.env'),
      openOrders,
      confirmed: confirmedFrom(formData),
    });
    if (check.blocked) redirect(back(locale, `error=open-orders&count=${openOrders}`));
    envChanged = check.envChanged;
  }

  const keys = plan.updates.map((update) => update.key);
  // Нова среда → старата тайна на уебхука не важи (уебхукът е към другата среда).
  const webhook = keys.includes('revolut.webhookSecret') ? { drop: false, flag: '' } : await webhookAfterEnvChange(envChanged);
  const dropWebhook = webhook.drop;
  await alertChange(admin.email, 'променени', dropWebhook ? [...keys, 'revolut.webhookSecret'] : keys);
  // Всичко или нищо: една транзакция за цялата група.
  await prisma.$transaction([
    ...plan.updates.map((update) => upsertSetting(update.key, update.value, admin.id)),
    ...(dropWebhook ? [prisma.setting.deleteMany({ where: { key: 'revolut.webhookSecret' } })] : []),
  ]);
  invalidateSettings();
  await recordSecurityEvent('setting.changed', { userId: admin.id, meta: { action: 'save', keys, dropWebhook } });
  redirect(back(locale, `ok=settings${webhook.flag}${await pingQuery(group)}`));
}

/** Изтрива стойността от панела → важи тази от .env (ако има). */
export async function clearSettingAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const admin = await requireStepUp(locale);
  const key = String(formData.get('key') ?? '') as SettingKey;
  if (!SETTING_KEYS.includes(key)) redirect(back(locale, 'error=input'));
  if (!rateLimit(`settings:${admin.id}`, 20, 60 * 60_000)) redirect(back(locale, 'error=rate'));
  // „Върни към .env“ също сменя ефективната среда/ключ → същата проверка за висящи
  // поръчки и същото нулиране на уебхука като при запис (Кодаджията).
  let envChanged = false;
  if (key === 'revolut.env' || key === 'revolut.secretKey') {
    const openOrders = await openRevolutOrders();
    const check = revolutSwitchCheck({
      updates: [{ key, value: envSetting(key) ?? (key === 'revolut.env' ? 'sandbox' : '') }],
      currentEnv: await setting('revolut.env'),
      openOrders,
      confirmed: confirmedFrom(formData),
    });
    if (check.blocked) redirect(back(locale, `error=open-orders&count=${openOrders}`));
    envChanged = check.envChanged;
  }
  const webhook = await webhookAfterEnvChange(envChanged);
  await alertChange(admin.email, 'изтрити от панела (важи .env)', webhook.drop ? [key, 'revolut.webhookSecret'] : [key]);
  await prisma.$transaction([
    prisma.setting.deleteMany({ where: { key } }),
    ...(webhook.drop ? [prisma.setting.deleteMany({ where: { key: 'revolut.webhookSecret' } })] : []),
  ]);
  invalidateSettings();
  await recordSecurityEvent('setting.changed', {
    userId: admin.id,
    meta: { action: 'clear', keys: [key], dropWebhook: webhook.drop },
  });
  redirect(back(locale, `ok=settings${webhook.flag}`));
}

/** „Провери връзката“ — само четене при доставчика; резултатът е код, без тяло. */
export async function testIntegrationAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const admin = await requireAdmin(locale);
  const provider = String(formData.get('provider') ?? '');
  if (provider !== 'revolut' && provider !== 'brevo') redirect(back(locale, 'error=input'));
  if (!rateLimit(`settings-test:${admin.id}`, 10, 10 * 60_000)) redirect(back(locale, 'error=rate'));
  const result = provider === 'revolut' ? await revolutPing() : await brevoPing();
  const code = result.status ? `&code=${result.status}` : '';
  redirect(back(locale, `test=${provider}-${result.ok ? 'ok' : 'fail'}${code}`));
}

/** Тестово писмо до самия админ — проверява ключа И подателя. */
export async function sendTestEmailAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const admin = await requireAdmin(locale);
  if (!rateLimit(`settings-mail:${admin.id}`, 5, 60 * 60_000)) redirect(back(locale, 'error=rate'));
  if (!(await emailReady())) redirect(back(locale, 'test=mail-off'));
  const { subject, html } = adminAlertEmail({
    subject: 'Тестово писмо',
    lines: ['Brevo е настроен правилно — писмата на Linketto тръгват.'],
    adminUrl: `${SITE_URL}/${locale}/admin`,
  });
  const sent = await sendEmail({ to: admin.email, subject, html, tag: 'admin-test' });
  redirect(back(locale, `test=mail-${sent ? 'ok' : 'fail'}`));
}

/**
 * Регистрира уебхука на Revolut към този сайт (DEPLOY §3) и пази тайната му
 * шифрована — без ръчни заявки с curl.
 */
export async function registerWebhookAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const admin = await requireStepUp(locale);
  if (!rateLimit(`settings:${admin.id}`, 20, 60 * 60_000)) redirect(back(locale, 'error=rate'));
  if (!canSeal()) redirect(back(locale, 'error=nokey'));
  if (!(await revolutReady())) redirect(back(locale, 'test=webhook-nokey'));
  const result = await registerRevolutWebhook(REVOLUT_WEBHOOK_URL);
  if ('error' in result) {
    const code = result.status ? `&code=${result.status}` : '';
    redirect(back(locale, `test=webhook-${result.error}${code}`));
  }
  await alertChange(admin.email, result.reused ? 'тайна от съществуващ уебхук в Revolut' : 'нов уебхук в Revolut', [
    'revolut.webhookSecret',
  ]);
  await upsertSetting('revolut.webhookSecret', result.secret, admin.id);
  invalidateSettings();
  // В продукция спорове без известие са опасни (срокове) — отделна аларма.
  if (!result.disputes && (await setting('revolut.env')) === 'production') {
    await notifyAdmins('Revolut уебхук БЕЗ спорове', [
      'Revolut не прие събитията DISPUTE_* за уебхука в продукция.',
      'Споровете (със срокове за отговор) се виждат само в Revolut Business — проверявай ги там.',
    ]).catch(() => false);
  }
  await recordSecurityEvent('setting.changed', {
    userId: admin.id,
    meta: { action: 'webhook', keys: ['revolut.webhookSecret'], disputes: result.disputes },
  });
  redirect(back(locale, `test=webhook-ok${result.disputes ? '' : '&nodisputes=1'}${result.reused ? '&reused=1' : ''}`));
}
