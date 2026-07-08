import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

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
): Promise<string | null> {
  if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_UPLOAD_BYTES) {
    return null;
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  let processed: Buffer;
  try {
    const pipeline = sharp(buffer, { failOn: 'error' }).rotate();
    processed =
      kind === 'bg'
        ? await pipeline
            .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer()
        : await pipeline
            .resize(512, 512, { fit: 'cover' })
            .webp({ quality: 85 })
            .toBuffer();
  } catch {
    return null; // не е валидно изображение
  }
  const name = `${kind}-${randomBytes(12).toString('hex')}.webp`;
  await mkdir(uploadsDir(), { recursive: true });
  await writeFile(path.join(uploadsDir(), name), processed);
  return `/media/${name}`;
}
