import type { Translator } from '../i18n.js';

/**
 * Снимките на витрината — нашите 3D рендери (scripts/render, Mitsuba, черно-бели), кодирани в AVIF и
 * WebP за всяка ширина от `scripts/render/encode.mjs` в public/img/site. Ширините тук и там са едни и
 * същи: тестът проверява, че всеки файл, който страницата иска, съществува.
 */

export interface Immagine {
  /** Името на файла без ширината и разширението: `<file>-<ширина>.avif|webp`. */
  file: string;
  /** Размерът на оригинала — пропорцията за width/height на `<img>`. */
  width: number;
  height: number;
  widths: readonly number[];
  /** Описанието за екранния четец (ключ в речника). */
  alt: string;
}

export const IMMAGINI = {
  vano: {
    file: 'vano',
    width: 2400,
    height: 1350,
    widths: [640, 960, 1280, 1920, 2400],
    alt: 'site.photo.vano',
  },
  vanoVerticale: {
    file: 'vano-portrait',
    width: 1200,
    height: 1600,
    widths: [480, 800, 1200],
    alt: 'site.photo.vano',
  },
  bottoniera: {
    file: 'bottoniera',
    width: 1600,
    height: 1200,
    widths: [640, 960, 1280, 1600],
    alt: 'site.photo.bottoniera',
  },
  tablet: {
    file: 'tablet',
    width: 1600,
    height: 1200,
    widths: [640, 960, 1280, 1600],
    alt: 'site.photo.tablet',
  },
} as const satisfies Record<string, Immagine>;

export type Formato = 'avif' | 'webp';

const DIR = '/static/img/site';

export function percorsoImmagine(immagine: Immagine, width: number, formato: Formato): string {
  return `${DIR}/${immagine.file}-${width}.${formato}`;
}

/** `srcset` с всички ширини; `v` — версията на статиката (кешът е `immutable`). */
export function srcset(immagine: Immagine, formato: Formato, v: string): string {
  return immagine.widths
    .map((w) => `${percorsoImmagine(immagine, w, formato)}?v=${v} ${w}w`)
    .join(', ');
}

/** `src` на `<img>` за браузър без `srcset` — средната ширина, в WebP. */
export function srcPredefinito(immagine: Immagine, v: string): string {
  const width = immagine.widths[Math.floor(immagine.widths.length / 2)] ?? immagine.widths[0] ?? 0;
  return `${percorsoImmagine(immagine, width, 'webp')}?v=${v}`;
}

/** Каквото изгледът слага в `<picture>`: двата `srcset`, `src`, размерът и описанието. */
export interface FotoVista {
  avif: string;
  webp: string;
  src: string;
  width: number;
  height: number;
  alt: string;
}

export function fotoVista(immagine: Immagine, t: Translator, v: string): FotoVista {
  return {
    avif: srcset(immagine, 'avif', v),
    webp: srcset(immagine, 'webp', v),
    src: srcPredefinito(immagine, v),
    width: immagine.width,
    height: immagine.height,
    alt: t(immagine.alt),
  };
}
