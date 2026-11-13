/**
 * Иконите на менютата: вградени SVG (24×24, контур `currentColor`) — без CDN, без шрифт за икони, без
 * картинки за зареждане. Рисунките са наши; цветът идва от текста около тях. Иконата е само украса
 * (`aria-hidden`) — името на връзката е текстът до нея.
 */
const USERS =
  '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.2c2.4.3 4 2.4 4 5.8"/>';
const FILE = '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>';
const CARD = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>';
const BUILDING =
  '<path d="M5 21V4h9v17"/><path d="M14 9h5v12"/><path d="M3 21h18"/><path d="M8.5 8h2M8.5 12h2M8.5 16h2"/>';
const SERVER =
  '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>';
const SHIELD = '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/>';

const PATHS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  overview:
    '<rect x="3" y="3" width="7.5" height="9" rx="1.2"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.2"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.2"/><rect x="3" y="15" width="7.5" height="6" rx="1.2"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  incoming: '<path d="M12 3v11M7.5 10L12 14.5 16.5 10"/><path d="M4 15v4h16v-4"/>',
  proforma: FILE,
  parties: BUILDING,
  items: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
  series: '<path d="M9 3L7 21M17 3l-2 18M4 8.5h17M3 15.5h17"/>',
  bank: '<path d="M3 9.5L12 4l9 5.5"/><path d="M5 10v8M9.7 10v8M14.3 10v8M19 10v8"/><path d="M3 21h18"/>',
  plan: CARD,
  recurring:
    '<path d="M20 11a8 8 0 00-14.5-3.5L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0014.5 3.5L20 15"/><path d="M20 20v-5h-5"/>',
  api: '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 5l-3 14"/>',
  export: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  members: USERS,
  mandates:
    '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 16c1.5-3 2.5-3 3 0 .5 2 1.5 1 3-1"/>',
  settings:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  features: '<rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="8" cy="12" r="1.8"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  chain:
    '<path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  building: BUILDING,
  shield: SHIELD,
  shieldCheck: `${SHIELD}<path d="M8.5 12l2.5 2.5 4.5-5"/>`,
  install:
    '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M12 8v6M9.5 11.5L12 14l2.5-2.5"/>',
  logout: '<path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
  accounts: USERS,
  documents: FILE,
  billing: CARD,
  platform: SERVER,
} as const;

export type IconName = keyof typeof PATHS;

/** Готовият SVG за `<%- icon('inbox') %>` — името е наша константа, никога вход на потребител. */
export function icon(name: IconName): string {
  const body = PATHS[name];
  return `<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
