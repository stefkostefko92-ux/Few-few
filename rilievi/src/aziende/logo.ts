import sharp from 'sharp';

/**
 * Логото на фирмата. Качването се прекодира винаги, никога не се пази както е дошло:
 *  - входът е само PNG, JPEG или WebP по САМИТЕ БАЙТОВЕ (Content-Type от браузъра не доказва нищо;
 *    SVG не се приема изобщо — носи скриптове, а pdfkit не го чете);
 *  - изходът е до 1200×600 px, без метаданни (EXIF с GPS, коментари), PNG при прозрачност или PNG вход,
 *    иначе JPEG;
 *  - прекодирането пази и PDF-а: pdfkit декодира PNG с прозрачност асинхронно и при повреден файл
 *    хвърля грешка извън всеки try/catch (процесът пада). Изходът от sharp е винаги валиден.
 */

export const LOGO_MAX_BYTES = 1024 * 1024;
/**
 * Над 16 Mpx (4000×4000) не е лого, а „бомба“ за паметта (1 MB PNG може да носи огромно изображение) —
 * sharp отказва още при четенето. Контейнерът има 512 MB.
 */
const MAX_INPUT_PIXELS = 16_000_000;
const OUT_BOX = { width: 1200, height: 600 };

// Логото се качва рядко: кешът на libvips само би държал памет.
sharp.cache(false);
export type LogoKind = 'png' | 'jpeg' | 'webp';
export type LogoType = 'image/png' | 'image/jpeg';
export type LogoError = 'type' | 'corrupt';

export interface Logo {
  data: Buffer;
  type: LogoType;
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Форматът по сигнатурата (magic bytes) или null, ако не е позволен. */
export function sniffLogo(buf: Uint8Array): LogoKind | null {
  if (buf.length < 12) return null;
  if (PNG_SIGNATURE.every((byte, i) => buf[i] === byte)) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  const ascii = (from: number, to: number): string =>
    String.fromCharCode(...buf.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

export async function normalizeLogo(
  input: Buffer,
): Promise<{ ok: true; logo: Logo } | { ok: false; error: LogoError }> {
  const kind = sniffLogo(input);
  if (!kind) return { ok: false, error: 'type' };
  try {
    const image = sharp(input, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: false,
    });
    const meta = await image.metadata();
    // Сигнатурата и декодерът трябва да са съгласни — иначе файлът се представя за друг.
    if (meta.format !== kind) return { ok: false, error: 'type' };
    const asPng = kind === 'png' || meta.hasAlpha === true;
    const pipeline = image.rotate().resize({ ...OUT_BOX, fit: 'inside', withoutEnlargement: true });
    const { data, info } = asPng
      ? await pipeline
          .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
          .toBuffer({ resolveWithObject: true })
      : await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    return {
      ok: true,
      logo: {
        data,
        type: asPng ? 'image/png' : 'image/jpeg',
        width: info.width,
        height: info.height,
      },
    };
  } catch {
    return { ok: false, error: 'corrupt' };
  }
}

export function isLogoType(value: unknown): value is LogoType {
  return value === 'image/png' || value === 'image/jpeg';
}
