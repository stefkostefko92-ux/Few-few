// Чисти помощници за AI текста — без server-only, за да се тестват директно.

/** Маха обгръщащи кавички, маркдаун акценти, събира интервалите; реже до 280. */
export function cleanBio(raw: string): string {
  const text = raw
    .trim()
    .replace(/^["'«»„“”]+|["'«»„“”]+$/g, '')
    .replace(/[*_`#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 280);
}

/**
 * Условията на Gemini API позволяват за потребители в ЕИП САМО платени
 * услуги (безплатният tier ползва входа за обучение) → fail-closed: ключ +
 * изрично GEMINI_PAID_TIER=1 (собственикът потвърждава платен акаунт с DPA).
 */
export function geminiAllowed(env: {
  GEMINI_API_KEY?: string;
  GEMINI_PAID_TIER?: string;
}): boolean {
  return Boolean(env.GEMINI_API_KEY) && env.GEMINI_PAID_TIER === '1';
}
