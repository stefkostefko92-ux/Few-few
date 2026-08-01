/**
 * Съобщенията за грешка живеят ТУК, а формите приемат само **код** през
 * `?error=`. Ако текстът пътува през URL, всеки може да сподели
 * `…/submit?error=Акаунтът+ти+е+блокиран…` и на нашия домейн, в нашия дизайн,
 * ще се покаже чужд текст. React екранира, тоест не е XSS — но е социално
 * инженерство с нашата репутация като носител.
 */

export const FORM_ERRORS = {
  invalid: 'Проверѝ попълненото — нещо не е наред.',
  required_name: 'Името на сървъра е задължително (поне 2 знака).',
  required_email: 'Нужен е валиден имейл за връзка.',
  required_target: 'Нужен е cfx.re код или адрес host:port.',
  invalid_cfx: 'Невалиден cfx.re код.',
  invalid_address: 'Невалиден адрес. Формат: host:port (например 1.2.3.4:30120).',
  invalid_url: 'Линкът трябва да е пълен адрес, започващ с https://',
  invalid_rating: 'Оценката е число от 1 до 5.',
  required_reason: 'Опиши защо смяташ съдържанието за незаконно (поне 20 знака).',
  required_goodfaith: 'Декларацията за добросъвестност е задължителна.',
  rate_limit: 'Твърде много заявки в момента. Опитай пак след минута.',
  storage: 'Не успяхме да запишем заявката. Опитай пак по-късно.',
} as const;

export type FormErrorCode = keyof typeof FORM_ERRORS;

/** Непознат код никога не се показва дословно — пада към общото съобщение. */
export function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return FORM_ERRORS[code as FormErrorCode] ?? FORM_ERRORS.invalid;
}
