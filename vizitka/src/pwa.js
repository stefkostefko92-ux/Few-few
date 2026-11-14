// Инсталируемо приложение (PWA) — Vizitka на началния екран на телефона и на компютъра.
// Същият модел като rilievi/src/pwa: манифест, service worker в корена (public/sw.js, сервиран
// като /sw.js, за да обхваща целия сайт) и страница „Инсталирай приложението“ (/app) с бутона на
// браузъра и стъпките за всяко устройство. Нищо за инсталиране от магазин: това е самият сайт.

export const START_URL = '/dashboard';
export const THEME_COLOR = '#2563eb';

// Иконите (public/icons): цяла (`any`) и за кръга/капката на Android (`maskable` — знакът е в
// безопасната зона от 80 %).
export const ICONS = [
  { file: 'icon-192', size: 192, purpose: 'any' },
  { file: 'icon-512', size: 512, purpose: 'any' },
  { file: 'icon-maskable-192', size: 192, purpose: 'maskable' },
  { file: 'icon-maskable-512', size: 512, purpose: 'maskable' },
];

// Задържане върху иконата: най-честите места.
const SHORTCUTS = [
  { name: 'Моята визитка', url: '/dashboard' },
  { name: 'Настройки на акаунта', url: '/settings' },
];

export function manifest(ver) {
  const icon = ({ file, size, purpose }) => ({
    src: `/icons/${file}.png?v=${ver}`,
    sizes: `${size}x${size}`,
    type: 'image/png',
    purpose,
  });
  return {
    id: '/',
    name: 'Vizitka — дигитална визитка',
    short_name: 'Vizitka',
    description:
      'Винаги актуалната ти визитка с постоянен QR код — редактираш я от телефона, контактите се запазват с едно докосване.',
    lang: 'bg',
    dir: 'ltr',
    start_url: START_URL,
    scope: '/',
    // standalone: собствен прозорец без лентите на браузъра — режимът, който Chrome, Edge и
    // Safari поддържат навсякъде (fullscreen скрива и часовника на телефона — не е за визитка).
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'any',
    background_color: '#f8fafc',
    theme_color: THEME_COLOR,
    categories: ['business', 'productivity', 'utilities'],
    prefer_related_applications: false,
    icons: ICONS.map(icon),
    shortcuts: SHORTCUTS.map(({ name, url }) => ({ name, url, icons: [icon(ICONS[0])] })),
  };
}

/**
 * Устройството по User-Agent — стъпките му идват отворени още от сървъра (без пренареждане след
 * зареждането). Същото правило като в public/app.js; iPad с User-Agent на компютър се познава само
 * по докосването — тогава браузърът поправя. Непознатото е null: отворени са всички стъпки.
 */
export function deviceOf(ua) {
  if (!ua) return null;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Macintosh/.test(ua))
    return /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|Firefox\//.test(ua) ? 'mac' : 'pc';
  if (/Windows|X11|Linux|CrOS/.test(ua)) return 'pc';
  return null;
}

// Samsung Internet: инсталираното оттам приложение Android го бележи като „несигурно“
// (наблюдавано при rilievi) — там пращаме към Chrome вместо бутон.
export const isSamsungInternet = (ua) => Boolean(ua && /SamsungBrowser\//.test(ua));

// Същата страница, отворена в Chrome от друг браузър на Android (intent; без Chrome — Google Play).
export function openInChrome(base, path) {
  const url = new URL(path, `${base}/`);
  const scheme = url.protocol.replace(/:$/, '');
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;end`;
}
