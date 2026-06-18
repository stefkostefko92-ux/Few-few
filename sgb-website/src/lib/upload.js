import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { slugify } from './helpers.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.paths.uploads),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = slugify(path.basename(file.originalname, ext)).slice(0, 40) || 'file';
    const rand = crypto.randomBytes(4).toString('hex');
    cb(null, `${Date.now()}-${rand}-${base}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const allowed = [...config.upload.imageTypes, ...config.upload.docTypes];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Неподдържан тип файл: ' + file.mimetype));
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxFileSize },
});

export const uploadedPath = (file) => (file ? '/uploads/' + file.filename : null);
