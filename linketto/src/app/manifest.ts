import type { MetadataRoute } from 'next';

// PWA: „Добави към началния екран“ — таблото се отваря като приложение
// (standalone, без адресна лента). Без service worker и без офлайн кеш —
// данните са живи; манифестът е само за инсталиране и иконата.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Linketto — link in bio',
    short_name: 'Linketto',
    description:
      'The multilingual link in bio: one page that speaks every visitor’s language. EU-hosted.',
    // Без езиков префикс — middleware избира езика (cookie → гео → браузър).
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1d3d5c',
    categories: ['productivity', 'social', 'business'],
    icons: [
      { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/app-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
