import 'server-only';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { imageQueueFull, mediaFileName, processImage, withUploadLock } from '@/lib/image-process';
import { mediaReferences } from '@/lib/media-refs';

// Качени изображения (фон/аватар): валидираме, преоразмеряваме и
// презаписваме в webp през sharp — това маха EXIF метаданните (GDPR)
// и неутрализира зловредни файлове. Пазим на диска в DATA_DIR/uploads.

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function uploadsDir(): string {
  return path.join(process.env.DATA_DIR ?? './data', 'uploads');
}

export async function saveUploadedImage(
  file: File,
  kind: 'bg' | 'avatar',
  ownerKey: string,
): Promise<string | null> {
  if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_UPLOAD_BYTES) {
    return null;
  }
  // Пълна опашка или друго качване на същия потребител в ход → отказ веднага, преди
  // тялото да се копира (Разбивача Н1). Размерите — от заглавката; ≤2 обработки наведнъж.
  if (imageQueueFull()) return null;
  const saved = await withUploadLock(ownerKey, async () => {
    const result = await processImage(Buffer.from(await file.arrayBuffer()), kind);
    if (!result.ok) return null; // твърде голямо, невалидно или заето
    const name = `${kind}-${randomBytes(12).toString('hex')}.webp`;
    await mkdir(uploadsDir(), { recursive: true });
    await writeFile(path.join(uploadsDir(), name), result.buffer);
    return `/media/${name}`;
  });
  return saved ?? null;
}

/**
 * Изтрива НАШ качен файл, който вече не се ползва (abuse-money-spec В2): иначе
 * всяка смяна на аватар/фон оставя стария публично достъпен завинаги (и диска
 * се пълни). Само имена от наш формат; само ако никой профил не го сочи.
 */
export async function removeUnusedMedia(url: string | null | undefined): Promise<void> {
  const name = mediaFileName(url);
  if (!name || (await mediaReferences(prisma, url)) !== 0) return;
  await unlink(path.join(uploadsDir(), name)).catch(() => undefined);
}
