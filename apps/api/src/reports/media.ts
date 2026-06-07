import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import multer from 'multer';

import { env } from '../env.js';

const INCOMING_DIR = path.join(env.MEDIA_DIR, 'incoming');

/**
 * Разширение според валидирания MIME тип (сървърно контролирано). Никога не
 * ползваме разширението от името на качения файл — иначе качен `evil.html`
 * (с image MIME) би се сервирал като text/html и би изпълнил скрипт в админ
 * панела (stored XSS). Непознат тип → разширение, което не се рендира.
 */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/3gpp': '.3gp',
};

function extFromMime(mimetype: string): string {
  return MIME_EXT[mimetype] ?? '.bin';
}

/** Уверява се, че временната папка за качване съществува. */
export async function ensureMediaDirs(): Promise<void> {
  await mkdir(INCOMING_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, INCOMING_DIR);
  },
  filename: (_req, _file, cb) => {
    // Без разширение от клиента — временно име, преименува се при финализиране.
    cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}`);
  },
});

export const uploadMedia = multer({
  storage,
  limits: {
    fileSize: env.mediaMaxBytes,
    files: 3,
  },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    cb(null, ok);
  },
});

export type StoredMedia = {
  kind: 'IMAGE' | 'VIDEO';
  path: string;
  bytes: number;
};

/**
 * Премества качените временни файлове в постоянната папка на сигнала и връща
 * метаданните за запис в базата.
 */
export async function finalizeMedia(
  reportId: string,
  files: Express.Multer.File[],
): Promise<StoredMedia[]> {
  const targetDir = path.join(env.MEDIA_DIR, reportId);
  await mkdir(targetDir, { recursive: true });

  const stored: StoredMedia[] = [];
  for (const [index, file] of files.entries()) {
    const ext = extFromMime(file.mimetype);
    const finalPath = path.join(targetDir, `${index}${ext}`);
    await rename(file.path, finalPath);
    const info = await stat(finalPath);
    stored.push({
      kind: file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE',
      path: finalPath,
      bytes: info.size,
    });
  }
  return stored;
}

/** Изтрива временните файлове при отказана валидация. */
export async function cleanupTempFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(
    files.map((f) =>
      existsSync(f.path) ? rm(f.path, { force: true }) : Promise.resolve(),
    ),
  );
}
