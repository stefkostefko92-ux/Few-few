// Минималните типове на fontkit (без собствени) — само каквото ползва tests/pdf-style.test.ts.
declare module 'fontkit' {
  interface Font {
    hasGlyphForCodePoint(codePoint: number): boolean;
  }
  export function openSync(path: string): Font;
}
