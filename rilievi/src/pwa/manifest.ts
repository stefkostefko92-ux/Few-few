import type { Translator } from '../i18n.js';

/**
 * Приложението на началния екран (собственикът, 4 ноември 2026 — „add to home screen for PC, iOS and
 * Android … raggiungibile facilmente e a schermo intero“): манифестът му. `fullscreen` — на Android целият
 * екран, без лентите на системата; Chrome и Edge на компютър и Safari на iPhone/iPad нямат този режим и
 * отварят приложението в негов прозорец без лентите на браузъра (`standalone`, crbug 40650429). Стартира
 * в картите (без сесия — входът); обхватът е целият сайт, за да остават в приложението и витрината, и
 * PDF-ите. Чертае се при всяка заявка — иконите носят версията на статиката (`?v=`).
 */

export const START_URL = '/schede';

/** Иконите: марката върху черно (`npm run brand:logo`) — цяла (`any`) и в кръга на Android (`maskable`). */
export const ICONE = [
  { file: 'icon-192', size: 192, purpose: 'any' },
  { file: 'icon-512', size: 512, purpose: 'any' },
  { file: 'icon-maskable-192', size: 192, purpose: 'maskable' },
  { file: 'icon-maskable-512', size: 512, purpose: 'maskable' },
] as const;

/** Задържане върху иконата: най-честите места (който няма право, вижда страницата за отказ). */
const SCORCIATOIE = [
  { key: 'schede.new', url: '/schede/nuova' },
  { key: 'nav.schede', url: '/schede' },
  { key: 'nav.interventi', url: '/interventi' },
  { key: 'nav.calcoloArgano', url: '/calcolo-argano' },
] as const;

export interface ManifestIcona {
  src: string;
  sizes: string;
  type: 'image/png';
  purpose: 'any' | 'maskable';
}

export function manifestDi(t: Translator, versione: string) {
  const icona = ({ file, size, purpose }: (typeof ICONE)[number]): ManifestIcona => ({
    src: `/static/img/${file}.png?v=${versione}`,
    sizes: `${size}x${size}`,
    type: 'image/png',
    purpose,
  });
  return {
    id: '/',
    name: 'Rilievi Impianti',
    short_name: 'Rilievi',
    description: t('meta.description'),
    lang: 'it',
    dir: 'ltr',
    start_url: START_URL,
    scope: '/',
    display: 'fullscreen',
    orientation: 'any',
    background_color: '#000000',
    theme_color: '#000000',
    categories: ['business', 'productivity', 'utilities'],
    prefer_related_applications: false,
    icons: ICONE.map(icona),
    shortcuts: SCORCIATOIE.map(({ key, url }) => ({
      name: t(key),
      url,
      icons: [icona(ICONE[0])],
    })),
  };
}
