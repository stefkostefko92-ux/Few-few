// Админ панел — управление на рекламните банери.
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { join } from 'node:path';
import db, { UPLOADS_DIR } from '../db.js';
import { requireAdmin } from '../auth.js';
import { csrfProtect } from '../csrf.js';
import { allBanners, getBanner } from '../banners.js';

const router = Router();

const BANNER_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, Boolean(BANNER_EXT[file.mimetype])),
});

function deleteImage(filename) {
  if (!filename) return;
  const path = join(UPLOADS_DIR, filename);
  if (fs.existsSync(path)) fs.unlinkSync(path);
}

function saveImage(file) {
  const filename = `${crypto.randomBytes(16).toString('hex')}.${BANNER_EXT[file.mimetype]}`;
  fs.writeFileSync(join(UPLOADS_DIR, filename), file.buffer);
  return filename;
}

const PLACEMENTS = new Set(['home']);
const normPlacement = (p) => (PLACEMENTS.has(p) ? p : 'home');

router.get('/admin', requireAdmin, (req, res) => {
  res.render('admin', {
    title: 'Админ · Реклами',
    banners: allBanners(),
    saved: req.query.saved === '1',
    error: null,
  });
});

// Създаване на нов банер.
router.post('/admin/banners', requireAdmin, upload.single('image'), csrfProtect, (req, res) => {
  const title = String(req.body.title || '')
    .trim()
    .slice(0, 120);
  const alt = String(req.body.alt || '')
    .trim()
    .slice(0, 200);
  const linkUrl = String(req.body.link_url || '')
    .trim()
    .slice(0, 500);

  const fail = (error) =>
    res.status(400).render('admin', {
      title: 'Админ · Реклами',
      banners: allBanners(),
      saved: false,
      error,
    });

  if (title.length < 2) return fail('Въведи име на банера (поне 2 знака).');
  if (linkUrl && !/^https?:\/\//i.test(linkUrl))
    return fail('Линкът трябва да започва с http:// или https://.');
  if (!req.file) return fail('Качи картинка (JPG, PNG, WebP или GIF, до 3 MB).');

  const image = saveImage(req.file);
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM banners').get().m;
  db.prepare(
    `INSERT INTO banners (title, image, alt, link_url, placement, is_active, sort_order)
     VALUES (?, ?, ?, ?, 'home', 1, ?)`
  ).run(title, image, alt, linkUrl, maxOrder + 1);
  res.redirect('/admin?saved=1');
});

// Редакция на съществуващ банер (картинката е по избор).
router.post('/admin/banners/:id', requireAdmin, upload.single('image'), csrfProtect, (req, res) => {
  const banner = getBanner(Number(req.params.id));
  if (!banner) return res.status(404).render('404', { title: 'Няма такъв банер' });

  const title =
    String(req.body.title || '')
      .trim()
      .slice(0, 120) || banner.title;
  const alt = String(req.body.alt || '')
    .trim()
    .slice(0, 200);
  const linkUrl = String(req.body.link_url || '')
    .trim()
    .slice(0, 500);
  const isActive = req.body.is_active === '1' ? 1 : 0;

  if (linkUrl && !/^https?:\/\//i.test(linkUrl)) {
    return res.status(400).render('admin', {
      title: 'Админ · Реклами',
      banners: allBanners(),
      saved: false,
      error: 'Линкът трябва да започва с http:// или https://.',
    });
  }

  let image = banner.image;
  if (req.file) {
    image = saveImage(req.file);
    deleteImage(banner.image);
  }
  db.prepare(
    `UPDATE banners SET title = ?, image = ?, alt = ?, link_url = ?, placement = ?, is_active = ?
     WHERE id = ?`
  ).run(title, image, alt, linkUrl, normPlacement(req.body.placement), isActive, banner.id);
  res.redirect('/admin?saved=1');
});

// Включване/изключване с един бутон.
router.post('/admin/banners/:id/toggle', requireAdmin, csrfProtect, (req, res) => {
  db.prepare('UPDATE banners SET is_active = 1 - is_active WHERE id = ?').run(
    Number(req.params.id)
  );
  res.redirect('/admin?saved=1');
});

// Преместване нагоре/надолу в подредбата (размяна на sort_order със съседа).
router.post('/admin/banners/:id/move', requireAdmin, csrfProtect, (req, res) => {
  const banner = getBanner(Number(req.params.id));
  if (!banner) return res.redirect('/admin');
  const dir = req.body.dir === 'up' ? 'up' : 'down';
  const neighbor = db
    .prepare(
      dir === 'up'
        ? 'SELECT * FROM banners WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1'
        : 'SELECT * FROM banners WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1'
    )
    .get(banner.sort_order);
  if (neighbor) {
    const swap = db.prepare('UPDATE banners SET sort_order = ? WHERE id = ?');
    const tx = db.transaction(() => {
      swap.run(neighbor.sort_order, banner.id);
      swap.run(banner.sort_order, neighbor.id);
    });
    tx();
  }
  res.redirect('/admin?saved=1');
});

router.post('/admin/banners/:id/delete', requireAdmin, csrfProtect, (req, res) => {
  const banner = getBanner(Number(req.params.id));
  if (banner) {
    deleteImage(banner.image);
    db.prepare('DELETE FROM banners WHERE id = ?').run(banner.id);
  }
  res.redirect('/admin?saved=1');
});

export default router;
