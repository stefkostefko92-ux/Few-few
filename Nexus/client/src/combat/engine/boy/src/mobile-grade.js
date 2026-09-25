// Portrait/mobile readability: boy's night grade (dark fog, moody lighting, punchy vignette)
// was tuned for a fullscreen desktop demo. Embedded in a small portrait card (402x874, the
// game's real mobile width) it read as "too dark to see the fighters" (coordinator review).
// Boosts exposure/rim/hemi and eases the vignette purely as a function of live camera aspect —
// zero cost on desktop/landscape, no new state, no quality-tier coupling.
export function mobileGrade(aspect) {
  // Crossfade over a band (0.4..0.75), not a hard cutoff, so a resizing/rotating viewport
  // never pops the look mid-frame.
  const t = Math.min(1, Math.max(0, (0.75 - aspect) / 0.35));
  return {
    exposure: 1.15 + t * 0.3,
    vignette: 0.45 - t * 0.16,
    hemi: t * 0.28,
    rim: t * 0.4,
  };
}
