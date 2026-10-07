// The ropes side by side over a wheel: how wide they lie, and a pulley with its cheeks round them. Pure.

/** Half the width of the n ropes side by side, and of a pulley with its cheeks [mm]. */
export function ropeWidths(n: number, d: number): { ropes: number; pulley: number } {
  const pitch = Math.max(d + 6, 1.7 * d);
  return { ropes: ((n - 1) / 2) * pitch + d / 2, pulley: (n * pitch + 30) / 2 + 18 };
}
