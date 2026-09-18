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
  bag: w(`<path d="M10 16h28l-2 26H12zM17 16v-3a7 7 0 0 1 14 0v3"/>`),
  tooth: w(`<path d="M16 6c-5 0-8 4-8 9 0 8 4 10 5 22 .3 3 3 4 4 1l3-9c1-3 3-3 4 0l3 9c1 3 3.7 2 4-1 1-12 5-14 5-22 0-5-3-9-8-9-3 0-4 2-6 2s-3-2-6-2z"/>`),
  fork: w(`<path d="M14 6v14a5 5 0 0 0 10 0V6M19 6v36M34 6c-4 3-6 8-6 14 0 4 2 6 6 6v16M34 6v20"/>`),
  key: w(`<path d="M8 40l4-4M12 36l4-4M16 32l4-4M20 28l4-4M31 24a9 9 0 1 0-6-6l-1 1"/><circle cx="33" cy="15" r="2"/>`),
  hardhat: w(`<path d="M6 34h36M9 34a15 15 0 0 1 30 0M20 12h8v8h-8zM24 12V8M14 34v4h20v-4"/>`),
  burger: w(`<path d="M8 20a16 12 0 0 1 32 0zM6 27h36M8 34h32a4 4 0 0 1-4 6H12a4 4 0 0 1-4-6z"/>`),
};
