// WCAG 2.x контраст — чисти функции (профилите, темите, тестовете).

export type Rgba = { r: number; g: number; b: number; a: number };

/** #rgb / #rrggbb / #rrggbbaa → Rgba (невалидно → null). */
export function parseHex(value: string): Rgba | null {
  let h = value.trim().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) {
    h = Array.from(h)
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]+$/.test(h) || (h.length !== 6 && h.length !== 8)) {
    return null;
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

/** Слага `top` (с алфа) върху непрозрачен `base`. */
export function over(top: Rgba, base: Rgba): Rgba {
  return {
    r: top.r * top.a + base.r * (1 - top.a),
    g: top.g * top.a + base.g * (1 - top.a),
    b: top.b * top.a + base.b * (1 - top.a),
    a: 1,
  };
}

/** Смесва `a` към `b` с дял `share` на a (като color-mix in srgb). */
export function mix(a: Rgba, b: Rgba, share: number): Rgba {
  return {
    r: a.r * share + b.r * (1 - share),
    g: a.g * share + b.g * (1 - share),
    b: a.b * share + b.b * (1 - share),
    a: 1,
  };
}

export function luminance(c: Rgba): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

export function contrast(fg: Rgba, bg: Rgba): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function contrastHex(fg: string, bg: string): number {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) return 0;
  return contrast(over(f, b), b);
}
