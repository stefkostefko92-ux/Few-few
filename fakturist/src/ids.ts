/**
 * Идентификаторът на запис (cuid от Prisma) — единственото място на проверката. Адресите, формите и
 * настройките я ползват оттук, за да не се разминат.
 */
export const ID_PATTERN = '[a-z0-9]{20,40}';
export const ID = new RegExp(`^${ID_PATTERN}$`);

export function isId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}
