// icons.mjs — по една линейна SVG икона за всяка индустрия (картите в хъба). currentColor, без филтри.
const w = (paths) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const DEMO_ICONS = {
  wrench: w(`<path d="M30 6a9 9 0 0 0-8.5 12L8 31.5a3.5 3.5 0 0 0 5 5L26.5 23A9 9 0 0 0 39 14.5l-5 5-5-1-1-5 5-5A9 9 0 0 0 30 6z"/>`),
  dumbbell: w(`<path d="M6 20v8M12 16v16M36 16v16M42 20v8M12 24h24"/>`),
  chair: w(`<path d="M14 6h20v18H14zM12 24h24l2 18M12 24l-2 18M16 30h16"/>`),
  scales: w(`<path d="M24 6v36M10 42h28M24 12h14M24 12H10M10 12l-6 14a6 6 0 0 0 12 0zM38 12l-6 14a6 6 0 0 0 12 0z"/>`),
  scissors: w(`<circle cx="12" cy="14" r="5"/><circle cx="12" cy="34" r="5"/><path d="M16 17 40 40M16 31 40 8"/>`),
  bell: w(`<path d="M8 34h32M12 34a12 12 0 0 1 24 0M24 22v-4M20 42h8M6 40h36"/>`),
  calc: w(`<rect x="10" y="4" width="28" height="40" rx="3"/><path d="M16 12h16M16 22h4M24 22h4M32 22h0M16 30h4M24 30h4M32 30v8M16 38h12"/>`),
  car: w(`<path d="M6 30l4-12a4 4 0 0 1 4-3h20a4 4 0 0 1 4 3l4 12v8H6zM6 30h36M10 22h28"/><circle cx="14" cy="36" r="3"/><circle cx="34" cy="36" r="3"/>`),
  hanger: w(`<path d="M24 12a4 4 0 1 1 4-4M24 12v6L6 32a3 3 0 0 0 2 5h32a3 3 0 0 0 2-5L24 18"/>`),
  burger: w(`<path d="M8 20a16 12 0 0 1 32 0zM6 27h36M8 34h32a4 4 0 0 1-4 6H12a4 4 0 0 1-4-6z"/>`),
};
