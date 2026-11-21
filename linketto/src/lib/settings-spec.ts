// Описанието на настройките на доставчиците — чисто, тества се. Само Revolut
// (плащания) и Brevo (имейли): друг доставчик на плащания няма и не може да се
// добави от админа (решение на собственика — плащанията са само през Revolut).

export const SETTING_ENV = {
  'revolut.secretKey': 'REVOLUT_SECRET_KEY',
  'revolut.webhookSecret': 'REVOLUT_WEBHOOK_SECRET',
  'revolut.env': 'REVOLUT_ENV',
  'brevo.apiKey': 'BREVO_API_KEY',
  'brevo.sender': 'EMAIL_FROM',
} as const;

export type SettingKey = keyof typeof SETTING_ENV;

export const SETTING_KEYS = Object.keys(SETTING_ENV) as SettingKey[];

/** Стойността само от .env (без базата). */
export function envSetting(key: SettingKey, env: Record<string, string | undefined> = process.env): string | null {
  const value = env[SETTING_ENV[key]]?.trim();
  return value ? value : null;
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export interface EmailSender {
  name?: string;
  email: string;
}

/** EMAIL_FROM „Linketto <no-reply@…>“ или само адрес → подател за Brevo. */
export function parseSender(raw: string): EmailSender | null {
  const value = raw.trim();
  const match = /^(.*?)\s*<([^>]+)>$/.exec(value);
  const email = (match ? match[2] : value).trim();
  if (!EMAIL_RE.test(email)) return null;
  const name = match?.[1].trim().replace(/^"|"$/g, '').trim();
  return name ? { name, email } : { email };
}

/** Тайните се пазят шифровани и никога не се показват обратно. */
export function isSecretSetting(key: SettingKey): boolean {
  return key === 'revolut.secretKey' || key === 'revolut.webhookSecret' || key === 'brevo.apiKey';
}

/**
 * Проверка на формата преди запис (без мрежа). Връща нормализираната
 * стойност или null. Пречи на очевидни грешки (ключ в грешно поле).
 */
export function validateSetting(key: SettingKey, raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > 500) return null;
  if (key !== 'brevo.sender' && /\s/.test(value)) return null;
  switch (key) {
    case 'revolut.secretKey':
      return /^sk_[A-Za-z0-9_-]{16,200}$/.test(value) ? value : null;
    case 'revolut.webhookSecret':
      // Схемата на Revolut няма шаблон (`wsk_` е само в примера) — приема се всеки
      // низ без интервали, но не и ключ, сложен в грешното поле.
      return /^[A-Za-z0-9_-]{8,200}$/.test(value) && !/^(sk_|xkeysib-)/.test(value) ? value : null;
    case 'revolut.env':
      return value === 'sandbox' || value === 'production' ? value : null;
    case 'brevo.apiKey':
      return /^xkeysib-[A-Za-z0-9-]{20,200}$/.test(value) ? value : null;
    case 'brevo.sender':
      // Същият парсер, който ползва пощата — иначе „валиден“ подател тихо спира всички писма.
      return parseSender(value) ? value : null;
  }
}

/** Последните 4 знака на тайна (за „••••1234“ в админа). */
export function last4(value: string): string {
  return value.slice(-4);
}

/** Групите в админ панела — всяка форма пипа само своите ключове. */
export const SETTING_GROUPS = {
  revolut: ['revolut.secretKey', 'revolut.webhookSecret', 'revolut.env'],
  brevo: ['brevo.apiKey', 'brevo.sender'],
} as const satisfies Record<string, readonly SettingKey[]>;

export type SettingGroup = keyof typeof SETTING_GROUPS;

export function isSettingGroup(value: string): value is SettingGroup {
  return Object.prototype.hasOwnProperty.call(SETTING_GROUPS, value);
}

/**
 * Формата на админа → какво да се запише. Празно поле = без промяна (тайните
 * не се показват обратно). Едно невалидно поле спира целия запис — без
 * частично сменени ключове.
 */
export function planSettingUpdates(
  group: SettingGroup,
  input: (key: SettingKey) => string | null,
): { ok: true; updates: { key: SettingKey; value: string }[] } | { ok: false; invalid: SettingKey } {
  const updates: { key: SettingKey; value: string }[] = [];
  for (const key of SETTING_GROUPS[group]) {
    const raw = input(key);
    if (raw === null || raw.trim() === '') continue;
    const value = validateSetting(key, raw);
    if (value === null) return { ok: false, invalid: key };
    updates.push({ key, value });
  }
  return { ok: true, updates };
}

/**
 * Смяна на Revolut ключ или среда при висящи поръчки (`pending` до 3 дни,
 * `refund_pending`): поръчка от едната среда не съществува в другата — cron-ът
 * би я виждал като 404 завинаги, а заседнал refund вкарва следващите плащания
 * на човека в `conflict`. Затова — само с изрично потвърждение на точния брой.
 */
export function revolutSwitchCheck(input: {
  updates: { key: SettingKey; value: string }[];
  currentEnv: string | null;
  openOrders: number;
  confirmed: string | null;
}): { blocked: boolean; envChanged: boolean } {
  const env = input.updates.find((update) => update.key === 'revolut.env')?.value;
  const envChanged = env !== undefined && env !== (input.currentEnv ?? 'sandbox');
  const keyChanged = input.updates.some((update) => update.key === 'revolut.secretKey');
  const risky = (envChanged || keyChanged) && input.openOrders > 0;
  return { blocked: risky && input.confirmed !== String(input.openOrders), envChanged };
}
