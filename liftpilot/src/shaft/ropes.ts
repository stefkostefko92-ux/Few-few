// The ropes side by side over a wheel: how wide they lie, and a pulley with its cheeks round them. Pure.

/** The grooves' pitch for ropes of diameter d — on the sheave, on the pulleys, through the slab [mm]. */
export const groovePitch = (d: number): number => Math.max(d + 6, 1.7 * d);

/** Half the width of the n ropes side by side, and of a pulley with its cheeks [mm]. */
export function ropeWidths(n: number, d: number): { ropes: number; pulley: number } {
  const pitch = groovePitch(d);
  return { ropes: ((n - 1) / 2) * pitch + d / 2, pulley: (n * pitch + 30) / 2 + 18 };
}
