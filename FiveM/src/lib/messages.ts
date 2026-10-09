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

/**
 * Непознат код никога не се показва дословно — пада към общото съобщение.
 *
 * Търсенето е през `Object.hasOwn`, не през `??`, и това не е педантизъм:
 * обектният литерал носи прототипа си, значи `?error=__proto__` връщаше
 * `Object.prototype` — обект, не низ — и React Server Component-ът гърмеше с
 * „Objects are not valid as a React child“, тоест **500 на публична страница
 * от стойност в URL-а**. `?error=constructor` пък връщаше функция и рисуваше
 * празен банер. `??` не е защита срещу това: тези ключове НЕ са `undefined`.
 */
export function errorMessage(code: string | undefined, t: Dictionary): string | null {
  if (!code) return null;
  return Object.hasOwn(t.errors, code) ? t.errors[code as FormErrorCode] : t.errors.invalid;
}
