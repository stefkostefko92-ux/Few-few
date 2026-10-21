import sharp from 'sharp';
import type { FormatoFoto } from './formati.js';

/**
 * Снимката: изправена по EXIF, до 2560 px по дългата страна, JPEG (mozjpeg, качество 82) — от 3–8 MB
 * става 0,4–1 MB без видима загуба; в sRGB и без метаданни (EXIF с GPS, модел на телефона). Прозрачното
 * (PNG) — върху бяло. Миниатюрата — до 960 px: галерията, кадърът на клипа, печатът и PDF-ът.
 */

export const LATO_FOTO = 2560;
export const LATO_MINI = 960;

/**
 * Таванът на пикселите срещу „бомби“: JPEG и WebP се декодират умалени (shrink-on-load), затова и
 * снимка от 200 Mpx не пълни паметта; PNG и AVIF се декодират цели — до 60 Mpx.
 */
function maxPixels(formato: FormatoFoto | 'png-frame'): number {
  return formato === 'jpeg' || formato === 'webp' ? 220_000_000 : 60_000_000;
}

export interface EsitoFoto {
  byte: number;
  larghezza: number;
  altezza: number;
}

export async function comprimiFoto(
  sorgente: string,
  formato: FormatoFoto,
  file: string,
  mini: string,
): Promise<EsitoFoto> {
  const image = sharp(sorgente, {
    failOn: 'error',
    limitInputPixels: maxPixels(formato),
    animated: false,
  });
  // Сигнатурата и декодерът трябва да са съгласни — иначе файлът се представя за друг.
  const meta = await image.metadata();
  const decoded = meta.format === 'heif' ? 'avif' : meta.format;
  if (decoded !== formato) throw new Error(`снимката не е ${formato}, а ${String(meta.format)}`);
  const info = await image
    .rotate()
    .resize({ width: LATO_FOTO, height: LATO_FOTO, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(file);
  await miniatura(file, mini);
  return { byte: info.size, larghezza: info.width, altezza: info.height };
}

/** Миниатюрата от готовата снимка или от кадър на клипа (PNG в паметта). */
export async function miniatura(sorgente: string | Buffer, mini: string): Promise<void> {
  await sharp(sorgente, { failOn: 'error', limitInputPixels: maxPixels('png-frame') })
    .rotate()
    .resize({ width: LATO_MINI, height: LATO_MINI, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 76, mozjpeg: true })
    .toFile(mini);
}
