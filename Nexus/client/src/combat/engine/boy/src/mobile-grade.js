// Readability grade: boy's night grade (dark fog, moody lighting, punchy vignette) was tuned
// for a fullscreen desktop demo shot with a real cinematographer's eye on a big monitor.
// Embedded in a small card — mobile portrait (402x874) OR desktop (~900x620, the size a real
// Nexus page gives the stage) — it read as "too dark, fighters are small silhouettes"
// (coordinator review, TWICE — first for portrait only, then for landscape/desktop too).
// Boosts exposure/rim/hemi and eases the vignette for EVERY aspect, with an extra lift for
// portrait specifically (smaller physical screen, worse ambient contrast) — zero new state, no
// quality-tier coupling, crossfades smoothly so a resize/rotate never pops the look mid-frame.
export function mobileGrade(aspect) {
  const portrait = Math.min(1, Math.max(0, (0.75 - aspect) / 0.35));
  return {
    exposure: 1.15 + 0.3 + portrait * 0.2,
    vignette: 0.45 - 0.07 - portrait * 0.15,
    hemi: 0.14 + portrait * 0.26,
    rim: 0.22 + portrait * 0.36,
    key: 1.1 + portrait * 0.35,
  };
}
