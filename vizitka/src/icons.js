// Premium line иконки (24×24, stroke=currentColor → наследяват цвета на текста,
// затова се темизират автоматично). Инжектират се като `icon('name')` в изгледите
// (res.locals.icon). Стилът е единен: 1.75 stroke, заоблени краища.
const P =
  'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

const PATHS = {
  // Действия на визитката
  download: `<path ${P} d="M12 3v12"/><path ${P} d="m7 12 5 5 5-5"/><path ${P} d="M5 21h14"/>`,
  phone: `<path ${P} d="M4.5 5.5C4.5 4.7 5.2 4 6 4h2.2c.5 0 .9.3 1 .8l.8 3c.1.4 0 .8-.3 1l-1.4 1.3a12 12 0 0 0 5 5l1.3-1.4c.3-.3.6-.4 1-.3l3 .8c.5.1.8.5.8 1V18c0 .8-.7 1.5-1.5 1.5A14 14 0 0 1 4.5 5.5Z"/>`,
  printer: `<path ${P} d="M6 9V3h12v6"/><path ${P} d="M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1"/><rect ${P} x="7" y="14" width="10" height="7" rx="1"/>`,
  link: `<path ${P} d="M9 15 15 9"/><path ${P} d="M11 6.5 12.8 4.7a4 4 0 0 1 5.7 5.7L16.6 12"/><path ${P} d="M13 17.5l-1.8 1.8a4 4 0 0 1-5.7-5.7L7.4 12"/>`,
  mail: `<rect ${P} x="3" y="5" width="18" height="14" rx="2"/><path ${P} d="m3 7 9 6 9-6"/>`,
  globe: `<circle ${P} cx="12" cy="12" r="9"/><path ${P} d="M3 12h18"/><path ${P} d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z"/>`,
  pin: `<path ${P} d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle ${P} cx="12" cy="10" r="2.5"/>`,
  wallet: `<path ${P} d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2"/><rect ${P} x="3" y="7" width="18" height="12" rx="2"/><path ${P} d="M16 12h3"/>`,
  qr: `<rect ${P} x="3" y="3" width="7" height="7" rx="1"/><rect ${P} x="14" y="3" width="7" height="7" rx="1"/><rect ${P} x="3" y="14" width="7" height="7" rx="1"/><path ${P} d="M14 14h3v3"/><path ${P} d="M20 14v.01"/><path ${P} d="M17 20h.01"/><path ${P} d="M20 17v3"/>`,
  flag: `<path ${P} d="M5 21V4"/><path ${P} d="M5 4h11l-2 3 2 3H5"/>`,
  // Начална страница
  scan: `<path ${P} d="M4 8V6a2 2 0 0 1 2-2h2"/><path ${P} d="M16 4h2a2 2 0 0 1 2 2v2"/><path ${P} d="M20 16v2a2 2 0 0 1-2 2h-2"/><path ${P} d="M8 20H6a2 2 0 0 1-2-2v-2"/><path ${P} d="M4 12h16"/>`,
  refresh: `<path ${P} d="M20 11a8 8 0 0 0-14-4.5L4 8"/><path ${P} d="M4 4v4h4"/><path ${P} d="M4 13a8 8 0 0 0 14 4.5L20 16"/><path ${P} d="M20 20v-4h-4"/>`,
  user: `<circle ${P} cx="12" cy="8" r="3.5"/><path ${P} d="M5 20a7 7 0 0 1 14 0"/>`,
  building: `<rect ${P} x="5" y="3" width="14" height="18" rx="1.5"/><path ${P} d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>`,
  // Соц. мрежи
  facebook: `<path ${P} d="M14 8.5V7a1.5 1.5 0 0 1 1.5-1.5H17V3h-2A4 4 0 0 0 11 7v1.5H9V11h2v10h3V11h2l.5-2.5H14Z"/>`,
  instagram: `<rect ${P} x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle ${P} cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r="1.1" fill="currentColor"/>`,
  linkedin: `<rect ${P} x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path ${P} d="M8 10.5V17"/><path ${P} d="M8 7.5v.01"/><path ${P} d="M12 17v-3.5a2 2 0 0 1 4 0V17"/><path ${P} d="M12 13.5V10.5"/>`,
};

export function icon(name, { size = 20, cls = '' } = {}) {
  const body = PATHS[name];
  if (!body) return '';
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">${body}</svg>`;
}

export const ICON_NAMES = Object.keys(PATHS);
