import { randomBytes } from 'node:crypto';

// Crockford base32 без подвеждащи символи (без I, L, O, U).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Кратък, четим код за гражданина — напр. „BD-7Q4ZK2". Лесен за продиктуване
 * по телефона. Уникалността се гарантира на ниво база (Report.publicCode).
 */
export function generatePublicCode(): string {
  const bytes = randomBytes(6);
  let code = '';
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return `BD-${code}`;
}
