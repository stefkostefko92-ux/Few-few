/**
 * Правила за имена (на човек и на проект), общи за схемите. Чист модул — без база.
 *
 * Не се приемат управляващи знаци (NUL и сие: PostgreSQL `text` не пази 0x00 и записът би дал 500) и
 * знаците за посока U+202A–U+202E и U+2066–U+2069, които обръщат текста в списъците и писмата.
 */
const UNSAFE = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

export function hasUnsafeChars(value: string): boolean {
  return UNSAFE.test(value);
}

const COPY_SUFFIX = ' (2)';

/**
 * Името на копие на проект: „<име> (2)“ в рамките на `max` знака. Суфиксът не се реже — съкращава се
 * името, без да се разделя сурогатна двойка (емоджи) по средата.
 */
export function copyName(name: string, max: number): string {
  let base = name.slice(0, max - COPY_SUFFIX.length);
  if (/[\uD800-\uDBFF]$/.test(base)) base = base.slice(0, -1);
  return `${base.trimEnd()}${COPY_SUFFIX}`;
}
