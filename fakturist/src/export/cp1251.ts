/**
 * Кодиране в windows-1251 без зависимост: таблицата е обратната на декодера на платформата (TextDecoder
 * знае cp1251, TextEncoder — само UTF-8). Знак извън таблицата става „?“; управляващите (под 0x20) —
 * интервал (Приложение № 12 към ППЗДДС: символните полета са с кодове от 20 до FF).
 */
const ENCODE = new Map<string, number>();
const decoder = new TextDecoder('windows-1251');
for (let byte = 0x20; byte <= 0xff; byte += 1) {
  const char = decoder.decode(Uint8Array.of(byte));
  // Непопълнените позиции (0x98) декодерът дава като U+FFFD — не са знаци.
  if (char !== '�' && !ENCODE.has(char)) ENCODE.set(char, byte);
}

export function encodeCp1251(text: string): Buffer {
  const out = Buffer.alloc(text.length);
  let i = 0;
  for (const char of text) {
    if (char === '\r' || char === '\n') out[i] = char.charCodeAt(0);
    else if (char < ' ') out[i] = 0x20;
    else out[i] = ENCODE.get(char) ?? 0x3f;
    i += 1;
  }
  return out.subarray(0, i);
}

/** Може ли текстът да мине без „?“ — за предупреждение в прегледа. */
export function fitsCp1251(text: string): boolean {
  for (const char of text) if (char >= ' ' && !ENCODE.has(char)) return false;
  return true;
}
