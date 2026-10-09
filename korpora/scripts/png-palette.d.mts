/** PNG with a palette (8-bit, colour type 3) from 4-byte RGBA pixels; see png-palette.mjs. */
export function encodePalettePng(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Buffer;
