import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { HttpError } from '../auth/guards.js';
import { safeEqual } from '../crypto.js';
import { LOGO_MAX_BYTES } from '../documents/logo.js';

/**
 * Качването на логото (multipart, в паметта, до 1 MB). csrf() пуска multipart само към разрешените
 * адреси и без да вижда тялото — тук, след разчитането, се проверява токенът (полето `_csrf` е първо във
 * формата). Грешка на качването (твърде голям или повреден файл) е грешка на формата, не 500.
 */
export type UploadStatus = 'ok' | 'tooLarge' | 'bad';
const statuses = new WeakMap<Request, UploadStatus>();

const parse = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES, files: 1, fields: 5, fieldSize: 4096, parts: 6 },
}).single('logo');

export function logoUpload() {
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

export function uploadStatus(req: Request): UploadStatus {
  return statuses.get(req) ?? 'bad';
}
