import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// i18n bootstrap — must run before App so the first render already sees
// the detected language. Side-effect import is intentional.
import './i18n';
// Self-hosted webfonts (no IP leak to fonts.gstatic.com pre-consent).
// Each @fontsource package bundles WOFF2 + a tiny @font-face rule that
// vite copies into /assets at build time.
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
// Cinzel няма кирилица — БГ заглавията падаха на Times New Roman. Cormorant SC (капители с
// кирилица) поема САМО кирилските знаци (unicode-range на подмножеството), Cinzel — латиницата.
import '@fontsource/cormorant-sc/cyrillic-500.css';
import '@fontsource/cormorant-sc/cyrillic-600.css';
import '@fontsource/cormorant-sc/cyrillic-700.css';
// Inter — основният шрифт на дизайн-системата „Dominion“ (с кирилица).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles/globals.css';
import './styles/animations.css';
import './styles/game-widgets.css';
import './styles/shell.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
