/** Card widths per size (px) — PlayingCard's SIZES. */
export const CARD_W = { sm: 60, md: 88, lg: 120 } as const;

/** Stage (2×16px) + table rail (2×20px) padding around the felt on a phone. */
const FELT_INSET = 72;

/**
 * Target hand width for a viewport: ~82% of the screen, at most 600px. On a
 * phone it is capped by the FELT, not a fixed floor — the old 320px floor was
 * wider than the felt of a 390px phone (318px) and of a 360px one (288px), so
 * the outer cards hung over the rail and were clipped.
 */
export function handTargetFor(viewportWidth: number): number {
  const feltBound = viewportWidth - FELT_INSET - 8;
  return Math.round(Math.min(600, Math.max(240, Math.min(viewportWidth * 0.82, feltBound))));
}

/** Target hand width for the current window. */
export function handTarget(): number {
  return handTargetFor(typeof window === "undefined" ? 1024 : window.innerWidth);
}

/** Overlap (px) so a hand of `count` cards fits ~`target`px wide — more overlap
 *  for bigger hands (e.g. Bridge/Kent's 13) so they never clip on mobile. */
export function fitOverlap(
  count: number,
  size: "sm" | "md" | "lg" = "md",
  target = handTarget(),
): number {
  if (count <= 1) return 0;
  const W = CARD_W[size];
  const step = (target - W) / (count - 1);
  const min = size === "sm" ? 16 : 22;
  return Math.min(W - 16, Math.max(min, W - step));
}

/** Rendered width of a fanned hand with that overlap. */
export function handWidth(count: number, size: "sm" | "md" | "lg", target: number): number {
  return count <= 0
    ? 0
    : CARD_W[size] + (count - 1) * (CARD_W[size] - fitOverlap(count, size, target));
}
