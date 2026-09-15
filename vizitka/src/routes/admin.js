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
import { prepareUpload } from '../images.js';
import { submitUrls } from '../indexnow.js';
import { notifyWalletUpdate } from '../wallet/index.js';

const router = Router();

// Форматът се определя от байтовете (виж src/images.js), не от клиентския mimetype.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

const PAGE_SIZE = 20;
const getProfileById = (id) => db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);

// --- Визитки (всички профили) ---------------------------------------------

router.get('/admin', requireAdmin, (req, res) => {
  const q = String(req.query.q || '')
    .trim()
    .slice(0, 80);
  const like = q ? `%${q}%` : '%';
  const where = 'WHERE p.display_name LIKE @like OR p.slug LIKE @like OR u.email LIKE @like';
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM profiles p JOIN users u ON u.id = p.user_id ${where}`)
    .get({ like }).n;
  // Ограничаваме страницата до реално съществуващите: иначе `?page=99999999999999999999`
  // даваше offset извън безопасните цели числа и SQLite гърмеше с 500.
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), pages);
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
    pages,
    base: baseUrl(req),
    saved: req.query.saved === '1',
    denied: req.query.denied === '1',
  });
});

// Записва админско действие върху чужда визитка (отчетност, чл. 5(2) ОРЗД).
const logAdmin = (req, profileId, action, detail = '') =>
  db
    .prepare(
      `INSERT INTO admin_audit (admin_user_id, admin_email, profile_id, action, detail)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(req.user.id, req.user.email, profileId, action, detail);

// Скрий/покажи визитка.
//
// Модерацията е ЕДНОПОСОЧНА: админът може да скрие и да върне СОБСТВЕНОТО си
// скриване, но не може да публикува визитка, която потребителят сам е скрил.
// Иначе „модерация" означаваше и право да изкараш наяве лични данни, които
// собственикът съзнателно е задържал — и то с автоматично подаване към Bing.
router.post('/admin/profiles/:id/visibility', requireAdmin, csrfProtect, (req, res) => {
  const profile = getProfileById(Number(req.params.id));
  if (!profile) return res.redirect('/admin');
  const backTo = `/admin${req.query.q ? `?q=${encodeURIComponent(req.query.q)}` : ''}`;

  if (profile.is_public) {
    db.prepare(
      `UPDATE profiles SET is_public = 0, hidden_by_admin = 1, updated_at = datetime('now')
       WHERE id = ?`
    ).run(profile.id);
    logAdmin(req, profile.id, 'hide');
  } else if (profile.hidden_by_admin) {
    db.prepare(
      `UPDATE profiles SET is_public = 1, hidden_by_admin = 0, updated_at = datetime('now')
       WHERE id = ?`
    ).run(profile.id);
    logAdmin(req, profile.id, 'unhide');
  } else {
    // Скрита е по избор на потребителя — не я публикуваме.
    return res.redirect(`${backTo}${backTo.includes('?') ? '&' : '?'}denied=1`);
  }

  const updated = getProfileById(profile.id);
  if (updated.is_public) {
    const base = baseUrl(req);
    submitUrls(base, [`${base}/p/${updated.slug}`]);
  }
  notifyWalletUpdate(updated, baseUrl(req));
  res.redirect(backTo);
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
      // Връщаме ПОДАДЕНИТЕ от потребителя връзки — иначе редакцията по бутоните
      // тихо изчезваше и формата показваше старите стойности от базата.
      { error, links: input.parsed.links }
    );

  // Същото правило като при бутона за видимост: админът не публикува визитка,
  // която потребителят сам е скрил.
  if (input.isPublic && !profile.is_public && !profile.hidden_by_admin)
    return renderAdminEdit(req, res.status(400), profile, {
      error:
        'Тази визитка е скрита по избор на потребителя — не можеш да я публикуваш от админ панела.',
    });

  saveProfileEdit(profile.id, input);
  logAdmin(req, profile.id, 'edit', `slug=${input.slug}`);
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
  if (!profile) return res.redirect('/admin');
  if (!req.file) return renderAdminEdit(req, res.status(400), profile, { error: 'Избери файл.' });
  const image = prepareUpload(req.file.buffer);
  if (!image)
    return renderAdminEdit(req, res.status(400), profile, {
      error: 'Файлът не е разпознат като снимка. Приемаме JPG, PNG или WebP до 2 MB.',
    });
  const filename = `${crypto.randomBytes(16).toString('hex')}.${image.ext}`;
  fs.writeFileSync(join(UPLOADS_DIR, filename), image.buffer);
  deleteImage(profile[column]);
  db.prepare(`UPDATE profiles SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`).run(
    filename,
    profile.id
  );
  logAdmin(req, profile.id, column);
  res.redirect(`/admin/profiles/${profile.id}/edit?saved=1`);
}
function adminClearImage(req, res, column) {
  const profile = getProfileById(Number(req.params.id));
  if (!profile) return res.redirect('/admin');
  deleteImage(profile[column]);
  db.prepare(`UPDATE profiles SET ${column} = '', updated_at = datetime('now') WHERE id = ?`).run(
    profile.id
  );
  logAdmin(req, profile.id, `${column}:delete`);
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
