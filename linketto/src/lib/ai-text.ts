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
