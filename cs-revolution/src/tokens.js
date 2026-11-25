// Tolerance design tokens — shared by App.jsx and the lazily loaded AdminPanel.jsx.
export const C = "#00e5ff";       // cyan — reserved as the "active measurement" accent (<5% of any view)
export const CR = "0,229,255";
// ── Tolerance design tokens ──
export const BASE = "#0A0C0E";    // carbon-tinted near-black (never #000)
export const S1 = "#111417";      // surface 1 — layered depth, not flat
export const S2 = "#181C20";      // surface 2
export const INK = "#C9D1D6";     // primary text — off-white, never #FFF on dark
export const INK2 = "#7C868D";    // muted label/meta
export const WARN = "#FF6A3D";    // single warm "out-of-tolerance" signal, used rarely
export const LINE = "rgba(201,209,214,.08)"; // hairline furniture
export const EASE = "cubic-bezier(.22,1,.36,1)"; // one decisive ease-out, sitewide
// Space Grotesk / Space Mono have no Cyrillic: Onest and JetBrains Mono (close in
// shape, both with Cyrillic) sit right after them, so Bulgarian glyphs come from a
// matching face instead of the Arial/Courier metric fallbacks.
export const DISP = "'Space Grotesk','Onest','SG-fallback','Inter Tight',-apple-system,sans-serif"; // neo-grotesque display voice
export const MONO = "'Space Mono','JetBrains Mono','SM-fallback',ui-monospace,monospace"; // the instruments — dimensions, tolerances
