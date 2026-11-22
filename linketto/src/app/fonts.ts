// Професионални шрифтове (self-hosted през next/font — нула външни
// заявки в рънтайм, GDPR-чисто). UI-ят ползва Manrope; профилите
// избират измежду четири визуално различни гласа.
import {
  Manrope,
  Inter,
  Playfair_Display,
  JetBrains_Mono,
  Comfortaa,
} from 'next/font/google';

export const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-ui',
  display: 'swap',
});

export const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-profile-sans',
  display: 'swap',
  // Само за профилите и само избраният — без preload на всяка страница (шрифтът се
  // зарежда, когато се ползва; визуалният обход: 8 ненужни preload-а на страница).
  preload: false,
});

export const playfair = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-profile-serif',
  display: 'swap',
  // Само за профилите и само избраният — без preload на всяка страница (шрифтът се
  // зарежда, когато се ползва; визуалният обход: 8 ненужни preload-а на страница).
  preload: false,
});

export const jetbrains = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-profile-mono',
  display: 'swap',
  // Само за профилите и само избраният — без preload на всяка страница (шрифтът се
  // зарежда, когато се ползва; визуалният обход: 8 ненужни preload-а на страница).
  preload: false,
});

export const comfortaa = Comfortaa({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-profile-rounded',
  display: 'swap',
  // Само за профилите и само избраният — без preload на всяка страница (шрифтът се
  // зарежда, когато се ползва; визуалният обход: 8 ненужни preload-а на страница).
  preload: false,
});

export const fontVariables = [
  manrope.variable,
  inter.variable,
  playfair.variable,
  jetbrains.variable,
  comfortaa.variable,
].join(' ');
