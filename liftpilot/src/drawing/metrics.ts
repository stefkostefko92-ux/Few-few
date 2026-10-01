// Text measure with the metrics of DejaVu Sans, the font the PDF is drawn with: the kernel wraps, fits and centres
// lettering itself, so the renderers only paint and the SVG preview and the PDF agree.
import { BOLD, REGULAR } from './metrics-data';

/** Horizontal scale of condensed lettering (dimensions and labels of the drawings). */
export const COND = 0.84;

const FALLBACK = 620;

export interface Font {
  size: number;
  bold?: boolean;
  cond?: boolean;
}

/** Width of a line of text on paper [mm]. */
export function textWidth(text: string, f: Font): number {
  const table = f.bold ? BOLD : REGULAR;
  let units = 0;
  for (const ch of text) units += table[ch.codePointAt(0) ?? 32] ?? FALLBACK;
  return (units / 1000) * f.size * (f.cond ? COND : 1);
}

/** Lines of a paragraph wrapped at `width`; words longer than the width are cut. Explicit newlines are kept. */
export function wrap(text: string, width: number, f: Font): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, f) <= width) { line = next; continue; }
      if (line) out.push(line);
      if (textWidth(word, f) <= width) { line = word; continue; }
      // a word wider than the line: cut it where it overflows
      let part = '';
      for (const ch of word) {
        if (textWidth(part + ch, f) > width && part) { out.push(part); part = ''; }
        part += ch;
      }
      line = part;
    }
    out.push(line);
  }
  return out;
}

/** The largest size, not above `size`, at which the text fits in `width`. */
export function fitSize(text: string, width: number, f: Font): number {
  const w = textWidth(text, f);
  return w <= width || w === 0 ? f.size : f.size * (width / w);
}
