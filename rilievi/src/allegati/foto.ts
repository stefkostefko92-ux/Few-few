import sharp from 'sharp';
import type { Percorsi } from './archivio.js';
import type { FormatoFoto } from './formati.js';

/**
 * Снимката: изправена по EXIF, до 2560 px по дългата страна, JPEG (mozjpeg, качество 82) — от 3–8 MB
 * става 0,4–1 MB без видима загуба; в sRGB и без метаданни (EXIF с GPS, модел на телефона).
 * Прозрачното (PNG) — върху бяло. Миниатюрата — до 960 px: печатът и PDF-ът (две на ред на A4 — около
 * 290 dpi). Плочката на галерията — колкото покрива квадратчето 4:3 и на телефон с плътност 3 (по-малко
 * от половината байтове на миниатюрата).
 */

export const LATO_FOTO = 2560;
export const LATO_MINI = 960;
export const RIQUADRO = { width: 490, height: 368 } as const;

/** Къде отиват компресираният файл, миниатюрата и плочката (archivio.ts). */
export type Uscite = Pick<Percorsi, 'file' | 'mini' | 'riquadro'>;

/**
 * Таванът на пикселите срещу „бомби“ — фоновият процес има 1 GB (docker-compose.yml). Обикновеният JPEG
 * и WebP се декодират умалени (shrink-on-load): и 200 Mpx не пълнят паметта. Цели се декодират PNG (на
 * ивици — 60 Mpx са ~150 MB), прогресивният JPEG (~6 байта на пиксел: 208 Mpx бяха 1,3 GB) и AVIF (~19
 * байта на пиксел: 60 Mpx от файл от 1,7 KB бяха 1,1 GB) — одит, 4 ноември 2026, sharp 0.35. Снимка
 * от телефон е до ~50 Mpx, а по-голямата браузърът умалява до 2560 px преди качването (carica.js).
 */
export function limitePixel(formato: FormatoFoto | 'png-frame', progressivo: boolean): number {
  if (formato === 'jpeg') return progressivo ? 50_000_000 : 220_000_000;
  if (formato === 'webp') return 220_000_000;
  if (formato === 'avif') return 30_000_000;
  return 60_000_000;
}

/** Снимката е над тавана си — човекът вижда „troppo grande“, процесът остава жив. */
export class FotoTroppoGrande extends Error {
  constructor() {
    super('снимката е над тавана на пикселите');
  }
}

export interface EsitoFoto {
  byte: number;
  larghezza: number;
  altezza: number;
}

export async function comprimiFoto(
  sorgente: string,
  formato: FormatoFoto,
  uscite: Uscite,
): Promise<EsitoFoto> {
  const image = sharp(sorgente, {
    failOn: 'error',
    limitInputPixels: limitePixel(formato, false),
    animated: false,
  });
  // Сигнатурата и декодерът трябва да са съгласни — иначе файлът се представя за друг.
  const meta = await image.metadata();
  const decoded = meta.format === 'heif' ? 'avif' : meta.format;
  if (decoded !== formato) throw new Error(`снимката не е ${formato}, а ${String(meta.format)}`);
  // Само от главата на файла, преди декодирането: прогресивният JPEG — по своя таван.
  const pixel = (meta.width ?? 0) * (meta.height ?? 0);
  if (pixel > limitePixel(formato, meta.isProgressive === true)) throw new FotoTroppoGrande();
  const info = await image
    .rotate()
    .resize({ width: LATO_FOTO, height: LATO_FOTO, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(uscite.file);
  await miniature(uscite.file, uscite);
  return { byte: info.size, larghezza: info.width, altezza: info.height };
}

/** Миниатюрата и плочката — от готовата снимка или от кадър на клипа (PNG в паметта). */
export async function miniature(
  sorgente: string | Buffer,
  uscite: Pick<Uscite, 'mini' | 'riquadro'>,
): Promise<void> {
  const image = sharp(sorgente, {
    failOn: 'error',
    limitInputPixels: limitePixel('png-frame', false),
  })
    .rotate()
    .flatten({ background: '#ffffff' });
  await Promise.all([
    image
      .clone()
      .resize({ width: LATO_MINI, height: LATO_MINI, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 76, mozjpeg: true })
      .toFile(uscite.mini),
    // `outside`: и двете страни поне колкото квадратчето — портретът, пейзажът и клипът 16:9 го покриват.
    image
      .clone()
      .resize({ ...RIQUADRO, fit: 'outside', withoutEnlargement: true })
      .jpeg({ quality: 76, mozjpeg: true })
      .toFile(uscite.riquadro),
  ]);
}
