import { z } from 'zod';
import { prisma } from '../db.js';
import { MINUTE } from '../time.js';
import { BRAND } from '../brand.js';

/**
 * Глобалните настройки, които мастър акаунтът сменя без деплой. ЕДИНСТВЕНИЯТ списък: панелът рисува
 * формата от тук, кодът чете стойностите с `setting()`. Нова настройка = нов ред (стойност по
 * подразбиране + zod + описание на двата езика).
 */
export const SETTINGS = {
  'registration.enabled': {
    schema: z.boolean(),
    default: true,
    label: { bg: 'Регистрацията е отворена', en: 'Registration is open' },
    help: {
      bg: 'Действа само ако и REGISTRATION_OPEN=true на сървъра (правните текстове са публикувани).',
      en: 'Takes effect only if REGISTRATION_OPEN=true on the server (legal texts are published).',
    },
  },
  'issue.deadlineDays': {
    schema: z.number().int().min(1).max(30),
    default: 5,
    label: { bg: 'Срок за издаване (дни)', en: 'Issue deadline (days)' },
    help: {
      bg: 'Чл. 113, ал. 4 ЗДДС: 5 дни; законопроектът за 2028 г. предвижда 10.',
      en: 'Art. 113(4) of the VAT Act: 5 days; the 2028 bill provides 10.',
    },
  },
  'issue.requireBankAccount': {
    schema: z.boolean(),
    default: false,
    label: { bg: 'Сметката е задължителен реквизит', en: 'Bank account is a required field' },
    help: {
      bg: 'Т. 16 на чл. 114, ал. 1 по законопроекта — включете, когато влезе в сила.',
      en: 'Art. 114(1)(16) under the bill — turn on when it takes effect.',
    },
  },
  'issue.profile': {
    schema: z.enum(['en16931', 'peppol']),
    default: 'en16931' as 'en16931' | 'peppol',
    label: { bg: 'Профил на XML', en: 'XML profile' },
    help: {
      bg: 'en16931 — общият стандарт; peppol — с изискванията на Peppol BIS Billing 3.0.',
      en: 'en16931 — the core standard; peppol — with Peppol BIS Billing 3.0 requirements.',
    },
  },
  'documents.signature': {
    schema: z.string().max(200),
    default: BRAND.signature as string,
    label: {
      bg: 'Подпис на Фактурист във всеки документ',
      en: 'Fakturist signature on every document',
    },
    help: {
      bg: 'Последният ред на бележката в XML-а и долният ред на PDF-а. Празно — без подпис.',
      en: 'The last line of the XML note and the footer of the PDF. Empty — no signature.',
    },
  },
  'site.notice': {
    schema: z.string().max(300),
    default: '',
    label: { bg: 'Съобщение в приложението', en: 'In-app notice' },
    help: { bg: 'Празно — без съобщение.', en: 'Empty — no notice.' },
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;

let cache: { at: number; values: Map<string, unknown> } | null = null;

export function invalidateSettings(): void {
  cache = null;
}

async function load(): Promise<Map<string, unknown>> {
  if (cache && Date.now() - cache.at < MINUTE) return cache.values;
  const rows = await prisma.setting.findMany();
  const values = new Map<string, unknown>(rows.map((row) => [row.key, row.value]));
  cache = { at: Date.now(), values };
  return values;
}

/** Стойността от базата, ако минава схемата; иначе подразбиращата се (повредена стойност не чупи нищо). */
export async function setting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const values = await load();
  const definition = SETTINGS[key];
  const parsed = definition.schema.safeParse(values.get(key));
  return (parsed.success ? parsed.data : definition.default) as SettingValue<K>;
}
