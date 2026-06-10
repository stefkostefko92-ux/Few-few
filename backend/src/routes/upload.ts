import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth';

// File su disco (volume Docker) invece di base64 nel database
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv', 'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Nome casuale: il nome originale resta solo nei metadati restituiti
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10).replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_MIME.has(file.mimetype)),
});

const router = Router();

// POST /api/upload — multipart "file"
router.post('/', authenticate, upload.single('file'), (req: any, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'File mancante o tipo non supportato (immagini, PDF, documenti Office, CSV, ZIP)' });
    return;
  }
  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    nome: req.file.originalname,
    size: req.file.size,
    tipo: req.file.mimetype,
  });
});

export default router;
