import type { Dictionary } from '@/i18n';

/**
 * Съобщенията за грешка живеят в РЕЧНИКА, а формите приемат само **код** през
 * `?error=`. Ако текстът пътува през URL, всеки може да сподели
 * `…/submit?error=Акаунтът+ти+е+блокиран…` и на нашия домейн, в нашия дизайн,
 * ще се покаже чужд текст. React екранира, тоест не е XSS — но е социално
 * инженерство с нашата репутация като носител. Кодът има и втора полза:
 * едно и също съобщение излиза правилно и на двата езика.
 */
export type FormErrorCode = keyof Dictionary['errors'];

/** Непознат код никога не се показва дословно — пада към общото съобщение. */
export function errorMessage(code: string | undefined, t: Dictionary): string | null {
  if (!code) return null;
  return t.errors[code as FormErrorCode] ?? t.errors.invalid;
}
