// Админ панел — управление на визитките (всички профили) и рекламните банери.
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { join } from 'node:path';
import db, { UPLOADS_DIR } from '../db.js';
import { requireAdmin } from '../auth.js';
import { csrfProtect } from '../csrf.js';
import { allBanners, getBanner } from '../banners.js';
import { baseUrl } from '../config.js';
import { THEMES } from '../themes.js';
import { AVATAR_SHAPES, FONTS } from '../personalize.js';
import { MAX_LINKS, getLinks } from '../links.js';
import { collectProfileInput, validateProfileInput, saveProfileEdit } from '../profiles.js';
import { submitUrls } from '../indexnow.js';
import { notifyWalletUpdate } from '../wallet/index.js';

const router = Router();

const PHOTO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, Boolean(PHOTO_EXT[file.mimetype])),
});

const PAGE_SIZE = 20;
const getProfileById = (id) => db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);

// --- Визитки (всички профили) ---------------------------------------------

router.get('/admin', requireAdmin, (req, res) => {
  const q = String(req.query.q || '')
    .trim()
    .slice(0, 80);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const like = q ? `%${q}%` : '%';
  const where = 'WHERE p.display_name LIKE @like OR p.slug LIKE @like OR u.email LIKE @like';
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM profiles p JOIN users u ON u.id = p.user_id ${where}`)
    .get({ like }).n;
  const profiles = db
    .prepare(
      `SELECT p.*, u.email AS owner_email FROM profiles p JOIN users u ON u.id = p.user_id
       ${where} ORDER BY p.updated_at DESC LIMIT @limit OFFSET @offset`
    )
    .all({ like, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  res.render('admin-profiles', {
    title: 'Админ · Визитки',
    adminTab: 'profiles',
    profiles,
    q,
    page,
    pageSize: PAGE_SIZE,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    base: baseUrl(req),
    saved: req.query.saved === '1',
  });
});

// Скрий/покажи визитка (админ превключвател на видимостта).
router.post('/admin/profiles/:id/visibility', requireAdmin, csrfProtect, (req, res) => {
  const profile = getProfileById(Number(req.params.id));
  if (!profile) return res.redirect('/admin/reklami');
  db.prepare(
    "UPDATE profiles SET is_public = 1 - is_public, updated_at = datetime('now') WHERE id = ?"
  ).run(profile.id);
  const updated = getProfileById(profile.id);
  if (updated.is_public) {
    const base = baseUrl(req);
    submitUrls(base, [`${base}/p/${updated.slug}`]);
  }
  notifyWalletUpdate(updated, baseUrl(req));
  res.redirect(`/admin${req.query.q ? `?q=${encodeURIComponent(req.query.q)}` : ''}`);
});

const renderAdminEdit = (req, res, profile, extra = {}) =>
  res.render('admin-profile-edit', {
    title: `Админ · ${profile.display_name}`,
    adminTab: 'profiles',
    profile,
    owner_email:
      profile.owner_email ||
      db.prepare('SELECT email FROM users WHERE id = ?').get(profile.user_id)?.email,
    links: getLinks(profile.id),
    themes: THEMES,
    shapes: AVATAR_SHAPES,
    fonts: FONTS,
    maxLinks: MAX_LINKS,
    publicUrl: `${baseUrl(req)}/p/${profile.slug}`,
    saved: req.query.saved === '1',
    error: null,
    ...extra,
  });

// Форма за редакция на конкретна визитка.
router.get('/admin/profiles/:id/edit', requireAdmin, (req, res) => {
  const profile = getProfileById(Number(req.params.id));
  if (!profile) return res.status(404).render('404', { title: 'Няма такава визитка' });
  renderAdminEdit(req, res, profile);
});

// Запис на редакцията (същата валидация като таблото, но по id).
router.post('/admin/profiles/:id', requireAdmin, csrfProtect, (req, res) => {
  const profile = getProfileById(Number(req.params.id));
  if (!profile) return res.status(404).render('404', { title: 'Няма такава визитка' });
  const input = collectProfileInput(req.body);
  const error = validateProfileInput(input, profile.id);
  if (error)
    return renderAdminEdit(
      req,
      res.status(400),
      {
        ...profile,
        ...input.fields,
        type: input.type,
        is_public: input.isPublic,
        theme: input.theme,
        accent: input.accent,
        avatar_shape: input.avatarShape,
        font: input.font,
        slug: input.slug,
      },
      { error }
    );

  saveProfileEdit(profile.id, input);
  const updated = getProfileById(profile.id);
  if (updated.is_public) {
    const base = baseUrl(req);
    submitUrls(base, [`${base}/p/${updated.slug}`]);
  }
  notifyWalletUpdate(updated, baseUrl(req));
  res.redirect(`/admin/profiles/${profile.id}/edit?saved=1`);
});

// Смяна на снимката/коричната снимка от админа.
function adminSetImage(req, res, column) {
  const profile = getProfileById(Number(req.params.id));
  if (!profile) return res.redirect('/admin/reklami');
  if (!req.file) return res.redirect(`/admin/profiles/${profile.id}/edit`);
  const filename = `${crypto.randomBytes(16).toString('hex')}.${PHOTO_EXT[req.file.mimetype]}`;
  fs.writeFileSync(join(UPLOADS_DIR, filename), req.file.buffer);
  deleteImage(profile[column]);
  db.prepare(`UPDATE profiles SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`).run(
    filename,
    profile.id
  );
  res.redirect(`/admin/profiles/${profile.id}/edit?saved=1`);
}
function adminClearImage(req, res, column) {
  const profile = getProfileById(Number(req.params.id));
  if (!profile) return res.redirect('/admin/reklami');
  deleteImage(profile[column]);
  db.prepare(`UPDATE profiles SET ${column} = '', updated_at = datetime('now') WHERE id = ?`).run(
    profile.id
  );
  res.redirect(`/admin/profiles/${profile.id}/edit?saved=1`);
}

router.post(
  '/admin/profiles/:id/photo',
  requireAdmin,
  photoUpload.single('photo'),
  csrfProtect,
  (req, res) => adminSetImage(req, res, 'photo')
);
router.post('/admin/profiles/:id/photo/delete', requireAdmin, csrfProtect, (req, res) =>
  adminClearImage(req, res, 'photo')
);
router.post(
  '/admin/profiles/:id/cover',
  requireAdmin,
  photoUpload.single('cover'),
  csrfProtect,
  (req, res) => adminSetImage(req, res, 'cover')
);
router.post('/admin/profiles/:id/cover/delete', requireAdmin, csrfProtect, (req, res) =>
  adminClearImage(req, res, 'cover')
);

// --- Рекламни банери -------------------------------------------------------

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

router.get('/admin/reklami', requireAdmin, (req, res) => {
  res.render('admin', {
    title: 'Админ · Реклами',
    adminTab: 'banners',
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
      adminTab: 'banners',
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
  res.redirect('/admin/reklami?saved=1');
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
      adminTab: 'banners',
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
  res.redirect('/admin/reklami?saved=1');
});

// Включване/изключване с един бутон.
router.post('/admin/banners/:id/toggle', requireAdmin, csrfProtect, (req, res) => {
  db.prepare('UPDATE banners SET is_active = 1 - is_active WHERE id = ?').run(
    Number(req.params.id)
  );
  res.redirect('/admin/reklami?saved=1');
});

// Преместване нагоре/надолу в подредбата (размяна на sort_order със съседа).
router.post('/admin/banners/:id/move', requireAdmin, csrfProtect, (req, res) => {
  const banner = getBanner(Number(req.params.id));
  if (!banner) return res.redirect('/admin/reklami');
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
  res.redirect('/admin/reklami?saved=1');
});

router.post('/admin/banners/:id/delete', requireAdmin, csrfProtect, (req, res) => {
  const banner = getBanner(Number(req.params.id));
  if (banner) {
    deleteImage(banner.image);
    db.prepare('DELETE FROM banners WHERE id = ?').run(banner.id);
  }
  res.redirect('/admin/reklami?saved=1');
});

export default router;
