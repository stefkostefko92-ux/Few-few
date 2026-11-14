import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { uploadsDir } from '@/lib/media';

// Помощници за OG картинките (next/og → satori). Вграденият шрифт на
// satori е само латиница — за кирилица/гръцки зареждаме Inter (OFL 1.1,
// src/assets/og/) от диска; кешира се в паметта на процеса.

type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600;
  style: 'normal';
};

let fontsCache: Promise<OgFont[]> | null = null;

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

export function ogFonts(): Promise<OgFont[]> {
  if (!fontsCache) {
    const dir = path.join(process.cwd(), 'src', 'assets', 'og');
    fontsCache = Promise.all([
      readFile(path.join(dir, 'inter-400.woff')),
      readFile(path.join(dir, 'inter-600.woff')),
    ])
      .then(([regular, bold]) => [
        { name: 'Inter', data: toArrayBuffer(regular), weight: 400, style: 'normal' } as const,
        { name: 'Inter', data: toArrayBuffer(bold), weight: 600, style: 'normal' } as const,
      ])
      .catch((error: unknown) => {
        fontsCache = null; // следващата заявка опитва пак
        throw error;
      });
  }
  return fontsCache;
}

const MEDIA_RE = /^\/media\/([a-z0-9-]+\.webp)$/;

/**
 * Каченият аватар като PNG data URL (satori не чете webp). Външни https
 * аватари НЕ се теглят — без SSRF и без чужда латентност; там е монограм.
 */
export async function avatarDataUrl(
  avatarUrl: string | undefined,
): Promise<string | null> {
  const match = avatarUrl ? MEDIA_RE.exec(avatarUrl) : null;
  if (!match) return null;
  try {
    const png = await sharp(path.join(uploadsDir(), match[1]))
      .resize(320, 320, { fit: 'cover' })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}
