// Шаблонен първи контакт + категории за сигнал. Кодовете са стабилни ключове;
// текстът живее в messages/<locale>.json (templates.* / reportCategories.*).
// Анти-тормоз по дизайн: свободен текст се отключва само след отговор.

export const TEMPLATE_CODES = [
  'FARI_ACCESI',
  'FINESTRINO_APERTO',
  'MI_HAI_BLOCCATO',
  'SOSTA_PERICOLOSA',
  'GOMMA_A_TERRA',
  'ALLARME_IN_FUNZIONE',
  'PERDITA_LIQUIDO',
  'AUTO_DANNEGGIATA',
] as const;

export type TemplateCode = (typeof TEMPLATE_CODES)[number];

export function isTemplateCode(value: string): value is TemplateCode {
  return (TEMPLATE_CODES as readonly string[]).includes(value);
}

export const REPORT_CATEGORIES = [
  'MOLESTIE',
  'SPAM_PUBBLICITA',
  'MINACCE',
  'TARGA_NON_MIA',
  'ALTRO',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export function isReportCategory(value: string): value is ReportCategory {
  return (REPORT_CATEGORIES as readonly string[]).includes(value);
}

// Лимити (анти-злоупотреба). Четат се само оттук — не се хардкодват по страници.
export const LIMITS = {
  firstContactsPerDay: 5, // нови нишки към непознати табели на ден
  threadExpiryHours: 48, // неприета нишка изтича
  maxTextLength: 1000,
} as const;
