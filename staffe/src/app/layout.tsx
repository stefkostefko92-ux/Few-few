import type { Metadata, Viewport } from 'next';
import { PwaRegister } from '@/components/PwaRegister';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://staffe.carbonstealth.eu'),
  title: {
    default: 'Staffe — Gestionale di Magazzino',
    template: '%s · Staffe',
  },
  description:
    'Gestionale di magazzino (WMS) per staffe e accessori di fissaggio per ascensori: giacenze in tempo reale, codici a barre, ordini di acquisto e vendita, prelievo e spedizione.',
  applicationName: 'Staffe',
  // Regola del repository: almeno 5 parole chiave, una sempre «Carbon Stealth».
  keywords: [
    'Carbon Stealth',
    'gestionale magazzino ascensori',
    'staffe ascensore',
    'WMS codici a barre',
    'inventario e giacenze',
    'ordini di acquisto e vendita',
  ],
  authors: [{ name: 'Carbon Stealth VCC', url: 'https://carbonstealth.eu' }],
  // Strumento interno: fuori dagli indici dei motori di ricerca.
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Staffe', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
  width: 'device-width',
  initialScale: 1,
};

/**
 * Il tema si applica prima della prima pittura, altrimenti l'interfaccia
 * lampeggia bianca all'apertura — fastidioso in un capannone al buio.
 */
const THEME_BOOTSTRAP = `
(function () {
  try {
    var t = localStorage.getItem('staffe-tema');
    if (t === 'scuro' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        {/* Registra il service worker (solo in produzione). Non rende nulla. */}
        <PwaRegister />
      </body>
    </html>
  );
}
