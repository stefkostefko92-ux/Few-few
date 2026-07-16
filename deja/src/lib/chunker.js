// Реже текста на парчета с размер, удобен за embedding модела,
// по границите на изреченията и с малко припокриване за контекст.

const TARGET = 1100; // знака на парче ≈ 250-300 токена
const OVERLAP = 150; // опашка от предишното парче — пази контекста на ръба
const MIN_CHUNK = 40; // по-късо от това не носи смисъл
const MAX_CHUNKS = 64; // таван на страница — защита от гигантски документи

export function chunkText(text) {
  // Първо по изречения/редове; изречение-чудовище се реже насила.
  const parts = [];
  for (const raw of text.split(/(?<=[.!?…])\s+|\n+/)) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length <= TARGET) {
      parts.push(s);
    } else {
      for (let i = 0; i < s.length; i += TARGET) parts.push(s.slice(i, i + TARGET));
    }
  }

  const chunks = [];
  let current = '';
  for (const part of parts) {
    if (current && current.length + part.length + 1 > TARGET) {
      chunks.push(current);
      if (chunks.length >= MAX_CHUNKS) return chunks;
      current = current.slice(-OVERLAP) + ' ' + part;
    } else {
      current = current ? current + ' ' + part : part;
    }
  }
  if (current.length >= MIN_CHUNK) chunks.push(current);
  return chunks.slice(0, MAX_CHUNKS);
}
