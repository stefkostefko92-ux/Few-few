import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { HttpError } from '../auth/guards.js';
import { safeEqual } from '../crypto.js';
import { LOGO_MAX_BYTES } from '../documents/logo.js';

/**
 * Качването на файлове (multipart, в паметта): логото (до 1 MB), входяща е-фактура и банково извлечение
 * (до 2 MB). csrf() пуска multipart само към разрешените
 * адреси и без да вижда тялото — тук, след разчитането, се проверява токенът (полето `_csrf` е първо във
 * формата). Грешка на качването (твърде голям или повреден файл) е грешка на формата, не 500.
 */
export type UploadStatus = 'ok' | 'tooLarge' | 'bad';
const statuses = new WeakMap<Request, UploadStatus>();

function upload(field: string, maxBytes: number) {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5, fieldSize: 4096, parts: 6 },
  }).single(field);
  return (req: Request, res: Response, next: NextFunction): void => {
    parse(req, res, (error: unknown) => {
      const body: unknown = req.body;
      const token =
        typeof body === 'object' &&
        body !== null &&
        '_csrf' in body &&
        typeof body._csrf === 'string'
          ? body._csrf
          : '';
      if (!req.principal || !safeEqual(token, req.principal.csrfToken)) {
        return next(new HttpError(403, 'CSRF'));
      }
      statuses.set(
        req,
        !error
          ? 'ok'
          : error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
            ? 'tooLarge'
            : 'bad',
      );
      next();
    });
  };
}

export function logoUpload() {
  return upload('logo', LOGO_MAX_BYTES);
}

/** Входяща е-фактура или банково извлечение (SPEC 54–55): един файл до 2 MB, полето `file`. */
export const DOCUMENT_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export function documentUpload() {
  return upload('file', DOCUMENT_UPLOAD_MAX_BYTES);
}

export function uploadStatus(req: Request): UploadStatus {
  return statuses.get(req) ?? 'bad';
}
